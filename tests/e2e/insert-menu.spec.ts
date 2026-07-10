import { expect, test } from '@playwright/test';

test('opening insert menu does not lock or rescale a page containing a code block', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop compositing regression');

  const title = `插入菜单代码块-${Date.now()}-${testInfo.workerIndex}`;
  const createdResponse = await request.post('/api/documents', {
    data: { parentPath: '', title },
  });
  expect(createdResponse.ok()).toBe(true);
  const created = await createdResponse.json();
  const savedResponse = await request.put(`/api/documents/${created.id}`, {
    data: {
      title,
      revision: created.revision,
      content: [
        '菜单前正文',
        '',
        '```javascript',
        'const visibleAfterMenu = true;',
        '```',
        '',
        '菜单后正文',
      ].join('\n'),
    },
  });
  expect(savedResponse.ok()).toBe(true);

  await page.goto('/');
  await page.getByText(title, { exact: true }).click();

  const codeBlock = page.locator('.milkdown-code-block');
  await expect(codeBlock).toBeVisible();
  await expect(codeBlock).toContainText('const visibleAfterMenu = true;');

  const collapseButton = codeBlock.getByRole('button', { name: '收起代码块' });
  await collapseButton.click();
  await expect(codeBlock).toHaveClass(/is-collapsed/);

  const scroller = page.locator('.editor-scroll');
  await scroller.evaluate((element) => {
    element.scrollTop = Math.min(24, element.scrollHeight - element.clientHeight);
  });
  const scrollTopBefore = await scroller.evaluate((element) => element.scrollTop);

  await page.getByRole('button', { name: '插入', exact: true }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();

  const menuState = await menu.evaluate((element) => {
    const keyframes = element
      .getAnimations()
      .flatMap((animation) =>
        animation.effect instanceof KeyframeEffect
          ? animation.effect.getKeyframes()
          : [],
      );
    return {
      bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
      transforms: keyframes.map((keyframe) => String(keyframe.transform ?? '')),
    };
  });

  expect(menuState.bodyPointerEvents).not.toBe('none');
  expect(menuState.transforms.join(' ')).not.toContain('scale');
  await expect(codeBlock).toContainText('const visibleAfterMenu = true;');
  await expect(codeBlock).toHaveClass(/is-collapsed/);
  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(scrollTopBefore);
});
