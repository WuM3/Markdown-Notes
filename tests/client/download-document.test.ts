// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadCurrentDocument,
  exportFileName,
} from '../../src/client/export/download-document.js';

describe('current document download', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      "attachment; filename*=UTF-8''%E7%A7%91%E7%A0%94%20%E8%AE%B0%E5%BD%95.pdf",
      '科研 记录.pdf',
    ],
    ['attachment; filename="fallback.docx"', 'fallback.docx'],
    ['attachment', '安全标题.md'],
    ['attachment; filename*=UTF-8\'\'%E0%A4%A', '安全标题.md'],
  ])('resolves a safe filename from %s', (header, expected) => {
    expect(exportFileName(header, '安全标题', 'md')).toBe(expected);
  });

  it('filters Windows-invalid fallback names and reserved device names', () => {
    expect(exportFileName(null, 'CON', 'pdf')).toBe('CON_.pdf');
    expect(exportFileName(null, '实验<>:"/\\|?*... ', 'docx')).toBe(
      '实验_.docx',
    );
  });

  it('downloads once and always revokes the object URL', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const createObjectURL = vi.fn().mockReturnValue('blob:note-export');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const client = {
      exportDocument: vi.fn().mockResolvedValue({
        blob: new Blob(['content'], { type: 'text/markdown' }),
        contentDisposition:
          "attachment; filename*=UTF-8''%E5%BD%93%E5%89%8D%E6%96%87%E6%A1%A3.md",
      }),
    };

    const fileName = await downloadCurrentDocument({
      client,
      documentId: 'doc-1',
      request: {
        format: 'md',
        title: '当前文档',
        content: '最新草稿',
      },
      document,
    });

    expect(client.exportDocument).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(fileName).toBe('当前文档.md');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:note-export');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('does not create a download or leak URLs when the request fails', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const createObjectURL = vi.fn();
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const client = {
      exportDocument: vi.fn().mockRejectedValue(new Error('network down')),
    };

    await expect(
      downloadCurrentDocument({
        client,
        documentId: 'doc-1',
        request: { format: 'pdf', title: '失败', content: '' },
        document,
      }),
    ).rejects.toThrow('network down');

    expect(click).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
