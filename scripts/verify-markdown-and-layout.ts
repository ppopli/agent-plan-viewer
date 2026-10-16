import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { PlanViewerServer } from '../src/cli/server.js';

const ARTIFACT_DIR = '/Users/pulkitpopli/.gemini/antigravity-cli/brain/e9d04427-44fc-41a1-b45c-8c034f707a1c';
const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'test-results/screenshots');

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-verify-'));
  const planPath = path.join(tmpDir, 'notification-system-plan.md');
  fs.copyFileSync(
    '/Users/pulkitpopli/.gemini/antigravity-cli/brain/8791cb50-373a-4ba4-851e-3764ab8756ba/notification-system-plan.md',
    planPath
  );

  const port = 4150;
  const server = new PlanViewerServer({
    planPath,
    port,
    mode: 'serve',
  });
  await server.start();

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1100'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1100 });
    await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle0' });
    await delay(800);

    // 1. Screenshot Plan & Tasks (top: Execution Target & Tasks)
    const shotPlanTop = path.join(ARTIFACT_DIR, 'fixed_01_plan_markdown_rendering.png');
    await page.screenshot({ path: shotPlanTop });
    fs.copyFileSync(shotPlanTop, path.join(SCREENSHOTS_DIR, 'fixed_01_plan_markdown_rendering.png'));

    // Scroll down to Specifications Table & Verification Plan
    await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h2'));
      const specHeading = headings.find((h) => h.textContent?.includes('Specifications, Sizing'));
      if (specHeading) {
        specHeading.scrollIntoView({ behavior: 'instant', block: 'start' });
        window.scrollBy(0, -120);
      } else {
        window.scrollBy(0, 1750);
      }
    });
    await delay(400);
    const shotPlanSpecs = path.join(ARTIFACT_DIR, 'fixed_02_specs_table_and_files.png');
    await page.screenshot({ path: shotPlanSpecs });
    fs.copyFileSync(shotPlanSpecs, path.join(SCREENSHOTS_DIR, 'fixed_02_specs_table_and_files.png'));

    // Scroll back to top and switch to Diagram Canvas
    await page.evaluate(() => window.scrollTo(0, 0));
    await delay(300);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const diagBtn = btns.find((b) => b.textContent && b.textContent.includes('Diagram Canvas'));
      if (diagBtn) (diagBtn as HTMLElement).click();
    });
    await delay(900);

    // Check for any node bounding-box overlaps on the Diagram Canvas
    const overlapReport = await page.evaluate(() => {
      const nodeEls = Array.from(document.querySelectorAll('.react-flow__node'));
      const rects = nodeEls.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute('data-id'),
          text: (el as HTMLElement).innerText.replace(/\n+/g, ' | '),
          left: Math.round(r.left),
          top: Math.round(r.top),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      });

      const overlaps: string[] = [];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          if (xOverlap > 0 && yOverlap > 0) {
            overlaps.push(`${a.id} overlaps ${b.id} by ${xOverlap}x${yOverlap}px`);
          }
        }
      }
      return { nodeCount: rects.length, overlaps, rects };
    });

    console.log(`Diagram Canvas Node Count: ${overlapReport.nodeCount}`);
    console.log(`Overlapping Node Pairs: ${overlapReport.overlaps.length}`);
    if (overlapReport.overlaps.length > 0) {
      console.error('Overlaps detected:', overlapReport.overlaps);
      process.exitCode = 1;
    }

    const shotDiagram = path.join(ARTIFACT_DIR, 'fixed_03_diagram_canvas_clean_layout.png');
    await page.screenshot({ path: shotDiagram });
    fs.copyFileSync(shotDiagram, path.join(SCREENSHOTS_DIR, 'fixed_03_diagram_canvas_clean_layout.png'));
  } finally {
    await browser.close();
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
