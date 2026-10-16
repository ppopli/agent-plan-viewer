import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import open from 'open';
import { fileURLToPath } from 'url';
import { PlanState, BaselineCheckpoint, ReviewResult, PlanDiff } from '../core/types.js';
import { parsePlanMarkdown } from '../core/plan-parser.js';
import { serializePlanMarkdown, calculatePlanDiff, formatAgentInstructions } from '../core/plan-serializer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerOptions {
  planPath: string;
  port?: number;
  initialContent?: string;
  autoOpen?: boolean;
  onResolve?: (result: ReviewResult) => void;
}

export class PlanViewerServer {
  public app: express.Express;
  public httpServer: HttpServer;
  public wss: WebSocketServer;
  public port: number;
  public planPath: string;
  public autoOpen: boolean;
  public initialPlanState: PlanState;
  public currentPlanState: PlanState;
  public baselines: BaselineCheckpoint[] = [];
  private onResolve?: (result: ReviewResult) => void;
  private fileWatcher?: fs.FSWatcher;
  private watchDebounceTimer?: NodeJS.Timeout;
  private lastInternalWriteTime = 0;
  private lastInternalWriteContent = '';

  constructor(options: ServerOptions) {
    this.planPath = path.resolve(options.planPath);
    this.port = options.port !== undefined ? options.port : 4100;
    this.autoOpen = Boolean(options.autoOpen);
    this.onResolve = options.onResolve;

    // Load initial content
    let rawMarkdown = options.initialContent;
    if (!rawMarkdown && fs.existsSync(this.planPath)) {
      rawMarkdown = fs.readFileSync(this.planPath, 'utf-8');
    } else if (!rawMarkdown) {
      rawMarkdown = '# Implementation Plan\n\nNo plan content provided yet.';
    }

    this.lastInternalWriteContent = rawMarkdown;
    this.initialPlanState = parsePlanMarkdown(rawMarkdown);
    this.currentPlanState = JSON.parse(JSON.stringify(this.initialPlanState));

    // Baseline #0: Initial Plan
    this.baselines.push({
      id: 'baseline-0',
      timestamp: Date.now(),
      label: 'Initial Agent Plan',
      snapshot: JSON.parse(JSON.stringify(this.initialPlanState)),
    });

    this.app = express();
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer, path: '/ws' });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupFileWatcher();
  }

  private writePlanToDisk(serialized: string) {
    this.lastInternalWriteTime = Date.now();
    this.lastInternalWriteContent = serialized;
    fs.writeFileSync(this.planPath, serialized, 'utf-8');
  }

  private setupFileWatcher() {
    if (!fs.existsSync(this.planPath)) return;

    const handleFileChange = () => {
      if (this.watchDebounceTimer) {
        clearTimeout(this.watchDebounceTimer);
      }
      this.watchDebounceTimer = setTimeout(() => {
        try {
          if (!fs.existsSync(this.planPath)) return;
          // Ignore writes triggered internally within the last 500ms
          if (Date.now() - this.lastInternalWriteTime < 500) return;

          const updatedRaw = fs.readFileSync(this.planPath, 'utf-8');
          if (!updatedRaw.trim()) return;
          if (updatedRaw === this.lastInternalWriteContent) return;

          this.lastInternalWriteContent = updatedRaw;
          const freshlyParsed = parsePlanMarkdown(updatedRaw);
          this.initialPlanState = freshlyParsed;
          this.currentPlanState = JSON.parse(JSON.stringify(freshlyParsed));

          const reloadBaseline: BaselineCheckpoint = {
            id: `baseline-${Date.now()}`,
            timestamp: Date.now(),
            label: `File Reload #${this.baselines.length}`,
            snapshot: JSON.parse(JSON.stringify(this.currentPlanState)),
          };
          this.baselines.push(reloadBaseline);
          if (this.baselines.length > 10) {
            this.baselines.shift();
          }

          this.broadcast({
            type: 'PLAN_RELOADED',
            state: this.currentPlanState,
            baselines: this.baselines,
            timestamp: Date.now(),
          });

          // If no browser tabs are currently open and autoOpen is enabled, re-open the browser
          if (this.autoOpen && this.getOpenClientCount() === 0 && this.port > 0) {
            open(`http://localhost:${this.port}`).catch(() => {});
          }
        } catch {
          // Ignore transient read errors during atomic file replacement
        }
      }, 150);
    };

    try {
      this.fileWatcher = fs.watch(this.planPath, (eventType) => {
        if (eventType === 'change' || eventType === 'rename') {
          handleFileChange();
        }
      });
    } catch {
      // Fallback if fs.watch fails
    }
  }

  private getOpenClientCount(): number {
    let count = 0;
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        count++;
      }
    });
    return count;
  }

  private closeBrowserTab() {
    if (!this.autoOpen || process.platform !== 'darwin' || !this.port) return;
    const urlPrefix1 = `http://localhost:${this.port}`;
    const urlPrefix2 = `http://127.0.0.1:${this.port}`;
    const script = `
tell application "System Events"
  set runningApps to name of every process
end tell
repeat with browserName in {"Google Chrome", "Brave Browser", "Arc"}
  if runningApps contains (browserName as text) then
    try
      tell application (browserName as text)
        repeat with w in windows
          set tabList to tabs of w
          repeat with t in tabList
            set tabUrl to URL of t
            if (tabUrl starts with "${urlPrefix1}") or (tabUrl starts with "${urlPrefix2}") then
              close t
            end if
          end repeat
        end repeat
      end tell
    end try
  end if
end repeat
if runningApps contains "Safari" then
  try
    tell application "Safari"
      repeat with w in windows
        set tabList to tabs of w
        repeat with t in tabList
          set tabUrl to URL of t
          if (tabUrl starts with "${urlPrefix1}") or (tabUrl starts with "${urlPrefix2}") then
            close t
          end if
        end repeat
      end repeat
    end tell
  end try
end if
`;
    try {
      const child = execFile('osascript', ['-e', script], { timeout: 1500 }, () => {});
      child.unref();
    } catch {
      // Ignore osascript errors
    }
  }

  private setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));

    // CORS headers for local development
    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // Serve dist-web if built
    const webDistPath = path.resolve(__dirname, '../../dist-web');
    if (fs.existsSync(webDistPath)) {
      this.app.use(express.static(webDistPath));
    }
  }

  private setupRoutes() {
    // GET /api/plan
    this.app.get('/api/plan', (req, res) => {
      res.json({
        planPath: this.planPath,
        state: this.currentPlanState,
        baselines: this.baselines,
      });
    });

    // POST /api/save: Explicit Save draft
    this.app.post('/api/save', (req, res) => {
      try {
        const { planState, label } = req.body;
        if (!planState) {
          res.status(400).json({ error: 'planState is required' });
          return;
        }

        this.currentPlanState = planState;
        const serialized = serializePlanMarkdown(planState);

        // Write to disk
        this.writePlanToDisk(serialized);

        // Create baseline checkpoint
        const baselineId = `baseline-${Date.now()}`;
        const newBaseline: BaselineCheckpoint = {
          id: baselineId,
          timestamp: Date.now(),
          label: label || `Draft #${this.baselines.length}`,
          snapshot: JSON.parse(JSON.stringify(planState)),
        };

        this.baselines.push(newBaseline);
        // Cap baseline checkpoints at max depth 10
        if (this.baselines.length > 10) {
          this.baselines.shift();
        }

        this.broadcast({
          type: 'BASELINE_SAVED',
          baseline: newBaseline,
          baselines: this.baselines,
        });

        res.json({
          success: true,
          savedAt: Date.now(),
          baselineId,
          baselinesCount: this.baselines.length,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/baselines
    this.app.get('/api/baselines', (req, res) => {
      res.json({ baselines: this.baselines });
    });

    // POST /api/approve: Explicit Approve & Submit
    this.app.post('/api/approve', (req, res) => {
      try {
        const { planState, userInstructions } = req.body;
        const finalState = planState || this.currentPlanState;
        if (userInstructions) {
          finalState.userInstructions = userInstructions;
        }

        const serialized = serializePlanMarkdown(finalState);
        this.writePlanToDisk(serialized);

        const diff = calculatePlanDiff(this.initialPlanState, finalState);
        const result: ReviewResult = {
          status: 'APPROVED',
          planPath: this.planPath,
          diff,
          userInstructions: finalState.userInstructions,
          updatedMarkdown: serialized,
        };

        res.json({ success: true, result });

        this.broadcast({ type: 'REVIEW_COMPLETED', status: 'APPROVED', autoClose: true });
        this.closeBrowserTab();

        if (this.onResolve) {
          this.onResolve(result);
        }

        // Graceful shutdown after response
        setTimeout(() => this.stop(), 400);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/request-changes: Explicit Request Changes
    this.app.post('/api/request-changes', (req, res) => {
      try {
        const { planState, userInstructions } = req.body;
        const finalState = planState || this.currentPlanState;
        if (userInstructions) {
          finalState.userInstructions = userInstructions;
        }

        const serialized = serializePlanMarkdown(finalState);
        this.writePlanToDisk(serialized);

        const diff = calculatePlanDiff(this.initialPlanState, finalState);
        const result: ReviewResult = {
          status: 'CHANGES_REQUESTED',
          planPath: this.planPath,
          diff,
          userInstructions: finalState.userInstructions,
          updatedMarkdown: serialized,
        };

        res.json({ success: true, result });

        this.broadcast({ type: 'REVIEW_COMPLETED', status: 'CHANGES_REQUESTED', autoClose: true });
        this.closeBrowserTab();

        if (this.onResolve) {
          this.onResolve(result);
        }

        setTimeout(() => this.stop(), 400);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Fallback route for SPA
    this.app.get('*', (req, res) => {
      const webIndexPath = path.resolve(__dirname, '../../dist-web/index.html');
      if (fs.existsSync(webIndexPath)) {
        res.sendFile(webIndexPath);
      } else {
        res.send(`
          <!DOCTYPE html>
          <html>
            <head><title>Agent Plan Viewer</title></head>
            <body style="font-family: system-ui; padding: 40px; background: #0f172a; color: #f8fafc;">
              <h2>Agent Plan Viewer Server Running on Port ${this.port}</h2>
              <p>Plan file: <code>${this.planPath}</code></p>
              <p>Web frontend is currently in development mode. Run <code>npm run dev:web</code> or <code>npm run build:web</code>.</p>
            </body>
          </html>
        `);
      }
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket) => {
      ws.send(JSON.stringify({
        type: 'INIT',
        state: this.currentPlanState,
        baselines: this.baselines,
      }));
    });
  }

  public broadcast(message: any) {
    const data = JSON.stringify(message);
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, () => {
        const addr = this.httpServer.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        resolve(this.port);
      }).on('error', (err: any) => {
        reject(err);
      });
    });
  }

  public stop(): Promise<void> {
    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
    }
    if (this.fileWatcher) {
      try {
        this.fileWatcher.close();
      } catch {
        // Ignore close errors
      }
    }
    return new Promise((resolve) => {
      this.wss.close();
      this.httpServer.close(() => resolve());
    });
  }
}
