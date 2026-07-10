import {
  forwardRef,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { Crepe } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/kit/utils';
import type { Selection } from '@milkdown/kit/prose/state';
import type { DocumentRecord } from '../../shared/types.js';
import { notesApi } from '../api.js';
import { assetMarkdownPath, assetPreviewUrl } from './asset-paths.js';
import { buildCrepeOptions } from './crepe-config.js';
import { configureCodeBlockInteractions } from './code-block-interactions.js';
import { withInferredCodeBlockLanguages } from './code-block-language.js';
import { configureCodePaste } from './code-paste.js';
import { configureImageInteractions } from './image-interactions.js';
import { plainTextClipboardConfig } from './plain-text-clipboard.js';
import {
  applyTextStyle,
  getCurrentTextStyle,
  getStableEditorSelection,
  textStyleAttr,
  textStyleRemarkPlugin,
  textStyleSchema,
  textStyleStringifyConfig,
  type TextStyleInput,
} from './text-style.js';
import { observeCrepeToolbar } from './toolbar-tooltips.js';
import {
  applyBlockFormat,
  applyBlockFormatAtElement,
} from './toolbar-commands.js';

export interface MarkdownEditorHandle {
  appendMarkdown: (markdown: string) => void;
  getMarkdown: () => string;
}

interface MarkdownEditorProps {
  document: DocumentRecord;
  marqueeRootRef?: RefObject<HTMLElement | null>;
  onChange: (markdown: string) => void;
}

export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor({ document, marqueeRootRef, onChange }, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  const preservedSelectionRef = useRef<Selection | undefined>(undefined);
  const documentIdRef = useRef(document.id);
  const initialContentRef = useRef(document.content);
  onChangeRef.current = onChange;

  if (documentIdRef.current !== document.id) {
    documentIdRef.current = document.id;
    initialContentRef.current = document.content;
  }

  useImperativeHandle(
    ref,
    () => ({
      appendMarkdown(markdown: string) {
        const crepe = crepeRef.current;
        if (!crepe) return;
        const current = crepe.getMarkdown().trimEnd();
        const next = current ? `${current}\n\n${markdown}\n` : `${markdown}\n`;
        crepe.editor.action(replaceAll(next, true));
      },
      getMarkdown() {
        return crepeRef.current?.getMarkdown() ?? document.content;
      },
    }),
    [document.content],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const crepe = new Crepe(
      buildCrepeOptions({
        root,
        defaultValue: initialContentRef.current,
        uploadImage: async (file) => {
          const asset = await notesApi.uploadAsset(document.id, file);
          return assetMarkdownPath(document.id, asset.name);
        },
        proxyImageUrl: (url) => assetPreviewUrl(url),
      }),
    );
    crepe.editor
      .use(textStyleAttr)
      .use(textStyleSchema)
      .use(textStyleRemarkPlugin)
      .use(textStyleStringifyConfig)
      .use(plainTextClipboardConfig);
    const stopObservingToolbar = observeCrepeToolbar(root, {
      applyTextStyle: (style) => {
        const selection = preservedSelectionRef.current;
        try {
          crepe.editor.action((ctx) => applyTextStyle(ctx, style, selection));
        } finally {
          preservedSelectionRef.current = undefined;
        }
      },
      captureSelection: () => {
        crepe.editor.action((ctx) => {
          preservedSelectionRef.current = getStableEditorSelection(ctx);
        });
      },
      formatBlock: (format) => {
        preservedSelectionRef.current = undefined;
        crepe.editor.action((ctx) => applyBlockFormat(ctx, format));
      },
      getTextStyle: () => {
        let textStyle: TextStyleInput = {};
        crepe.editor.action((ctx) => {
          textStyle = getCurrentTextStyle(ctx, preservedSelectionRef.current);
        });
        return textStyle;
      },
    });
    configureCodePaste(crepe);
    const stopCodeBlockInteractions = configureCodeBlockInteractions(root, {
      formatCodeBlock: (block, format) => {
        crepe.editor.action((ctx) =>
          applyBlockFormatAtElement(ctx, format, block),
        );
      },
    });
    const stopImageInteractions = configureImageInteractions(crepe, root, {
      getMarqueeRoot: () => marqueeRootRef?.current ?? root,
    });
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        onChangeRef.current(withInferredCodeBlockLanguages(markdown));
      });
    });
    crepeRef.current = crepe;
    void crepe.create();

    return () => {
      stopObservingToolbar();
      stopCodeBlockInteractions();
      stopImageInteractions();
      crepeRef.current = undefined;
      void crepe.destroy();
    };
  }, [document.id, marqueeRootRef]);

  return <div ref={rootRef} className="markdown-editor" data-document-id={document.id} />;
});
