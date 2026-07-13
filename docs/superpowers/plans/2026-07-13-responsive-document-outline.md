# 响应式文档目录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使文档目录在不同显示器、窗口宽度和缩放条件下稳定布局，并为长标题提供省略与完整标题提示。

**Architecture:** `DocumentOutline` 负责把完整标题暴露给浏览器提示；`styles.css` 负责可用编辑区内的自适应网格和文字截断。Playwright 从真实编辑器页面验证布局，组件测试验证语义属性。

**Tech Stack:** React、TypeScript、CSS Grid、Vitest、Playwright。

## Global Constraints

- 目录宽度必须相对于编辑区，而非浏览器视口 `vw`。
- 所有端长标题必须单行省略；仅桌面端依赖鼠标悬停查看完整标题。
- 保持现有目录导航、折叠、移动端抽屉与可访问名称。
- 只修改目录相关组件、样式、测试和中文变更记录。

---

### Task 1: 标题截断语义与回归测试

**Files:**

- Modify: `tests/client/document-outline-component.test.tsx`
- Modify: `tests/e2e/notes.spec.ts`
- Modify: `src/client/editor/DocumentOutline.tsx`
- Modify: `src/client/styles.css`

- [ ] **Step 1: 写失败测试**

在组件测试中渲染标题 `极长标题用于验证完整提示文字`，断言目录按钮的可访问名称仍为完整标题且 `title` 属性为完整标题。在现有 E2E 目录标题检查中，断言 `whiteSpace === 'nowrap'`、`textOverflow === 'ellipsis'`、`title` 等于完整标题，并将长标题的 `scrollWidth > clientWidth` 作为真实截断证据。

- [ ] **Step 2: 运行失败测试**

运行：`npm test -- tests/client/document-outline-component.test.tsx`

预期：失败，因为标题按钮尚未设置 `title`。

- [ ] **Step 3: 最小实现**

在 `DocumentOutline.tsx` 的 `.document-outline-link` 按钮加入：

```tsx
title={node.title}
```

在 `styles.css` 的 `.document-outline-link` 将：

```css
text-overflow: clip;
```

替换为：

```css
text-overflow: ellipsis;
```

- [ ] **Step 4: 验证通过**

运行：`npm test -- tests/client/document-outline-component.test.tsx`

预期：组件测试通过。

### Task 2: 编辑区自适应网格与多视口验证

**Files:**

- Modify: `src/client/styles.css`
- Modify: `tests/e2e/notes.spec.ts`
- Create: `docs/changes/2026-07-13-responsive-document-outline.md`

- [ ] **Step 1: 写失败布局断言**

在现有目录 E2E 测试中，保留页面与列表 `scrollWidth <= clientWidth + 1` 断言，同时要求截断标题 `scrollWidth > clientWidth`。对桌面目录读取网格列定义，断言不包含 `vw`。

- [ ] **Step 2: 运行失败检查**

运行：`npm run test:e2e -- tests/e2e/notes.spec.ts`

预期：目录样式仍为 `clip` 且网格定义包含 `28vw`，断言失败。

- [ ] **Step 3: 最小实现**

将 `.document-canvas` 与 `.document-canvas.outline-collapsed` 的网格列更新为：

```css
grid-template-columns: clamp(160px, 22%, 300px) minmax(0, 860px);
```

新增中文变更记录，说明编辑区比例网格、全端标题省略和桌面原生完整标题提示。

- [ ] **Step 4: 验证通过**

运行：

```powershell
npm test -- tests/client/document-outline-component.test.tsx
npm run test:e2e -- tests/e2e/notes.spec.ts
npm run typecheck
npm run build
```

预期：所有命令退出码为 `0`。
