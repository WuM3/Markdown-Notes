# 部分选区的引用与代码块转换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让引用和代码块工具将跨段落的部分文本选区扩展为被触及的完整文本块后再转换。

**Architecture:** 在 `toolbar-commands.ts` 中集中计算选区起止位置所在的文本块内容边界。引用命令先更新为该范围再调用现有块命令；代码块命令从相同范围提取文本后替换为代码块。

**Tech Stack:** TypeScript、Milkdown、ProseMirror、Vitest。

## Global Constraints

- “行”表示独立文本块；浏览器自动换行不分割块。
- 空选区与纯空白非空选区保持现有行为。
- 不新增依赖，不变更颜色样式处理。
- 每项生产代码必须先有失败测试。

---

## File Structure

- Modify: `src/client/editor/toolbar-commands.ts` — 计算完整文本块范围，并在引用与代码块命令中使用它。
- Create: `tests/client/toolbar-commands.test.ts` — 用最小 ProseMirror schema 验证选区范围和命令行为。

### Task 1: 完整文本块范围

**Files:**

- Create: `tests/client/toolbar-commands.test.ts`
- Modify: `src/client/editor/toolbar-commands.ts`

**Interfaces:**

- Produces: `getTouchedTextBlockRange(selection: Selection): { from: number; to: number } | undefined`。

- [ ] **Step 1: 写失败测试**

```ts
it('expands a partial multi-paragraph selection to every touched text block', () => {
  const doc = schema.node('doc', null, [
    paragraph('第一行内容'),
    paragraph('第二行内容'),
    paragraph('第三行内容'),
  ]);
  const selection = TextSelection.create(doc, 3, doc.content.size - 3);

  expect(getTouchedTextBlockRange(selection)).toEqual({
    from: 1,
    to: doc.content.size - 1,
  });
});

it('does not expand an empty selection', () => {
  const doc = schema.node('doc', null, [paragraph('第一行内容')]);
  expect(getTouchedTextBlockRange(TextSelection.create(doc, 3))).toBeUndefined();
});
```

- [ ] **Step 2: 运行测试确认失败**

运行：`npm test -- tests/client/toolbar-commands.test.ts`

预期：失败，因为 `getTouchedTextBlockRange` 还不存在。

- [ ] **Step 3: 实现最小范围函数**

在 `toolbar-commands.ts` 导入 `Selection`，并新增：

```ts
export function getTouchedTextBlockRange(
  selection: Selection,
): { from: number; to: number } | undefined {
  if (selection.empty) return undefined;
  const from = textBlockContentRange(selection.$from);
  const to = textBlockContentRange(selection.$to);
  if (!from || !to) return undefined;
  return { from: from.from, to: to.to };
}

function textBlockContentRange(
  $pos: ResolvedPos,
): { from: number; to: number } | undefined {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).isTextblock) {
      return { from: $pos.start(depth), to: $pos.end(depth) };
    }
  }
  return undefined;
}
```

- [ ] **Step 4: 运行测试确认通过**

运行：`npm test -- tests/client/toolbar-commands.test.ts`

预期：两个测试通过。

- [ ] **Step 5: 提交**

```powershell
git add src/client/editor/toolbar-commands.ts tests/client/toolbar-commands.test.ts
git commit -m "test: cover touched block selection range"
```

### Task 2: 命令采用完整范围

**Files:**

- Modify: `src/client/editor/toolbar-commands.ts`
- Modify: `tests/client/toolbar-commands.test.ts`

**Interfaces:**

- Consumes: `getTouchedTextBlockRange(selection)`。
- Produces: `getExpandedTextSelection(selection): TextSelection | undefined`。

- [ ] **Step 1: 写失败测试**

```ts
it('uses complete touched blocks when building code block text', () => {
  const doc = schema.node('doc', null, [
    paragraph('第一行内容'),
    paragraph('第二行内容'),
    paragraph('第三行内容'),
  ]);
  const selection = TextSelection.create(doc, 3, doc.content.size - 3);
  const range = getTouchedTextBlockRange(selection)!;

  expect(doc.textBetween(range.from, range.to, '\\n')).toBe(
    '第一行内容\\n第二行内容\\n第三行内容',
  );
});
```

再用模拟 `EditorView` 与 `commandsCtx` 的测试断言 `toggleBlockquote` 调用 `wrapInBlockTypeCommand` 前，已派发起止位置为 `1` 与 `doc.content.size - 1` 的 `TextSelection`。

- [ ] **Step 2: 运行测试确认失败**

运行：`npm test -- tests/client/toolbar-commands.test.ts`

预期：引用测试失败，因为命令仍使用原始部分选区。

- [ ] **Step 3: 最小接入实现**

在 `toolbar-commands.ts` 新增：

```ts
function getExpandedTextSelection(selection: Selection): TextSelection | undefined {
  const range = getTouchedTextBlockRange(selection);
  return range
    ? TextSelection.create(selection.$from.doc, range.from, range.to)
    : undefined;
}
```

在 `toggleBlockquote` 的包裹分支中，若该函数返回选择，先执行 `view.dispatch(view.state.tr.setSelection(expandedSelection))`，再调用现有 `wrapInBlockTypeCommand`。在 `applyCodeBlock` 中，以扩展选择替代原选择来计算 `selectedText` 并执行现有 `replaceSelection(markdownToSlice(...))`；找不到范围时使用原选择，保留现有空选区和空白检查。

- [ ] **Step 4: 运行测试确认通过**

运行：`npm test -- tests/client/toolbar-commands.test.ts`

预期：范围、完整代码文本和引用派发选区测试全部通过。

- [ ] **Step 5: 全量验证**

```powershell
npm test -- tests/client/toolbar-commands.test.ts tests/client/code-block-language.test.ts
npm test
npm run typecheck
npm run build
```

预期：每条命令退出码均为 `0`。

- [ ] **Step 6: 提交**

```powershell
git add src/client/editor/toolbar-commands.ts tests/client/toolbar-commands.test.ts
git commit -m "fix: format complete touched text blocks"
```
