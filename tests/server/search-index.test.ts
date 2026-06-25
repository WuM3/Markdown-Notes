import { describe, expect, it } from 'vitest';
import type { DocumentRecord } from '../../src/shared/types.js';
import { SearchIndex } from '../../src/server/search-index.js';

function document(
  id: string,
  title: string,
  content: string,
): DocumentRecord {
  return {
    id,
    title,
    content,
    path: `${title}.md`,
    parentPath: '',
    createdAt: '2026-06-25T08:00:00.000Z',
    updatedAt: '2026-06-25T09:00:00.000Z',
    revision: id,
  };
}

describe('SearchIndex', () => {
  it('finds Chinese phrases in titles and Markdown body text', () => {
    const index = new SearchIndex();
    index.rebuild([
      document('one', '深度学习实验', '# 第一轮\n\n记录卷积网络准确率。'),
      document('two', '读书清单', '- 数据库系统'),
    ]);

    expect(index.search('深度').map((result) => result.id)).toEqual(['one']);
    expect(index.search('卷积').map((result) => result.id)).toEqual(['one']);
  });

  it('updates and removes individual documents without stale results', () => {
    const index = new SearchIndex();
    index.rebuild([document('one', '旧主题', '旧内容')]);

    index.upsert(document('one', '新主题', '新内容包含云文档'));
    expect(index.search('旧主题')).toEqual([]);
    expect(index.search('云文档')[0]).toMatchObject({
      id: 'one',
      title: '新主题',
    });

    index.remove('one');
    expect(index.search('云文档')).toEqual([]);
  });

  it('returns an excerpt near the matching body text', () => {
    const index = new SearchIndex();
    index.rebuild([
      document(
        'one',
        '长文',
        `${'前言'.repeat(50)}这里是关键实验结论${'后记'.repeat(50)}`,
      ),
    ]);

    const [result] = index.search('实验结论');
    expect(result.excerpt).toContain('实验结论');
    expect(result.excerpt.length).toBeLessThanOrEqual(100);
  });

  it('deduplicates repeated document snapshots during a rebuild', () => {
    const index = new SearchIndex();
    const first = document('one', '并发快照', '第一次内容');
    const latest = { ...first, content: '最新内容包含稳定索引' };

    expect(() => index.rebuild([first, latest])).not.toThrow();
    expect(index.search('稳定索引')).toHaveLength(1);
  });
});
