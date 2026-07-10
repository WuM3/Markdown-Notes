import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test('exports the latest unsaved draft from the editor header', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop download regression');

  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const initialTitle = `立即导出-${runId}`;
  const latestTitle = `尚未保存-${runId}`;
  const latestContent = `LAST-UNSAVED-INPUT-${runId}`;

  await page.goto('/');
  await page
    .getByRole('region', { name: '笔记目录' })
    .getByRole('button', { name: '新建文档' })
    .click();
  await page.getByLabel('文档标题').fill(initialTitle);
  await page.getByRole('button', { name: '确认' }).click();

  const titleInput = page.locator('.document-title');
  await expect(titleInput).toBeVisible();
  await titleInput.fill(latestTitle);
  await expect(titleInput).toHaveValue(latestTitle);
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.insertText(latestContent);
  await expect(page.locator('.save-state.pending')).toBeVisible();

  const download = await downloadFormat(page, 'Markdown');
  expect(download.suggestedFilename()).toBe(`${latestTitle}.md`);
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  if (!filePath) return;
  const markdown = await readFile(filePath, 'utf8');
  expect(markdown).toContain(`title: ${latestTitle}`);
  expect(markdown).toContain(latestContent);
});

test('downloads non-empty DOCX and PDF files', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop download regression');

  const title = `格式导出-${Date.now()}-${testInfo.workerIndex}`;
  await page.goto('/');
  await page
    .getByRole('region', { name: '笔记目录' })
    .getByRole('button', { name: '新建文档' })
    .click();
  await page.getByLabel('文档标题').fill(title);
  await page.getByRole('button', { name: '确认' }).click();
  await page.locator('.ProseMirror').click();
  await page.keyboard.insertText('中文导出正文');

  const word = await downloadFormat(page, 'Word');
  expect(word.suggestedFilename()).toBe(`${title}.docx`);
  const wordPath = await word.path();
  expect(wordPath).not.toBeNull();
  if (wordPath) {
    expect((await readFile(wordPath)).subarray(0, 2).toString()).toBe('PK');
  }

  const pdf = await downloadFormat(page, 'PDF');
  expect(pdf.suggestedFilename()).toBe(`${title}.pdf`);
  const pdfPath = await pdf.path();
  expect(pdfPath).not.toBeNull();
  if (pdfPath) {
    expect((await readFile(pdfPath)).subarray(0, 5).toString()).toBe('%PDF-');
  }
});

test('uses an icon-only export trigger on a phone without overflowing', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile export layout');

  await page.goto('/');
  await page.getByRole('button', { name: '打开目录' }).click();
  await page
    .getByRole('region', { name: '笔记目录' })
    .getByRole('button', { name: '新建文档' })
    .click();
  await page.getByLabel('文档标题').fill(`手机导出-${Date.now()}`);
  await page.getByRole('button', { name: '确认' }).click();

  const exportButton = page.getByRole('button', { name: '导出', exact: true });
  await expect(exportButton).toBeVisible();
  const layout = await exportButton.evaluate((element) => {
    const label = element.querySelector('span');
    return {
      buttonWidth: element.getBoundingClientRect().width,
      labelDisplay: label ? getComputedStyle(label).display : '',
      headerScrollWidth: element.parentElement?.scrollWidth ?? 0,
      headerClientWidth: element.parentElement?.clientWidth ?? 0,
    };
  });
  expect(layout.buttonWidth).toBeLessThanOrEqual(40);
  expect(layout.labelDisplay).toBe('none');
  expect(layout.headerScrollWidth).toBeLessThanOrEqual(layout.headerClientWidth + 1);
});

async function downloadFormat(page: Page, label: 'Markdown' | 'Word' | 'PDF') {
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  return downloadPromise;
}
