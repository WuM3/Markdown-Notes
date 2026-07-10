// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  inferCodeBlockLanguage,
  markdownForRichClipboard,
  markdownForPlainTextPaste,
  normalizePastedCodeBlock,
  withInferredCodeBlockLanguages,
} from '../../src/client/editor/code-block-language.js';

describe('code block language inference', () => {
  it('detects common pasted snippets without overriding explicit languages', () => {
    expect(inferCodeBlockLanguage('const value: string = props.title;')).toBe(
      'TypeScript',
    );
    expect(inferCodeBlockLanguage('def train(model):\n    return model.fit()')).toBe(
      'Python',
    );
    expect(
      inferCodeBlockLanguage(
        'C.remove_gtpu(\n  teid = 0x00000002, // PDR.PDI.Local_FTEID.TEID\n)',
      ),
    ).toBe('C');

    expect(
      withInferredCodeBlockLanguages(
        '```python\nprint("keep")\n```\n\n```\nconst answer: number = 42;\n```',
      ),
    ).toBe(
      '```python\nprint("keep")\n```\n\n```TypeScript\nconst answer: number = 42;\n```',
    );
  });

  it('trims accidental blank lines inside pasted code fences and infers language', () => {
    expect(
      withInferredCodeBlockLanguages(
        '复制过来的代码：\n\n```\n\nconst value: string = props.title;\n\n```\n',
      ),
    ).toBe(
      '复制过来的代码：\n\n```TypeScript\nconst value: string = props.title;\n```\n',
    );
  });

  it('unwraps ChatGPT-style fenced code before inserting a code block', () => {
    expect(
      normalizePastedCodeBlock('```dockerfile\n\nFROM ubuntu:16.04\n\n```'),
    ).toEqual({
      language: 'Dockerfile',
      text: 'FROM ubuntu:16.04',
    });
  });

  it('keeps terminal logs as plain text with hard line breaks when pasted', () => {
    const log = [
      'phytium /home/xzh # uname -r',
      '5.10.0-openeuler',
      'phytium /home/xzh # uname -m',
      'aarch64',
      'phytium /home/xzh # cat /etc/os-release',
      'ID=openeuler',
      'NAME="openEuler Embedded(openEuler Embedded Reference Distro)"',
      'VERSION="23.09 (openEuler23_09)"',
      'VERSION_ID=23.09',
      'PRETTY_NAME="openEuler Embedded(openEuler Embedded Reference Distro) 23.09 (openEuler23_09)"',
      'DISTRO_CODENAME="openEuler23_09"',
      'phytium /home/xzh #',
    ].join('\n');

    expect(normalizePastedCodeBlock(log)).toEqual({
      language: '',
      text: log,
    });
    expect(markdownForPlainTextPaste(log)).toBe(
      [
        'phytium /home/xzh # uname -r',
        '5.10.0-openeuler',
        'phytium /home/xzh # uname -m',
        'aarch64',
        'phytium /home/xzh # cat /etc/os-release',
        'ID=openeuler',
        'NAME="openEuler Embedded(openEuler Embedded Reference Distro)"',
        'VERSION="23.09 (openEuler23_09)"',
        'VERSION_ID=23.09',
        'PRETTY_NAME="openEuler Embedded(openEuler Embedded Reference Distro) 23.09 (openEuler23_09)"',
        'DISTRO_CODENAME="openEuler23_09"',
        'phytium /home/xzh #',
      ].join('  \n'),
    );
  });

  it('unwraps HTML code blocks from rich clipboard sources', () => {
    expect(
      normalizePastedCodeBlock(
        'print("hello")',
        '<pre><code class="language-python">\nprint("hello")\n</code></pre>',
      ),
    ).toEqual({
      language: 'Python',
      text: 'print("hello")',
    });
  });

  it('converts ChatGPT-style rich clipboard content with multiple code blocks', () => {
    const html = `
      <div>
        <p>查 <code>dal.ko</code> 是哪个包安装的：</p>
        <div class="code-block">
          <div>Bash</div>
          <pre><code class="language-bash">dpkg -S /lib/modules/$(uname -r)/extra/dal.ko</code></pre>
        </div>
        <p>查 <code>ctc5236_switch.ko</code>：</p>
        <pre><code class="language-bash">dpkg -S /lib/modules/$(uname -r)/extra/ctc5236_switch.ko</code></pre>
        <p>如果 <code>dpkg -S</code> 查不到，说明它可能不是通过 <code>.deb</code> 包安装的。</p>
      </div>
    `;

    expect(markdownForRichClipboard(html)).toBe(
      [
        '查 `dal.ko` 是哪个包安装的：',
        '',
        '```Shell',
        'dpkg -S /lib/modules/$(uname -r)/extra/dal.ko',
        '```',
        '',
        '查 `ctc5236_switch.ko`：',
        '',
        '```Shell',
        'dpkg -S /lib/modules/$(uname -r)/extra/ctc5236_switch.ko',
        '```',
        '',
        '如果 `dpkg -S` 查不到，说明它可能不是通过 `.deb` 包安装的。',
      ].join('\n'),
    );
  });
});
