import { expect, test } from '@playwright/test';

test('keeps text visible after applying a toolbar text color', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop toolbar behavior');

  const title = `颜色实时渲染-${Date.now()}-${testInfo.workerIndex}`;
  const content = '这一行改色后仍然应该可见';

  await page.goto('/');
  await page
    .getByRole('region', { name: '笔记目录' })
    .getByRole('button', { name: '新建文档' })
    .click();
  await page.getByLabel('文档标题').fill(title);
  await page.getByRole('button', { name: '确认' }).click();

  const editor = page.locator('.ProseMirror');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.insertText(content);
  await page.keyboard.press('Shift+Home');

  const toolbar = page.locator('.milkdown-toolbar');
  await expect(toolbar).toBeVisible();
  await toolbar.locator('.toolbar-item').nth(6).hover();
  const colorMenu = page.getByRole('menu', { name: '颜色' });
  await expect(colorMenu).toBeVisible();
  await colorMenu
    .locator('.toolbar-color-swatch[data-style-kind="color"][data-style-value="#ef4444"]')
    .click();

  await expect(editor.getByText(content)).toBeVisible();
  const styledText = editor.locator('span[style*="color"]').filter({
    hasText: content,
  });
  await expect(styledText).toBeVisible();
});
