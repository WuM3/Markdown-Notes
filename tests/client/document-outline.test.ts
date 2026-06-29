import { describe, expect, it } from 'vitest';
import {
  buildOutlineTree,
  parseMarkdownHeadings,
  resolveActiveHeadingId,
} from '../../src/client/editor/document-outline.js';

describe('document outline parsing', () => {
  it('extracts H1-H5 headings and ignores headings inside fenced code', () => {
    const headings = parseMarkdownHeadings(`# 标题一

\`\`\`ts
## 代码里的标题
\`\`\`

### 标题三
###### 六级标题不进目录
#### 标题四
`);

    expect(headings).toEqual([
      { id: 'heading-0', index: 0, level: 1, title: '标题一' },
      { id: 'heading-1', index: 1, level: 3, title: '标题三' },
      { id: 'heading-2', index: 2, level: 4, title: '标题四' },
    ]);
  });

  it('builds a nested tree and attaches skipped levels to the nearest parent', () => {
    const tree = buildOutlineTree(
      parseMarkdownHeadings(`# 一
### 一点一
## 二
##### 二点一
# 三`),
    );

    expect(tree).toMatchObject([
      {
        title: '一',
        children: [
          { title: '一点一', level: 3, children: [] },
          {
            title: '二',
            level: 2,
            children: [{ title: '二点一', level: 5, children: [] }],
          },
        ],
      },
      { title: '三', children: [] },
    ]);
  });

  it('resolves the active heading from the viewport anchor', () => {
    const positions = [
      { id: 'heading-0', top: 80 },
      { id: 'heading-1', top: 240 },
      { id: 'heading-2', top: 520 },
    ];

    expect(resolveActiveHeadingId(positions, 40)).toBe('heading-0');
    expect(resolveActiveHeadingId(positions, 260)).toBe('heading-1');
    expect(resolveActiveHeadingId(positions, 620)).toBe('heading-2');
    expect(resolveActiveHeadingId([], 260)).toBeUndefined();
  });
});
