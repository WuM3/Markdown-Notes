# Current Document Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the code-block dropdown flash and replace the full ZIP export with current-document Markdown, Word, and PDF downloads.

**Architecture:** Parse the latest client draft into one format-neutral export model, then render it with dedicated Markdown, DOCX, and PDF renderers on the Fastify server. Keep export UI in the editor header, send unsaved draft content without mutating the repository, and use non-modal non-scaling Radix menus to avoid CodeMirror compositing flashes.

**Tech Stack:** React, Radix Dropdown Menu, Fastify, unified/remark, remark-gfm, docx, PDFKit, sharp, Vitest, Playwright.

## Global Constraints

- Export only the currently open document.
- Preserve the latest unsaved title and Markdown without changing revision state.
- Preserve headings, inline marks, colors, lists, quotes, code, tables, links, and local images.
- Markdown is limited to 10 MiB, titles to 200 Unicode characters, each image to 20 MiB, and total image input to 100 MiB.
- Local assets must remain inside `.assets/<document-id>/`; external images are links only.
- Menus use non-modal Radix behavior and opacity/translation animation without scale.
- Every production behavior is introduced by a failing test and includes edge cases.

---

### Task 1: Dropdown Flash Regression

**Files:**
- Modify: `src/client/editor/DocumentEditor.tsx`
- Modify: `src/client/styles.css`
- Modify: `tests/client/markdown-editor.test.tsx`
- Modify: `tests/e2e/notes.spec.ts`

**Interfaces:**
- Consumes: existing `DropdownMenu.Root`, `.menu-content`, and code block DOM.
- Produces: non-modal insert menu with stable CodeMirror state.

- [ ] **Step 1: Add failing component and Playwright tests**

Assert the insert menu root is non-modal, menu animation has no scale transform, and opening it with an expanded/collapsed code block preserves text, scroll position, selection, body background, and code block state.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```powershell
npm test -- tests/client/markdown-editor.test.tsx
$env:E2E_PORT='3310'; npx playwright test tests/e2e/notes.spec.ts --project=desktop
```

Expected: assertions for non-modal behavior or visual stability fail before production changes.

- [ ] **Step 3: Implement the minimal menu fix**

Use:

```tsx
<DropdownMenu.Root modal={false}>
```

and change `menu-enter` to opacity plus `translateY(-4px)` only. Preserve reduced-motion behavior.

- [ ] **Step 4: Re-run focused tests**

Expected: component and Playwright flash regressions pass.

---

### Task 2: Export Model and Markdown Renderer

**Files:**
- Create: `src/server/export/model.ts`
- Create: `src/server/export/parse-markdown.ts`
- Create: `src/server/export/render-markdown.ts`
- Create: `tests/server/export-model.test.ts`
- Modify: `src/shared/types.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces:

```ts
export type ExportFormat = 'md' | 'docx' | 'pdf';

export interface ExportDocumentRequest {
  format: ExportFormat;
  title: string;
  content: string;
}

export interface ExportDocumentModel {
  id: string;
  title: string;
  createdAt: string;
  blocks: ExportBlock[];
}

export function parseExportDocument(input: {
  id: string;
  title: string;
  createdAt: string;
  markdown: string;
}): ExportDocumentModel;

export function renderMarkdownExport(input: {
  id: string;
  title: string;
  createdAt: string;
  content: string;
}): Buffer;
```

- [ ] **Step 1: Add failing parser tests**

Cover empty input, H1-H5, Unicode, nested ordered/unordered/task lists, nested quote, alert quote, fenced code with and without language, empty and wide GFM tables, divider, image, attachment link, hard break, inline code, links, combined strong/emphasis/delete, valid color span, malformed span, script HTML, and external images.

- [ ] **Step 2: Verify parser tests fail**

Run:

```powershell
npm test -- tests/server/export-model.test.ts
```

Expected: missing export model/parser modules.

- [ ] **Step 3: Install parser dependencies**

Run:

```powershell
npm install remark-gfm docx pdfkit sharp
npm install --save-dev @types/pdfkit @types/mdast
```

- [ ] **Step 4: Implement the model and parser**

Use unified + remark-parse + remark-gfm. Convert only supported MDAST node types. Reuse `parseTextStyleDeclaration` for project-generated style spans and turn unsupported raw HTML into plain text or omit unsafe tags.

- [ ] **Step 5: Implement Markdown export**

Call the existing `serializeMarkdownFile` with the current draft title/content and repository metadata so the export retains `id`, `title`, and `createdAt`.

- [ ] **Step 6: Re-run parser tests**

Expected: all parser and Markdown byte-level assertions pass.

---

### Task 3: DOCX/PDF Renderers and Export API

**Files:**
- Create: `src/server/export/assets.ts`
- Create: `src/server/export/render-docx.ts`
- Create: `src/server/export/render-pdf.ts`
- Create: `src/server/export/export-document.ts`
- Create: `tests/server/document-export.test.ts`
- Modify: `src/server/app.ts`
- Modify: `src/server/repository.ts`
- Modify: `tests/server/api.test.ts`

**Interfaces:**
- Consumes: `ExportDocumentModel`, current repository document metadata, and safe asset resolver.
- Produces:

```ts
export interface ExportedDocument {
  data: Buffer;
  contentType: string;
  fileName: string;
}

