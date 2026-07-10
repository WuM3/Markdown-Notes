import { expect, test } from '@playwright/test';

test('marquee selection keeps a wrapped paragraph trimmed to covered rows', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop marquee behavior');

  const title = `框选行级选区-${Date.now()}-${testInfo.workerIndex}`;
  const paragraph =
    'START-不应该被框选到的开头内容。' +
    '中间内容需要足够长，用来稳定产生多行换行，并且蓝色框只覆盖其中一行。'.repeat(6) +
    'END-不应该被框选到的结尾内容。';

  await page.goto('/');
  await page.addStyleTag({
    content: '.markdown-editor .ProseMirror { width: 420px !important; max-width: 420px !important; }',
  });
  await page
    .getByRole('region', { name: '笔记目录' })
    .getByRole('button', { name: '新建文档' })
    .click();
  await page.getByLabel('文档标题').fill(title);
  await page.getByRole('button', { name: '确认' }).click();

  const editor = page.locator('.ProseMirror');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.insertText(paragraph);
  await editor.evaluate((element) => (element as HTMLElement).blur());
  await expect(editor).not.toBeFocused();

  const lineRects = await editor.locator('p').first().evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top,
      }));
    range.detach();
    return rects;
  });
  expect(lineRects.length).toBeGreaterThan(2);

  const targetLine = lineRects[Math.floor(lineRects.length / 2)];
  const canvasBox = await page.locator('.document-canvas').boundingBox();
  expect(canvasBox).not.toBeNull();
  if (!canvasBox || !targetLine) return;

  await page.mouse.move(
    Math.max(canvasBox.x + 8, targetLine.left - 80),
    targetLine.top - 3,
  );
  await page.mouse.down();
  await page.mouse.move(targetLine.right + 12, targetLine.bottom + 3, {
    steps: 8,
  });
  await expect(page.locator('.editor-marquee-selection[data-active="true"]')).toBeVisible();
  await page.mouse.up();

  const selectedText = await page.evaluate(() =>
    window.getSelection()?.toString().replace(/\s+/g, '') ?? '',
  );
  const fullText = paragraph.replace(/\s+/g, '');
  expect(selectedText.length).toBeGreaterThan(0);
  expect(selectedText.length).toBeLessThan(fullText.length * 0.75);
  expect(selectedText).not.toBe(fullText);
  await expect(page.locator('.milkdown-toolbar')).toBeVisible();
});
