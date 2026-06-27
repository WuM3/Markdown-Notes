# Document Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible in-document heading outline for fast navigation and create a Markdown feature summary document.

**Architecture:** Parse the current Markdown draft on the client into a small heading tree, render it beside the editor on desktop, and expose it as a drawer-style panel on narrow screens. Clicking an outline item scrolls the corresponding rendered heading inside the editor viewport.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Playwright, existing CSS.

## Global Constraints

- Do not change the Markdown file format or write outline state into notes.
- Keep regular slash-menu Markdown list functionality unchanged.
- Store change/feature documentation under `docs/changes/`.
- Keep UI copy in Chinese.
- Preserve `prefers-reduced-motion` behavior.

---

### Task 1: Heading Parser

**Files:**
- Create: `src/client/editor/document-outline.ts`
- Test: `tests/client/document-outline.test.ts`

**Interfaces:**
- Produces: `parseMarkdownHeadings(markdown: string): OutlineHeading[]`
- Produces: `buildOutlineTree(headings: OutlineHeading[]): OutlineNode[]`
- Types: `OutlineHeading { id, title, level, index }`, `OutlineNode extends OutlineHeading { children: OutlineNode[] }`

- [ ] **Step 1: Write failing tests** for ignoring fenced code headings, normalizing heading levels H1-H5, and nesting skipped levels under the nearest parent.
- [ ] **Step 2: Run targeted tests** with `npm test -- --run tests/client/document-outline.test.ts` and confirm missing module failure.
- [ ] **Step 3: Implement parser** with a line scanner that tracks fenced code blocks and ATX headings.
- [ ] **Step 4: Run targeted tests** and confirm pass.

### Task 2: Outline Component

**Files:**
- Create: `src/client/editor/DocumentOutline.tsx`
- Test: `tests/client/document-outline-component.test.tsx`

**Interfaces:**
- Consumes: `OutlineNode[]`
- Produces React component: `DocumentOutline({ title, nodes, activeId, onNavigate, compact, onClose })`

- [ ] **Step 1: Write failing tests** for empty state, nested rendering, collapse/expand, and clicking an item.
- [ ] **Step 2: Run targeted component test** and confirm missing component failure.
- [ ] **Step 3: Implement component** using buttons, Chinese labels, and local collapsed state.
- [ ] **Step 4: Run targeted component test** and confirm pass.

### Task 3: Editor Integration

**Files:**
- Modify: `src/client/editor/DocumentEditor.tsx`
- Modify: `src/client/styles.css`
- Test: `tests/client/markdown-editor.test.tsx`
- Test: `tests/e2e/notes.spec.ts`

**Interfaces:**
- Consumes parser and component from Tasks 1-2.
- Adds `scrollToHeading(index: number)` behavior by querying rendered `.ProseMirror h1,h2,h3,h4,h5`.

- [ ] **Step 1: Add tests** that the editor renders a document outline from Markdown headings and can open it on mobile-sized flows.
- [ ] **Step 2: Implement state wiring** so title/content changes update the outline without saving extra data.
- [ ] **Step 3: Implement desktop and mobile CSS** for a right outline panel and a compact drawer.
- [ ] **Step 4: Run targeted tests and Playwright outline checks**.

### Task 4: Feature Documentation

**Files:**
- Create: `docs/changes/2026-06-26-current-features.md`

**Interfaces:**
- Produces a Chinese Markdown summary of current user-facing features and the newly added document outline.

- [ ] **Step 1: Write the feature summary document** with sections for document management, editing, assets, search, Android app, deployment, and current limitations.
- [ ] **Step 2: Verify the file exists and is tracked by `git status --short`**.

### Task 5: Verification

**Files:**
- No new production files.

**Interfaces:**
- Verifies all changes.

- [ ] **Step 1:** Run `npm run typecheck`.
- [ ] **Step 2:** Run `npm run lint`.
- [ ] **Step 3:** Run `npm test -- --run`.
- [ ] **Step 4:** Run `npm run build`.
- [ ] **Step 5:** Run `E2E_PORT=33210 npm run test:e2e`.
