import {
  CrepeFeature,
  type CrepeConfig,
} from '@milkdown/crepe';
import type { Ctx } from '@milkdown/kit/ctx';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import { toggleLinkCommand } from '@milkdown/kit/component/link-tooltip';
import { languages } from '@codemirror/language-data';
import {
  applyCodeBlock,
  toggleBlockquote,
} from './toolbar-commands.js';

interface BuildCrepeOptionsInput {
  root: Node;
  defaultValue: string;
  uploadImage: (file: File) => Promise<string>;
  proxyImageUrl?: (url: string) => string | Promise<string>;
}

export function buildCrepeOptions(
  input: BuildCrepeOptionsInput,
): CrepeConfig {
  return {
    root: input.root,
    defaultValue: input.defaultValue,
    features: {
      [CrepeFeature.Cursor]: true,
      [CrepeFeature.ListItem]: true,
      [CrepeFeature.LinkTooltip]: true,
      [CrepeFeature.ImageBlock]: true,
      [CrepeFeature.BlockEdit]: true,
      [CrepeFeature.Toolbar]: true,
      [CrepeFeature.Placeholder]: true,
      [CrepeFeature.CodeMirror]: true,
      [CrepeFeature.Table]: true,
      [CrepeFeature.Latex]: false,
      [CrepeFeature.TopBar]: false,
      [CrepeFeature.AI]: false,
    },
    featureConfigs: {
      [CrepeFeature.CodeMirror]: {
        languages,
        searchPlaceholder: '搜索语言',
        noResultText: '没有结果',
        copyText: '复制',
        renderLanguage: (language: string) => language || 'Text',
      },
      [CrepeFeature.Toolbar]: {
        buildToolbar: (builder) => {
          const functionGroup = builder.getGroup('function');
          functionGroup
            .clear()
            .addItem('link', toolbarItem('链接', LINK_ICON, (ctx) => {
              ctx.get(commandsCtx).call(toggleLinkCommand.key);
              focusEditor(ctx);
            }))
            .addItem('quote', toolbarItem('引用', QUOTE_ICON, (ctx) => {
              toggleBlockquote(ctx);
            }))
            .addItem('code-block', toolbarItem('代码块', CODE_BLOCK_ICON, (ctx) => {
              applyCodeBlock(ctx);
            }))
            .addItem('text-color', dropdownItem('颜色', 'A'));
          const group = builder.addGroup('block-tools', '块工具');
          group.addItem('block-format', dropdownItem('格式', '正文'));
        },
      },
      [CrepeFeature.ImageBlock]: {
        onUpload: input.uploadImage,
        proxyDomURL: input.proxyImageUrl,
        blockUploadButton: '上传图片',
        inlineUploadButton: '上传图片',
        blockConfirmButton: '确认',
        inlineConfirmButton: '确认',
        blockUploadPlaceholderText: '或粘贴图片链接',
        inlineUploadPlaceholderText: '或粘贴图片链接',
        blockCaptionPlaceholderText: '添加图片说明',
      },
      [CrepeFeature.BlockEdit]: {
        textGroup: {
          label: '基础',
          text: { label: '正文' },
          h1: { label: '一级标题' },
          h2: { label: '二级标题' },
          h3: { label: '三级标题' },
          h4: { label: '四级标题' },
          h5: { label: '五级标题' },
          h6: null,
          quote: { label: '引用' },
          divider: { label: '分割线' },
        },
        listGroup: {
          label: '列表',
          bulletList: { label: '无序列表' },
          orderedList: { label: '有序列表' },
          taskList: { label: '任务' },
        },
        advancedGroup: {
          label: '常用',
          image: { label: '图片' },
          codeBlock: { label: '代码块' },
          table: { label: '表格' },
          math: null,
        },
      },
      [CrepeFeature.Placeholder]: {
        text: '输入 / 插入内容',
        mode: 'block',
      },
    },
  };
}

function dropdownItem(label: string, icon: string) {
  const iconClass =
    label === '颜色'
      ? 'toolbar-text-icon toolbar-dropdown-label toolbar-color-current'
      : 'toolbar-text-icon toolbar-dropdown-label';
  return {
    icon: `<span class="${iconClass}" data-toolbar-current="${label}">${icon}</span><span class="toolbar-dropdown-caret" aria-hidden="true"></span>`,
    active: () => false,
    onRun: undefined,
  };
}

function toolbarItem(
  label: string,
  icon: string,
  onRun: (ctx: Ctx) => void,
) {
  return {
    icon,
    active: () => false,
    onRun,
    label,
  };
}

function lucideIcon(content: string): string {
  return `<svg class="toolbar-lucide-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
}

const LINK_ICON = lucideIcon(
  '<path d="M9 17H7A5 5 0 0 1 7 7h2"></path><path d="M15 7h2a5 5 0 1 1 0 10h-2"></path><line x1="8" x2="16" y1="12" y2="12"></line>',
);

const QUOTE_ICON = lucideIcon(
  '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"></path><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"></path>',
);

const CODE_BLOCK_ICON = lucideIcon(
  '<path d="m18 16 4-4-4-4"></path><path d="m6 8-4 4 4 4"></path><path d="m14.5 4-5 16"></path>',
);

function focusEditor(ctx: Ctx): void {
  ctx.get(editorViewCtx).focus();
}
