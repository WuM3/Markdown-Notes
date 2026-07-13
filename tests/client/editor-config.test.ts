import { describe, expect, it, vi } from 'vitest';
import { CrepeFeature } from '@milkdown/crepe';
import { buildCrepeOptions } from '../../src/client/editor/crepe-config.js';

describe('buildCrepeOptions', () => {
  it('enables the core note blocks, disables formula features, and localizes slash groups', () => {
    const options = buildCrepeOptions({
      root: {} as HTMLElement,
      defaultValue: '# 笔记',
      uploadImage: vi.fn(),
    });

    expect(options.features).toMatchObject({
      [CrepeFeature.Table]: true,
      [CrepeFeature.ImageBlock]: true,
      [CrepeFeature.BlockEdit]: true,
      [CrepeFeature.Latex]: false,
      [CrepeFeature.AI]: false,
    });
    expect(options.featureConfigs?.[CrepeFeature.BlockEdit]).toMatchObject({
      textGroup: {
        label: '基础',
        h1: { label: '一级标题' },
        h5: { label: '五级标题' },
        h6: null,
      },
      listGroup: {
        label: '列表',
        taskList: { label: '任务' },
      },
      advancedGroup: {
        label: '常用',
        image: { label: '图片' },
        codeBlock: { label: '代码块' },
        table: { label: '表格' },
        math: null,
      },
    });

    const codeMirror = options.featureConfigs?.[CrepeFeature.CodeMirror] as {
      languages?: Array<{ name: string }>;
    };
    expect(codeMirror.languages?.some((language) => language.name === 'C')).toBe(
      true,
    );
    expect(
      codeMirror.languages?.some((language) => language.name === 'TypeScript'),
    ).toBe(true);

    const groups: Array<{
      key: string;
      items: Array<{ key: string; item?: { icon?: string } }>;
    }> = [
      {
        key: 'function',
        items: [{ key: 'code' }, { key: 'link' }],
      },
    ];
    const toolbar = options.featureConfigs?.[CrepeFeature.Toolbar] as {
      buildToolbar?: (builder: {
        addGroup: (key: string, label: string) => {
          addItem: (key: string, item: unknown) => unknown;
        };
        getGroup: (key: string) => {
          clear: () => {
            addItem: (key: string, item: unknown) => unknown;
          };
        };
      }) => void;
    };
    const createGroupApi = (group: {
      items: Array<{ key: string; item?: { icon?: string } }>;
    }) => ({
      addItem(itemKey: string, item: unknown) {
        group.items.push({
          key: itemKey,
          item:
            item && typeof item === 'object' && 'icon' in item
              ? (item as { icon?: string })
              : undefined,
        });
        return this;
      },
      clear() {
        group.items = [];
        return this;
      },
    });
    toolbar.buildToolbar?.({
      addGroup(key) {
        const group = {
          key,
          items: [] as Array<{ key: string; item?: { icon?: string } }>,
        };
        groups.push(group);
        return createGroupApi(group);
      },
      getGroup(key) {
        const group = groups.find((item) => item.key === key);
        if (!group) throw new Error(`missing group: ${key}`);
        return createGroupApi(group);
      },
    });
    expect(groups).toContainEqual({
      key: 'function',
      items: [
        { key: 'link', item: expect.any(Object) },
        { key: 'quote', item: expect.any(Object) },
        { key: 'code-block', item: expect.any(Object) },
        { key: 'text-color', item: expect.any(Object) },
      ],
    });
    expect(groups).toContainEqual({
      key: 'block-tools',
      items: [
        { key: 'block-format', item: expect.any(Object) },
      ],
    });
    const functionGroup = groups.find((item) => item.key === 'function');
    const blockGroup = groups.find((item) => item.key === 'block-tools');
    const colorIcon = functionGroup?.items.find(
      (item) => item.key === 'text-color',
    )?.item?.icon;
    const linkIcon = functionGroup?.items.find(
      (item) => item.key === 'link',
    )?.item?.icon;
    const quoteIcon = functionGroup?.items.find(
      (item) => item.key === 'quote',
    )?.item?.icon;
    const codeBlockIcon = functionGroup?.items.find(
      (item) => item.key === 'code-block',
    )?.item?.icon;
    const formatIcon = blockGroup?.items.find(
      (item) => item.key === 'block-format',
    )?.item?.icon;
    expect(colorIcon).toContain('toolbar-color-current');
    expect(linkIcon).toContain('<svg');
    expect(linkIcon).toContain('toolbar-lucide-icon');
    expect(quoteIcon).toContain('<svg');
    expect(codeBlockIcon).toContain('<svg');
    expect(colorIcon).not.toContain('⌄');
    expect(formatIcon).not.toContain('⌄');
  });
});
