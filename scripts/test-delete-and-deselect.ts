import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = '/Users/pulkitpopli/.gemini/antigravity-cli/brain/e9d04427-44fc-41a1-b45c-8c034f707a1c';
const APP_URL = 'http://localhost:4100';

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTest() {
  console.log('🚀 Running Delete & Deselect Validation with Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,1050'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1050 });

  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await delay(1000);

  // 1. Switch to Diagram Canvas
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const diagTab = tabs.find((b) => b.textContent && b.textContent.includes('Diagram Canvas'));
    if (diagTab) (diagTab as HTMLElement).click();
  });
  await delay(800);

  // Check 1: Initially, Delete button should be disabled
  const initialDeleteBtnState = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const delBtn = btns.find((b) => b.textContent && b.textContent.includes('Delete'));
    if (!delBtn) return { found: false };
    return {
      found: true,
      text: delBtn.textContent?.trim(),
      disabled: (delBtn as HTMLButtonElement).disabled,
    };
  });
  console.log('  1. Initial Delete button state:', initialDeleteBtnState);

  // Check 2: Click on an edge
  const edgeCountBefore = await page.evaluate(() => {
    return document.querySelectorAll('.react-flow__edge').length;
  });
  console.log('  Edge count before:', edgeCountBefore);

  // Click on the first edge
  const edgeClicked = await page.evaluate(() => {
    const edges = Array.from(document.querySelectorAll('.react-flow__edge'));
    if (edges.length > 0) {
      // Find the path inside the edge
      const pathEl = edges[0].querySelector('path');
      if (pathEl) {
        const rect = pathEl.getBoundingClientRect();
        const evt = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        });
        pathEl.dispatchEvent(evt);
        return true;
      }
    }
    return false;
  });
  console.log('  2. Clicked edge:', edgeClicked);
  await delay(400);

  const edgeSelectedDeleteBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const delBtn = btns.find((b) => b.textContent && b.textContent.includes('Delete'));
    return {
      text: delBtn?.textContent?.trim(),
      disabled: (delBtn as HTMLButtonElement)?.disabled,
    };
  });
  console.log('  Delete button state after edge click:', edgeSelectedDeleteBtn);

  // Capture screenshot of edge selected with enabled Delete button
  const screenshotEdgeSelected = path.join(ARTIFACT_DIR, 'test_edge_selected_delete_enabled.png');
  await page.screenshot({ path: screenshotEdgeSelected });

  // Check 3: Click outside (on the canvas pane background)
  console.log('  3. Clicking outside on the canvas pane...');
  await page.evaluate(() => {
    const pane = document.querySelector('.react-flow__pane');
    if (pane) {
      const rect = pane.getBoundingClientRect();
      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 50,
        clientY: rect.top + 50,
      });
      pane.dispatchEvent(evt);
    }
  });
  await delay(400);

  const afterDeselectBtnState = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const delBtn = btns.find((b) => b.textContent && b.textContent.includes('Delete'));
    return {
      text: delBtn?.textContent?.trim(),
      disabled: (delBtn as HTMLButtonElement)?.disabled,
    };
  });
  console.log('  Delete button state after clicking outside (deselected):', afterDeselectBtnState);

  // Capture screenshot of deselected edge with disabled Delete button
  const screenshotDeselected = path.join(ARTIFACT_DIR, 'test_edge_deselected_delete_disabled.png');
  await page.screenshot({ path: screenshotDeselected });

  // Check 4: Click edge again and click the Delete Connection button
  console.log('  4. Selecting edge again and clicking Delete Connection button...');
  await page.evaluate(() => {
    const edges = Array.from(document.querySelectorAll('.react-flow__edge'));
    if (edges.length > 0) {
      const pathEl = edges[0].querySelector('path');
      if (pathEl) {
        const rect = pathEl.getBoundingClientRect();
        const evt = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        });
        pathEl.dispatchEvent(evt);
      }
    }
  });
  await delay(400);

  // Click the Delete button
  const deletedEdgeSuccess = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const delBtn = btns.find((b) => b.textContent && b.textContent.includes('Delete Connection'));
    if (delBtn && !(delBtn as HTMLButtonElement).disabled) {
      (delBtn as HTMLElement).click();
      return true;
    }
    return false;
  });
  console.log('  Clicked Delete Connection button:', deletedEdgeSuccess);
  await delay(500);

  const edgeCountAfter = await page.evaluate(() => {
    return document.querySelectorAll('.react-flow__edge').length;
  });
  console.log(`  Edge count after deletion: ${edgeCountAfter} (was ${edgeCountBefore})`);

  // Check 5: Node selection and deletion
  console.log('  5. Selecting a node...');
  const nodeCountBefore = await page.evaluate(() => {
    return document.querySelectorAll('.react-flow__node').length;
  });
  console.log('  Node count before:', nodeCountBefore);

  await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.react-flow__node'));
    if (nodes.length > 0) {
      (nodes[nodes.length - 1] as HTMLElement).click();
    }
  });
  await delay(400);

  const nodeSelectedDeleteBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const delBtn = btns.find((b) => b.textContent && b.textContent.includes('Delete'));
    return {
      text: delBtn?.textContent?.trim(),
      disabled: (delBtn as HTMLButtonElement)?.disabled,
    };
  });
  console.log('  Delete button state after node click:', nodeSelectedDeleteBtn);

  // Capture screenshot of node selected with "Delete Component" button
  const screenshotNodeSelected = path.join(ARTIFACT_DIR, 'test_node_selected_delete_enabled.png');
  await page.screenshot({ path: screenshotNodeSelected });

  // Click Delete Component button
  console.log('  Clicking Delete Component button...');
  const deletedNodeSuccess = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const delBtn = btns.find((b) => b.textContent && b.textContent.includes('Delete Component'));
    if (delBtn && !(delBtn as HTMLButtonElement).disabled) {
      (delBtn as HTMLElement).click();
      return true;
    }
    return false;
  });
  console.log('  Clicked Delete Component button:', deletedNodeSuccess);
  await delay(500);

  const nodeCountAfter = await page.evaluate(() => {
    return document.querySelectorAll('.react-flow__node').length;
  });
  console.log(`  Node count after deletion: ${nodeCountAfter} (was ${nodeCountBefore})`);

  // Check 6: Switch back to Document View and verify audit instructions
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const docTab = tabs.find((b) => b.textContent && b.textContent.includes('Plan & Tasks'));
    if (docTab) (docTab as HTMLElement).click();
  });
  await delay(600);

  const feedbackText = await page.$eval(
    'textarea[placeholder*="e.g. Ensure connection pooling"]',
    (el: any) => el.value || ''
  );
  console.log('  Audit feedback text captured:\n' + feedbackText);

  const hasEdgeAudit = feedbackText.includes('Removed diagram connection');
  const hasNodeAudit = feedbackText.includes('Removed diagram component');
  console.log(`  ✓ Edge deletion logged: ${hasEdgeAudit}`);
  console.log(`  ✓ Node deletion logged: ${hasNodeAudit}`);

  const screenshotFinalAudit = path.join(ARTIFACT_DIR, 'test_final_audit_feedback_after_deletions.png');
  await page.screenshot({ path: screenshotFinalAudit, fullPage: true });

  await browser.close();

  const allPassed =
    initialDeleteBtnState.disabled === true &&
    edgeSelectedDeleteBtn.text === 'Delete Connection' &&
    edgeSelectedDeleteBtn.disabled === false &&
    afterDeselectBtnState.text === 'Delete' &&
    afterDeselectBtnState.disabled === true &&
    deletedEdgeSuccess === true &&
    edgeCountAfter < edgeCountBefore &&
    nodeSelectedDeleteBtn.text === 'Delete Component' &&
    nodeSelectedDeleteBtn.disabled === false &&
    deletedNodeSuccess === true &&
    nodeCountAfter < nodeCountBefore &&
    hasEdgeAudit &&
    hasNodeAudit;

  console.log('\n========================================');
  console.log('OVERALL TEST RESULT:', allPassed ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED');
  console.log('========================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runTest().catch((e) => {
  console.error('Test run failed:', e);
  process.exit(1);
});
