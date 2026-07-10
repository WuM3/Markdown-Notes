// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { enhanceCodeBlocks } from '../../src/client/editor/code-block-interactions.js';

describe('code block interactions', () => {
  it('adds a collapse button and toggles collapsed state', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="milkdown-code-block">
        <div class="tools"><button class="language-button">Text</button></div>
        <div class="codemirror-host"></div>
      </div>
    `;

    enhanceCodeBlocks(root);

    const block = root.querySelector<HTMLElement>('.milkdown-code-block');
    const button = root.querySelector<HTMLButtonElement>('.code-collapse-button');
    expect(button?.getAttribute('aria-label')).toBe('收起代码块');
    expect(button?.dataset.tooltip).toBe('收起代码块');
    expect(block?.classList.contains('is-collapsed')).toBe(false);

    button?.click();

    expect(button?.getAttribute('aria-label')).toBe('展开代码块');
    expect(button?.dataset.tooltip).toBe('展开代码块');
    expect(block?.classList.contains('is-collapsed')).toBe(true);
  });

  it('adds a convert-to-paragraph button when a formatter is available', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="milkdown-code-block">
        <div class="tools">
          <button class="language-button">Shell</button>
          <div class="tools-button-group"><button>复制</button></div>
        </div>
        <div class="codemirror-host"></div>
      </div>
    `;
    const formatCodeBlock = vi.fn();

    enhanceCodeBlocks(root, { formatCodeBlock });

    const block = root.querySelector<HTMLElement>('.milkdown-code-block');
    const button = root.querySelector<HTMLButtonElement>('.code-format-button');
    expect(button?.getAttribute('aria-label')).toBe('转为正文');
    expect(button?.dataset.tooltip).toBe('转为正文');

    button?.click();

    expect(formatCodeBlock).toHaveBeenCalledWith(block, 'paragraph');
  });
});