export async function exportDocument(input: {
  repository: NotesRepository;
  documentId: string;
  request: ExportDocumentRequest;
  fontCandidates?: PdfFontCandidate[];
}): Promise<ExportedDocument>;
```

- [ ] **Step 1: Add failing renderer/API tests**

Cover MD/DOCX/PDF signatures and MIME types; Chinese names; empty documents; current draft versus stale server content; no repository mutation; invalid format; missing document; 201-character title; 10 MiB boundary; safe and traversing image paths; missing/corrupt/oversized images; mixed marks; nested lists; long code; wide tables; concurrent documents; missing CJK font; ASCII fallback.

- [ ] **Step 2: Verify renderer/API tests fail**

Run:

```powershell
npm test -- tests/server/document-export.test.ts tests/server/api.test.ts
```

Expected: export endpoint and renderers are absent.

- [ ] **Step 3: Implement safe asset loading**

Resolve only assets under the current document directory with existing repository path guards. Enforce 20 MiB per image and 100 MiB total. Normalize PNG/JPEG/GIF/WebP to static PNG with sharp; return an alt-text result for missing or corrupt images.

- [ ] **Step 4: Implement DOCX renderer**

Map model blocks to `docx` paragraphs, numbering, tables, hyperlinks, runs, borders, shading, and image runs. Clamp image dimensions to the writable page width.

- [ ] **Step 5: Implement PDF renderer**

Resolve Windows CJK fonts in the approved order, render blocks with page-aware helpers, wrap long code/table cells, clamp images, and add page numbers. Return `EXPORT_FONT_MISSING` for non-ASCII content without a usable font.

- [ ] **Step 6: Implement export service and Fastify route**

Add:

```ts
app.post('/api/documents/:id/export', { bodyLimit: 11 * 1024 * 1024 }, handler);
```

Validate the request before rendering, set RFC 5987 `Content-Disposition`, and remove the old `GET /api/export` ZIP route and archive helper.

- [ ] **Step 7: Re-run renderer/API tests**

Expected: all boundary and concurrency tests pass with no repository changes.

---

### Task 4: Client Download Flow, UI, Docs, and Full Verification

**Files:**
- Create: `src/client/export/download-document.ts`
- Create: `tests/client/download-document.test.ts`
- Modify: `src/client/runtime/api-client.ts`
- Modify: `src/client/components/NavRail.tsx`
- Modify: `src/client/editor/DocumentEditor.tsx`
- Modify: `src/client/App.tsx`
- Modify: `tests/client/api-client.test.ts`
- Modify: `tests/client/App.test.tsx`
- Modify: `tests/e2e/notes.spec.ts`
- Modify: `src/client/styles.css`
- Modify: `README.md`
- Create: `docs/changes/2026-07-09-current-document-export.md`

**Interfaces:**
- Consumes: current `DraftDocument`, current document ID, and export API.
- Produces:

```ts
export async function downloadCurrentDocument(input: {
  client: ApiClient;
  documentId: string;
  request: ExportDocumentRequest;
  document?: Document;
}): Promise<string>;
```

- [ ] **Step 1: Add failing client tests**

Cover hidden button without a document; right-header placement; absence of old nav export; exact three formats; latest unsaved draft; response-header filename; malformed/missing header fallback; object URL cleanup; network/API failure; duplicate-click lock; mobile icon-only behavior.

- [ ] **Step 2: Verify client tests fail**

Run:

```powershell
npm test -- tests/client/api-client.test.ts tests/client/App.test.tsx tests/client/download-document.test.ts
```

Expected: current-document export client/UI is absent.

- [ ] **Step 3: Implement binary API and download helper**

Add an `ApiClient.exportDocument()` method that returns response bytes plus headers without passing through the JSON/text request path. Sanitize fallback filenames and always revoke object URLs.

- [ ] **Step 4: Implement header export menu**

Pass the latest draft from `DocumentEditor` directly to the download helper. Render “导出” before “插入”, remove `NavRail` export props/link, disable the menu while a request is active, and show safe errors.

- [ ] **Step 5: Add end-to-end downloads**

Create a mixed-format document, edit without waiting for autosave, export all three formats, and assert download names, MIME/signatures, latest text, menu stability, and responsive layout.

- [ ] **Step 6: Update documentation**

Replace ZIP instructions in README and document supported formats, local-image behavior, font requirements, and current-draft semantics. Record the implementation in the same-day change document.

- [ ] **Step 7: Run full verification**

Run:

```powershell
npm test
npm run typecheck
npm run lint
$env:E2E_PORT='3310'; npm run test:e2e
npm run build
npm run desktop:build
```

Expected: zero failures. Review logs for export errors, unhandled rejections, React warnings, and unexpected browser console errors. The existing Vite chunk-size warning may remain.

