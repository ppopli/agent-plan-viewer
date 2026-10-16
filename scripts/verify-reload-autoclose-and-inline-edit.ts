import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { PlanViewerServer } from '../src/cli/server.js';
import { ReviewResult } from '../src/core/types.js';

const ARTIFACT_DIR = '/Users/pulkitpopli/.gemini/antigravity-cli/brain/e9d04427-44fc-41a1-b45c-8c034f707a1c';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apv-inline-test-'));
  const mdPath = path.join(tmpDir, 'system-spec.md');

  const initialMarkdown = `# Distributed Rate Limiter Specification

## Overview
This document defines the **sliding-window rate limiter** architecture and operational SLAs.

## Key System Specifications & Sizing
| Parameter | Target Value | Notes |
| :--- | :--- | :--- |
| Max Throughput | 10,000 req/sec | Redis Lua atomic script |
| P99 Latency | < 3ms | Local edge POP evaluation |

## Operational Runbook
- Monitor **Redis cluster memory fragmentation** every 5 minutes.
- Configure fallback **token-bucket local cache** if Redis latency exceeds \`15ms\`.
`;

  fs.writeFileSync(mdPath, initialMarkdown, 'utf-8');

  let resolvedResult: ReviewResult | null = null;
  const server = new PlanViewerServer({
    planPath: mdPath,
    port: 0,
    autoOpen: false,
    onResolve: (res) => {
      resolvedResult = res;
    },
  });

  const port = await server.start();
  const url = `http://localhost:${port}`;
  console.log(`Started test server at ${url}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });

    // Track whether window.close() was invoked on submit
    await page.evaluateOnNewDocument(() => {
      (window as any).__windowCloseCalled = false;
      window.close = () => {
        (window as any).__windowCloseCalled = true;
      };
    });

    await page.goto(url, { waitUntil: 'networkidle0' });

    // 1. Activate "Edit Lines Inline" on the first section card in Document Sections & Inline Editor
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const editLinesBtn = buttons.find((b) => b.textContent?.includes('Edit Lines Inline'));
      if (editLinesBtn) editLinesBtn.click();
    });
    await new Promise((r) => setTimeout(r, 250));

    // Click the line containing "10,000 req/sec" to open the inline line editor
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('div[title*="Click to edit line"]'));
      const targetRow = rows.find((r) => r.textContent?.includes('10,000 req/sec'));
      if (targetRow) (targetRow as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 250));

    // Capture screenshot showing inline line editing active inside a section card
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'inline_01_section_line_editor.png'),
    });

    // Update the line value and click Save
    const lineInput = await page.$('input[value*="10,000 req/sec"]');
    if (!lineInput) {
      throw new Error('Inline line input not found');
    }
    await page.evaluate(() => {
      const inp = document.querySelector('input[value*="10,000 req/sec"]') as HTMLInputElement;
      if (inp) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        nativeSetter?.call(
          inp,
          '| Max Throughput | **50,000 req/sec** | Upgraded Redis Cluster Shards |'
        );
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.evaluate(() => {
      const saveBtn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.getAttribute('title') === 'Save line (Enter)'
      );
      if (saveBtn) saveBtn.click();
    });
    await new Promise((r) => setTimeout(r, 300));

    // 2. Switch to "Line-by-Line Inline Editor" mode and capture screenshot
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Line-by-Line Inline Editor')
      );
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'inline_02_universal_line_by_line_mode.png'),
    });

    // Switch back to Structured & Section Editor
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Structured & Section Editor')
      );
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 250));

    // 3. Test Live Auto-Reload when markdown file is updated on disk
    const externallyUpdatedMarkdown = initialMarkdown.replace(
      '10,000 req/sec',
      '100,000 req/sec (Live Reloaded from Disk)'
    );
    fs.writeFileSync(mdPath, externallyUpdatedMarkdown, 'utf-8');

    // Wait for file watcher debounce (150ms) + WebSocket broadcast
    await new Promise((r) => setTimeout(r, 600));

    const reloadBannerText = await page.evaluate(() => {
      return document.body.innerText.includes('Document updated on disk — automatically reloaded latest version');
    });
    const updatedContentPresent = await page.evaluate(() => {
      return document.body.innerText.includes('100,000 req/sec (Live Reloaded from Disk)');
    });
    console.log('Live Reload Banner Displayed:', reloadBannerText);
    console.log('Live Reloaded Content Rendered:', updatedContentPresent);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'inline_03_live_reload_banner.png'),
    });

    if (!reloadBannerText || !updatedContentPresent) {
      throw new Error('Live reload on external file change did not update the browser view');
    }

    // 4. Test Auto-Close on Approve & Submit
    await page.evaluate(() => {
      const approveBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Approve & Submit')
      );
      if (approveBtn) approveBtn.click();
    });

    await new Promise((r) => setTimeout(r, 500));

    const windowCloseCalled = await page.evaluate(() => (window as any).__windowCloseCalled);
    console.log('window.close() called automatically on Approve:', windowCloseCalled);
    console.log('Server resolved status:', resolvedResult?.status);

    if (!windowCloseCalled) {
      throw new Error('Expected window.close() to be called automatically after Approve & Submit');
    }
    if (resolvedResult?.status !== 'APPROVED') {
      throw new Error('Expected server to resolve with status APPROVED');
    }
  } finally {
    await browser.close();
    await server.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
