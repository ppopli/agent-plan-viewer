import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = '/Users/pulkitpopli/.gemini/antigravity-cli/brain/e9d04427-44fc-41a1-b45c-8c034f707a1c';
const APP_URL = 'http://localhost:4100';

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function capture() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,1050'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1050 });

  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await delay(1000);

  // 1. Edit Execution Target
  const editBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((el) => el.textContent && el.textContent.includes('Edit Target'));
    if (b) {
      (b as HTMLElement).click();
      return true;
    }
    return false;
  });
  await delay(400);

  const titleInput = await page.$('input[placeholder="Plan Goal Title"]');
  if (titleInput) {
    await titleInput.click({ clickCount: 3 });
    await titleInput.press('Backspace');
    await titleInput.type('E-Commerce Order Processing Architecture v2 (Distributed Lock)');
    await delay(200);
  }

  const descTextarea = await page.$('textarea[placeholder*="Describe what the plan accomplishes"]');
  if (descTextarea) {
    await descTextarea.click({ clickCount: 3 });
    await descTextarea.press('Backspace');
    await descTextarea.type('Atomic order placement with Redis distributed lock TTL 3000ms, inventory rollback, and Dead Letter Queue failover.');
    await delay(200);
  }

  // Click Done Editing
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((el) => el.textContent && el.textContent.includes('Done Editing'));
    if (b) (b as HTMLElement).click();
  });
  await delay(400);

  // 2. Add an inline note to task #2
  const noteBtns = await page.$$('button[title*="Add inline feedback note"]');
  if (noteBtns.length > 1) {
    await noteBtns[1].click();
    await delay(300);
    const noteInput = await page.$('input[placeholder*="Add specific instructions"]');
    if (noteInput) {
      await noteInput.type('Ensure Redis distributed lock TTL is set to 3000ms.');
      await delay(200);
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const s = btns.find((b) => b.textContent && b.textContent.includes('Save'));
        if (s) (s as HTMLElement).click();
      });
      await delay(300);
    }
  }

  // 3. Toggle task 1
  const toggleBtns = await page.$$('button[title="Toggle task completion"]');
  if (toggleBtns.length > 0) {
    await toggleBtns[0].click();
    await delay(300);
  }

  // 4. Switch to Diagram Canvas and add component
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const diagTab = tabs.find((b) => b.textContent && b.textContent.includes('Diagram Canvas'));
    if (diagTab) (diagTab as HTMLElement).click();
  });
  await delay(600);

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const dbBtn = btns.find((b) => b.textContent && b.textContent.trim().includes('DB'));
    if (dbBtn) (dbBtn as HTMLElement).click();
  });
  await delay(400);

  // Switch back to Document View to view the full Agent Instructions card
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const docTab = tabs.find((b) => b.textContent && b.textContent.includes('Plan & Tasks'));
    if (docTab) (docTab as HTMLElement).click();
  });
  await delay(600);

  // Scroll to make sure both Execution Target, tasks and Agent Instructions are highlighted
  const screenshotPath1 = path.join(ARTIFACT_DIR, 'demo_target_inline_edit_and_feedback.png');
  await page.screenshot({ path: screenshotPath1, fullPage: true });
  console.log(`Saved screenshot 1: ${screenshotPath1}`);

  // 5. Switch to Diff & Prompt tab to see Execution Target & Scope Changes card
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const diffTab = tabs.find((b) => b.textContent && b.textContent.includes('Diff & Prompt'));
    if (diffTab) (diffTab as HTMLElement).click();
  });
  await delay(600);

  const screenshotPath2 = path.join(ARTIFACT_DIR, 'demo_diff_preview_with_goal_changes.png');
  await page.screenshot({ path: screenshotPath2, fullPage: true });
  console.log(`Saved screenshot 2: ${screenshotPath2}`);

  await browser.close();
}

capture().catch((e) => {
  console.error(e);
  process.exit(1);
});
