import {
  forwardRef,
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
import { observeCrepeToolbar } from './toolbar-tooltips.js';

export interface MarkdownEditorHandle {
  appendMarkdown: (markdown: string) => void;
  getMarkdown: () => string;
}

interface MarkdownEditorProps {
  document: DocumentRecord;
  onChange: (markdown: string) => void;
}

export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor({ document, onChange }, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
    const stopObservingToolbar = observeCrepeToolbar(root);

    const crepe = new Crepe(
      buildCrepeOptions({
        root,
        defaultValue: document.content,
        uploadImage: async (file) => {
          const asset = await notesApi.uploadAsset(document.id, file);
          return assetMarkdownPath(document.id, asset.name);
        },
        proxyImageUrl: (url) => assetPreviewUrl(url),
      }),
    );
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        onChangeRef.current(markdown);
      });
    });
    crepeRef.current = crepe;
    void crepe.create();

    return () => {
      stopObservingToolbar();
      crepeRef.current = undefined;
      void crepe.destroy();
    };
  }, [document.content, document.id]);

  return <div ref={rootRef} className="markdown-editor" data-document-id={document.id} />;
});
