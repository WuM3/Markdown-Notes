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

    const groups: Array<{ key: string; items: Array<{ key: string }> }> = [];
    const toolbar = options.featureConfigs?.[CrepeFeature.Toolbar] as {
      buildToolbar?: (builder: {
        addGroup: (key: string, label: string) => {
          addItem: (key: string, item: unknown) => unknown;
        };
      }) => void;
    };
    toolbar.buildToolbar?.({
      addGroup(key) {
        const group = { key, items: [] as Array<{ key: string }> };
        groups.push(group);
        return {
          addItem(itemKey) {
            group.items.push({ key: itemKey });
            return this;
          },
        };
      },
    });
    expect(groups).toContainEqual({
      key: 'block-tools',
      items: [
        { key: 'block-format' },
      ],
    });
  });
});
