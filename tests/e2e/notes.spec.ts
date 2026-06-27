import { expect, test } from '@playwright/test';

test('creates, autosaves, reloads, and searches a Markdown note', async ({
  page,
}, testInfo) => {
  const suffix =
    testInfo.project.name === 'mobile'
      ? '手机'
      : testInfo.project.name === 'tablet'
        ? '平板'
        : '桌面';
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
  await expect(editor).toBeFocused();
  await page.keyboard.type('，保存后继续输入');
  const finalContent = `${content}，保存后继续输入`;
  await expect(editor).toContainText(finalContent);
  await expect(page.locator('.save-state.pending')).toBeVisible();
  await expect(page.locator('.save-state.saved')).toBeVisible({ timeout: 8_000 });

  await page.reload();
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: '打开目录' }).click();
  }
  await page.getByText(title, { exact: true }).click();
  await expect(page.getByLabel('文档标题')).toHaveValue(title);
  await expect(page.locator('.ProseMirror')).toContainText(finalContent);
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

test('shows icon and editor tooltips with restrained motion', async ({
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  await page.goto('/');

  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: '打开目录' }).click();
  }

  const searchButton = page.getByRole('button', { name: '搜索' });
  await searchButton.hover();
  await expect(page.getByRole('tooltip')).toHaveText('搜索');

  const transitionDuration = await searchButton.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(transitionDuration).toContain('0.12s');

  await page
    .getByRole('region', { name: '笔记目录' })
    .getByRole('button', { name: '新建文档' })
    .click();
  await page.getByLabel('文档标题').fill(`工具提示-${runId}`);
  await page.getByRole('button', { name: '确认' }).click();

  const outlineTitle = '3.Enhanced Mode with Unchanged gNB GTP-U Behavior';
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type(outlineTitle);
  await page.keyboard.press('Shift+Home');

  const toolbar = page.locator('.milkdown-toolbar');
  await expect(toolbar).toBeVisible();
  const toolbarButtons = toolbar.locator('.toolbar-item');
  await expect(toolbarButtons).toHaveCount(6);
  await expect(toolbarButtons.nth(0)).toHaveAttribute('aria-label', '加粗');
  await expect(toolbarButtons.nth(4)).toHaveAttribute('aria-label', '链接');
  await expect(toolbarButtons.nth(5)).toHaveAttribute('aria-label', '格式');

  await toolbarButtons.nth(5).hover();
  const formatMenu = page.getByRole('menu', { name: '格式' });
  await expect(formatMenu).toBeVisible();
  await formatMenu.getByRole('menuitem', { name: '一级标题' }).click();
  await expect(editor.locator('h1')).toContainText(outlineTitle);
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText(
    Array.from(
      { length: 36 },
      (_, index) => `\n\n滚轮测试段落 ${index + 1}：这是一段用于撑开正文高度的内容。`,
    ).join(''),
  );

  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: '打开文档目录' }).click();
  }
  const outline = page.getByRole('navigation', { name: '文档目录' });
  const outlineHeading = outline.getByRole('button', { name: outlineTitle });
  await expect(outlineHeading).toBeVisible();
  if (testInfo.project.name !== 'mobile') {
    await expect(page.locator('.editor-scroll .document-outline')).toBeVisible();
    await expect(page.locator('.document-canvas > .document-outline')).toBeVisible();
  }
  const outlineHeadingStyle = await outlineHeading.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontWeight: style.fontWeight,
      overflowWrap: style.overflowWrap,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
    };
  });
  expect(normalizedFontWeight(outlineHeadingStyle.fontWeight)).toBeGreaterThanOrEqual(
    650,
  );
  expect(outlineHeadingStyle.whiteSpace).toBe('nowrap');
  expect(outlineHeadingStyle.textOverflow).not.toBe('ellipsis');
  if (testInfo.project.name !== 'mobile') {
    const outlineLayout = await page
      .locator('.editor-scroll')
      .evaluate((scrollElement) => {
        const canvas = scrollElement.querySelector('.document-canvas');
        const outlineList = scrollElement.querySelector('.document-outline-list');
        const outlineLink = scrollElement.querySelector('.document-outline-link');
        const surface = scrollElement.querySelector('.document-surface');
        if (!(canvas instanceof HTMLElement)) {
          throw new Error('Document canvas is missing');
        }
        if (!(outlineList instanceof HTMLElement)) {
          throw new Error('Document outline list is missing');
        }
        if (!(outlineLink instanceof HTMLElement)) {
          throw new Error('Document outline link is missing');
        }
        if (!(surface instanceof HTMLElement)) {
          throw new Error('Document surface is missing');
        }
        const canvasBox = canvas.getBoundingClientRect();
        const surfaceBox = surface.getBoundingClientRect();
        const scrollBox = scrollElement.getBoundingClientRect();
        const canvasStyle = getComputedStyle(canvas);
        return {
          canvasOffsetLeft: canvasBox.left - scrollBox.left,
          canvasTransitionDuration: canvasStyle.transitionDuration,
          canvasTransitionProperty: canvasStyle.transitionProperty,
          linkClientWidth: outlineLink.clientWidth,
          linkScrollWidth: outlineLink.scrollWidth,
          listClientWidth: outlineList.clientWidth,
          listScrollWidth: outlineList.scrollWidth,
          pageClientWidth: scrollElement.clientWidth,
          pageScrollWidth: scrollElement.scrollWidth,
          surfaceLeft: surfaceBox.left,
        };
      });
    expect(outlineLayout.canvasOffsetLeft).toBeLessThan(20);
    expect(outlineLayout.listScrollWidth).toBeLessThanOrEqual(
      outlineLayout.listClientWidth + 1,
    );
    expect(outlineLayout.pageScrollWidth).toBeLessThanOrEqual(
      outlineLayout.pageClientWidth + 1,
    );
    expect(outlineLayout.linkScrollWidth).toBeLessThanOrEqual(
      outlineLayout.linkClientWidth + 1,
    );
    expect(outlineLayout.canvasTransitionProperty).toContain(
      'grid-template-columns',
    );
    expect(outlineLayout.canvasTransitionDuration).toContain('0.18s');

    const outlineBox = await outline.boundingBox();
    const editorBox = await editor.boundingBox();
    expect(outlineBox?.x ?? Number.POSITIVE_INFINITY).toBeLessThan(
      editorBox?.x ?? 0,
    );
    const outlineTopBeforeWheel = outlineBox?.y ?? 0;

    const headingFontWeight = await editor.locator('h1').first().evaluate((element) => {
      return getComputedStyle(element).fontWeight;
    });
    expect(normalizedFontWeight(headingFontWeight)).toBeGreaterThanOrEqual(700);

    const scrollTopBeforeWheel = await page
      .locator('.editor-scroll')
      .evaluate((element) => element.scrollTop);
    await outline.hover();
    await page.mouse.wheel(0, 900);
    await expect
      .poll(() => page.locator('.editor-scroll').evaluate((element) => element.scrollTop))
      .toBeGreaterThan(scrollTopBeforeWheel);
    const outlineTopAfterWheel = await outline.evaluate(
      (element) => element.getBoundingClientRect().y,
    );
    expect(Math.abs(outlineTopAfterWheel - outlineTopBeforeWheel)).toBeLessThan(2);
    await page.locator('.editor-scroll').evaluate((element) => {
      element.scrollTop = 0;
    });

    await page.getByRole('button', { name: '收起文档目录' }).click();
    await expect(page.getByRole('button', { name: '展开文档目录' })).toBeVisible();
    const collapsedSurfaceLeft = await page
      .locator('.document-surface')
      .evaluate((element) => element.getBoundingClientRect().left);
    expect(Math.abs(collapsedSurfaceLeft - outlineLayout.surfaceLeft)).toBeLessThan(
      2,
    );
    await page.getByRole('button', { name: '展开文档目录' }).click();
    await expect(outlineHeading).toBeVisible();

    const treePanel = page.getByRole('region', { name: '笔记目录' });
    await page.getByRole('button', { name: '收起文件夹目录' }).click();
    await expect(page.getByRole('button', { name: '展开文件夹目录' })).toBeVisible();
    await page.getByRole('button', { name: '展开文件夹目录' }).click();
    await expect(page.getByRole('button', { name: '收起文件夹目录' })).toBeVisible();
    const treeLayout = await treePanel.evaluate((element) => {
      const content = element.querySelector('.tree-panel-content');
      if (!(content instanceof HTMLElement)) {
        throw new Error('Tree panel content wrapper is missing');
      }
      const contentStyle = getComputedStyle(content);
      return {
        contentMinWidth: contentStyle.minWidth,
        contentWidth: content.getBoundingClientRect().width,
        panelOverflowX: getComputedStyle(element).overflowX,
      };
    });
    expect(treeLayout.panelOverflowX).toBe('hidden');
    expect(Number.parseFloat(treeLayout.contentMinWidth)).toBeGreaterThanOrEqual(280);
    expect(treeLayout.contentWidth).toBeGreaterThanOrEqual(270);
  }
  await outlineHeading.click();
  if (testInfo.project.name === 'mobile') {
    await expect(outline).not.toBeVisible();
    await page.getByRole('button', { name: '打开文档目录' }).click();
  }
  await expect(
    page
      .getByRole('navigation', { name: '文档目录' })
      .getByRole('button', { name: outlineTitle }),
  ).toHaveAttribute('aria-current', 'true');
  if (testInfo.project.name === 'mobile') {
    await page
      .locator('.document-outline.compact')
      .getByRole('button', { name: '关闭文档目录' })
      .click();
  }

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('中文斜体测试');
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await expect(toolbar).toBeVisible();
  await toolbarButtons.nth(1).click();
  await expect(editor.locator('em')).toContainText(/./);
  const italicStyle = await editor.locator('em').first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { fontStyle: style.fontStyle, transform: style.transform };
  });
  expect(italicStyle.fontStyle).not.toBe('normal');
});

function normalizedFontWeight(fontWeight: string): number {
  if (fontWeight === 'bold') return 700;
  if (fontWeight === 'normal') return 400;
  return Number.parseInt(fontWeight, 10);
}

test('honors reduced motion preferences', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: '打开目录' }).click();
  }
  await page
    .getByRole('region', { name: '笔记目录' })
    .getByRole('button', { name: '新建文档' })
    .click();

  const durationSeconds = await page.locator('.dialog-content').evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).animationDuration),
  );
  expect(durationSeconds).toBeLessThan(0.001);
});
