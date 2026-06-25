import { expect, test } from '@playwright/test';

test('creates, autosaves, reloads, and searches a Markdown note', async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name === 'mobile' ? '手机' : '桌面';
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const title = `端到端笔记-${suffix}-${runId}`;
  const content = `卷积网络实验记录-${suffix}-${runId}`;

  await page.goto('/');
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: '打开目录' }).click();
  }
  await page
    .getByRole('region', { name: '笔记目录' })
    .getByRole('button', { name: '新建文档' })
    .click();
  await page.getByLabel('文档标题').fill(title);
  await page.getByRole('button', { name: '确认' }).click();

  const editor = page.locator('.ProseMirror');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type(content);
  await expect(page.locator('.save-state.pending')).toBeVisible();
  await expect(page.locator('.save-state.saved')).toBeVisible({ timeout: 8_000 });

  await page.reload();
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: '打开目录' }).click();
  }
  await page.getByText(title, { exact: true }).click();
  await expect(page.getByLabel('文档标题')).toHaveValue(title);
  await expect(page.locator('.ProseMirror')).toContainText(content);
  await page.screenshot({
    path: `test-results/visual-${testInfo.project.name}.png`,
    fullPage: true,
  });

  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: '打开目录' }).click();
  }
  await page.getByRole('button', { name: '搜索' }).click();
  await page.getByPlaceholder('搜索标题和正文').fill('卷积网络');
  const results = page.locator('.result-list');
  await expect(results.getByText(title, { exact: true })).toBeVisible();
  await expect(results.getByText(new RegExp(content))).toBeVisible();
});
