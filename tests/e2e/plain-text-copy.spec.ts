import { expect, test } from '@playwright/test';

test('copies styled multiline editor content as clean plain text', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop clipboard regression');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  const title = `纯文本复制-${Date.now()}-${testInfo.workerIndex}`;
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
        '<span style="background-color: #fed7aa">VERSION="23.09 (openEuler23_09)"</span>\\',
        '<span style="background-color: #fed7aa">VERSION_ID=23.09</span>',
        '',
        '`sudo dhclient -r ens33`  ',
        '[sudo dhclient -v ens33](https://example.com)',
      ].join('\n'),
    },
  });
  expect(savedResponse.ok()).toBe(true);

  await page.goto('/');
  await page.getByText(title, { exact: true }).click();
  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('VERSION_ID=23.09');

  await editor.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.press('Control+C');

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(
    [
      'VERSION="23.09 (openEuler23_09)"',
      'VERSION_ID=23.09',
      'sudo dhclient -r ens33',
      'sudo dhclient -v ens33',
    ].join('\n'),
  );
  expect(clipboard).not.toMatch(/<span|\\_|ens33\\$/);
});
