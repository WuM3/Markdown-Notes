# 2026-07-03 网页端工具栏与代码块修复

## 修改内容

- 调整选中文字后的浮动工具栏：移除“行内代码”，新增“引用”和“代码块”，保留“格式”下拉。
- 重组 Milkdown 工具栏按钮顺序：加粗、斜体、删除线、链接、引用、代码块、格式。
- 修复从 ChatGPT 等来源复制 fenced code 时，代码块内部多出首尾空行的问题。
- 保存 Markdown 时会裁剪代码 fence 内部意外的首尾空行，并继续自动识别未标注的代码语言。
- 代码块内部点击和拖动不再触发图片框选逻辑，鼠标可以正常定位多行代码。
- 优化代码块浅色样式，提高文字、行号、当前行和选区的对比度。
- 为代码块顶部增加展开/收起按钮，收起后保留语言栏和操作入口。
- 修正终端日志粘贴策略：普通多行文本不再自动变成代码块，而是以硬换行形式插入，保留原始换行但不增加段落间距。
- 只有 fenced code 或富文本剪贴板中的 `<pre><code>` 内容会自动按代码块插入；HTML 代码块会读取 `language-*` 语言信息。
- “格式”菜单新增“代码块”，选中代码块后可以通过同一菜单切回“正文”。
- 代码块顶部工具条新增“正文”入口；即使选中整块代码时浮动工具栏不出现，也可以直接把代码块转回普通正文。
- 代码块语言选择菜单改为浮层显示，不再撑开代码块内部的大段空白。

## 验证

- `npm test -- tests/client/tooltip.test.tsx tests/client/code-block-language.test.ts tests/client/image-interactions.test.ts tests/client/editor-config.test.ts tests/client/code-block-interactions.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
