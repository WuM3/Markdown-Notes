import {
  forwardRef,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { Crepe } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/kit/utils';
import type { DocumentRecord } from '../../shared/types.js';
import { notesApi } from '../api.js';
import { assetMarkdownPath, assetPreviewUrl } from './asset-paths.js';
import { buildCrepeOptions } from './crepe-config.js';
import { withInferredCodeBlockLanguages } from './code-block-language.js';
import { configureCodePaste } from './code-paste.js';
import { configureImageInteractions } from './image-interactions.js';
import { observeCrepeToolbar } from './toolbar-tooltips.js';
import { applyBlockFormat } from './toolbar-commands.js';

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
    const stopObservingToolbar = observeCrepeToolbar(root, {
      formatBlock: (format) => {
        crepe.editor.action((ctx) => applyBlockFormat(ctx, format));
      },
    });
    configureCodePaste(crepe);
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
      stopImageInteractions();
      crepeRef.current = undefined;
      void crepe.destroy();
    };
  }, [document.id, marqueeRootRef]);

  return <div ref={rootRef} className="markdown-editor" data-document-id={document.id} />;
});
