import {
  Schema,
  Slice,
  type Node as ProseNode,
} from '@milkdown/kit/prose/model';
import { describe, expect, it } from 'vitest';
import { serializeClipboardPlainText } from '../../src/client/editor/plain-text-clipboard.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: { content: 'inline*', group: 'block' },
    code_block: { content: 'text*', group: 'block', code: true },
    hard_break: { inline: true, group: 'inline', leafText: () => '\n' },
    image: {
      inline: true,
      group: 'inline',
      attrs: { alt: { default: '' } },
      leafText: (node) => node.attrs.alt,
    },
    text: { group: 'inline' },
  },
  marks: {
    textStyle: {
      attrs: {
        color: { default: null },
        backgroundColor: { default: null },
      },
    },
    code: {},
    link: { attrs: { href: {} } },
  },
});

function slice(...blocks: ProseNode[]): Slice {
  const doc = schema.node('doc', undefined, blocks);
  return doc.slice(0, doc.content.size);
}

describe('serializeClipboardPlainText', () => {
  it('copies hard line breaks without Markdown backslashes', () => {
    const paragraph = schema.node('paragraph', undefined, [
      schema.text('sudo dhclient -r ens33'),
      schema.node('hard_break'),
      schema.text('sudo dhclient -v ens33'),
    ]);

    expect(serializeClipboardPlainText(slice(paragraph))).toBe(
      'sudo dhclient -r ens33\nsudo dhclient -v ens33',
    );
  });

  it('removes text-style markup and Markdown escaping', () => {
    const style = schema.mark('textStyle', {
      backgroundColor: '#fed7aa',
    });
    const red = schema.mark('textStyle', { color: '#ef4444' });
    const paragraph = schema.node('paragraph', undefined, [
      schema.text('VERSION="23.09 (openEuler23_09)"', [style]),
      schema.node('hard_break'),
      schema.text('VERSION_ID=23.09', [style]),
      schema.node('hard_break'),
      schema.text(
        'PRETTY_NAME="openEuler Embedded(openEuler Embedded Reference Distro)"',
        [red],
      ),
    ]);

    expect(serializeClipboardPlainText(slice(paragraph))).toBe(
      [
        'VERSION="23.09 (openEuler23_09)"',
        'VERSION_ID=23.09',
        'PRETTY_NAME="openEuler Embedded(openEuler Embedded Reference Distro)"',
      ].join('\n'),
    );
  });

  it('copies headings, paragraphs and code blocks as consecutive text lines', () => {
    expect(
      serializeClipboardPlainText(
        slice(
          schema.node('heading', undefined, schema.text('安装步骤')),
          schema.node(
            'paragraph',
            undefined,
            schema.text('查看 dal.ko', [
              schema.mark('link', { href: 'https://example.com' }),
            ]),
          ),
          schema.node(
            'code_block',
            undefined,
            schema.text('uname -r\ncat /etc/os-release'),
          ),
        ),
      ),
    ).toBe('安装步骤\n查看 dal.ko\nuname -r\ncat /etc/os-release');
  });

  it('uses image alt text and handles an empty selection', () => {
    const paragraph = schema.node('paragraph', undefined, [
      schema.text('拓扑图：'),
      schema.node('image', { alt: 'SRv6 网络拓扑' }),
    ]);

    expect(serializeClipboardPlainText(slice(paragraph))).toBe(
      '拓扑图：SRv6 网络拓扑',
    );
    expect(serializeClipboardPlainText(Slice.empty)).toBe('');
  });
});
