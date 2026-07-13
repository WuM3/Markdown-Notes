import { expect, test } from '@playwright/test';

test('keeps selection toolbar icons aligned and dropdown labels comfortably spaced', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop toolbar layout');
  await page.setViewportSize({ width: 820, height: 720 });

  await page.goto('/');
  await page
    .getByRole('region', { name: '笔记目录' })
    .getByRole('button', { name: '新建文档' })
    .click();
  await page.getByLabel('文档标题').fill(`工具栏布局-${Date.now()}`);
  await page.getByRole('button', { name: '确认' }).click();

  const editor = page.locator('.ProseMirror');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.insertText('检查链接、颜色和正文按钮的布局');
  await page.keyboard.press('Shift+Home');

  const toolbar = page.locator('.milkdown-toolbar');
  await expect(toolbar).toBeVisible();
  const link = toolbar.getByRole('button', { name: '链接' });
  const quote = toolbar.getByRole('button', { name: '引用' });
  const codeBlock = toolbar.getByRole('button', { name: '代码块' });
  for (const button of [link, quote, codeBlock]) {
    const icon = button.locator('svg.toolbar-lucide-icon');
    await expect(icon).toBeVisible();
    await expect(icon).toHaveCSS('width', '18px');
    await expect(icon).toHaveCSS('height', '18px');
  }

  const format = toolbar.getByRole('button', { name: '格式' });
  const color = toolbar.getByRole('button', { name: '颜色' });
  const layout = await toolbar.evaluate((element) => {
    const measureDropdown = (label: string) => {
      const button = element.querySelector<HTMLElement>(
        `.toolbar-item[aria-label="${label}"]`,
      );
      const current = button?.querySelector<HTMLElement>('[data-toolbar-current]');
      const caret = button?.querySelector<HTMLElement>('.toolbar-dropdown-caret');
      if (!button || !current || !caret) throw new Error(`${label} button missing`);
      const buttonBox = button.getBoundingClientRect();
      const currentBox = current.getBoundingClientRect();
      const caretBox = caret.getBoundingClientRect();
      return {
        width: buttonBox.width,
        labelCaretGap: caretBox.left - currentBox.right,
        rightInset: buttonBox.right - caretBox.right,
      };
    };
    const toolbarBox = element.getBoundingClientRect();
    return {
      format: measureDropdown('格式'),
      color: measureDropdown('颜色'),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      left: toolbarBox.left,
      right: toolbarBox.right,
      viewportWidth: window.innerWidth,
    };
  });

  await expect(format).toHaveCSS('min-width', '72px');
  await expect(color).toHaveCSS('min-width', '48px');
  expect(layout.format.width).toBeGreaterThanOrEqual(72);
  expect(
    layout.format.labelCaretGap,
    JSON.stringify(layout.format),
  ).toBeGreaterThanOrEqual(6);
  expect(layout.format.rightInset).toBeGreaterThanOrEqual(8);
  expect(layout.color.labelCaretGap).toBeGreaterThanOrEqual(6);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
});
