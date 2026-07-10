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
            .addItem('link', toolbarItem('链接', '[]', (ctx) => {
              ctx.get(commandsCtx).call(toggleLinkCommand.key);
              focusEditor(ctx);
            }))
            .addItem('quote', toolbarItem('引用', '"', (ctx) => {
              toggleBlockquote(ctx);
            }))
            .addItem('code-block', toolbarItem('代码块', '{}', (ctx) => {
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
    icon: `<span class="toolbar-symbol-icon" aria-hidden="true">${icon}</span>`,
    active: () => false,
    onRun,
    label,
  };
}

function focusEditor(ctx: Ctx): void {
  ctx.get(editorViewCtx).focus();
}
