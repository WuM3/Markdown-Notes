# 当前文档导出与插入菜单闪黑修复设计

## 目标

- 修复正文含代码块时，点击右上角“插入”可能发生的页面瞬时闪黑。
- 将原有“导出全部笔记 ZIP”改为只导出当前文档。
- 支持 Markdown、Word 和 PDF 三种格式，并尽量保持当前笔记排版。
- 导出必须包含尚未完成自动保存的最新标题和正文。

## 范围

### 包含

- 当前文档 `.md`、`.docx`、`.pdf` 导出。
- 标题、正文、H1-H5、粗体、斜体、删除线、文字颜色、背景颜色、链接、行内代码、列表、任务列表、引用、代码块、分割线、表格、图片和附件链接。
- 中文内容、Windows 文件名、移动端和桌面端下载。
- 插入菜单和导出菜单的无闪黑打开动效。

### 不包含

- 全量 ZIP 备份入口。
- 多文档批量导出。
- 评论、目录树、回收站或版本历史导出。
- Word/PDF 中可继续编辑的 Markdown 源结构。
- 将普通附件嵌入 Word/PDF；附件仅保留为可点击链接。

## 用户界面

- 右上角操作顺序为“保存状态、导出、插入”。
- 删除左侧导航栏底部的“导出全部笔记”图标。
- 仅在已打开文档时显示“导出”按钮。
- 点击“导出”打开非模态菜单，依次提供：
  - Markdown
  - Word
  - PDF
- 桌面端显示下载图标和“导出”文字。
- 手机端空间不足时只显示下载图标，并保留 `aria-label` 和 Tooltip。
- 导出处理中禁用重复点击并显示进度状态；成功后由浏览器或 APP 下载文件，失败时显示可读错误，不关闭当前文档。

## 数据流

1. `DocumentEditor` 持有最新标题和 Markdown 正文。
2. 标题或正文变化时，将当前草稿同步给 `App`，但不改变现有自动保存和 revision 冲突逻辑。
3. 用户选择格式后，客户端向当前文档导出接口提交：
   - 文档 ID
   - 当前草稿标题
   - 当前草稿 Markdown
   - 目标格式
4. 服务端用文档 ID校验文档存在，并限制标题、正文和格式参数。
5. 服务端将 Markdown 解析为统一的导出文档模型。
6. Markdown、Word、PDF 渲染器分别从该模型生成文件。
7. 客户端从 `Content-Disposition` 获取安全文件名并触发下载。

导出请求不会保存草稿，也不会修改 revision。这样即使自动保存正在等待、失败或发生冲突，导出内容仍与用户眼前的编辑器一致。

## API

新增接口：

```text
POST /api/documents/:id/export
Content-Type: application/json
```

请求：

```ts
interface ExportDocumentRequest {
  format: 'md' | 'docx' | 'pdf';
  title: string;
  content: string;
}
```

响应：

- `md`: `text/markdown; charset=utf-8`
- `docx`: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `pdf`: `application/pdf`
- 所有格式均返回 RFC 5987 UTF-8 `Content-Disposition` 文件名。

错误：

- 文档不存在：`404 NOT_FOUND`
- 不支持的格式：`400 BAD_REQUEST`
- 标题超过 200 个 Unicode 字符或 Markdown UTF-8 大小超过 10 MiB：`413 PAYLOAD_TOO_LARGE`
- 生成失败：`500 EXPORT_FAILED`，日志保留具体原因，客户端只显示安全错误信息。

原 `GET /api/export` 全量 ZIP 接口和客户端入口移除。

## 统一导出模型

Markdown 只解析一次，生成与输出格式无关的块和行内节点：

```ts
type ExportBlock =
  | ExportParagraph
  | ExportHeading
  | ExportList
  | ExportQuote
  | ExportCodeBlock
  | ExportTable
  | ExportImage
  | ExportDivider;

type ExportInline =
  | ExportText
  | ExportLink
  | ExportInlineCode
  | ExportLineBreak;
```

行内节点携带粗体、斜体、删除线、文字颜色和背景颜色。解析器只接受项目生成的受限 `<span style>` 颜色语法，忽略脚本、事件属性、URL 样式和其他原始 HTML。

GFM 表格、任务列表和删除线由 `remark-gfm` 解析。项目已有的文字颜色转换逻辑抽成共享纯函数，编辑器和导出解析器共同使用，避免两套规则漂移。

## 格式输出

### Markdown

- 使用现有 Markdown frontmatter 结构。
- 保留 `id`、`title`、`createdAt`，正文使用请求中的当前草稿。
- 文件以 UTF-8 编码输出。
- 不重写本地资源路径。

### Word

- 使用 `docx` 生成 OOXML。
- 文档标题使用 Word Title 样式；H1-H5 映射为对应 Heading 样式。
- 行内样式映射为 `TextRun` 属性。
- 列表和任务列表使用 Word 编号结构；任务项保留复选框字符。
- 引用使用左边框和浅色底。
- 代码块使用等宽字体、浅灰背景和语言标签。
- 表格设置表头强调、边框和可用页面宽度。
- PNG/JPEG/GIF/WebP 图片先读取本地附件，再由 `sharp` 读取尺寸并统一生成静态 PNG；动画图片使用第一帧。
- 转换后的图片嵌入文档并按页面宽度等比缩放。
- 无法解码或缺失的图片输出替代文字，不中止整份文档。
- 普通附件和外部链接生成为超链接。

### PDF

- 使用 `PDFKit` 生成 PDF。
- 优先使用 Windows 中文字体，依次查找 `msyh.ttc`、`msyh.ttf`、`Deng.ttf`、`simsun.ttc`。
- 未找到中文字体时，纯 ASCII 文档回退到 PDFKit Helvetica；包含非 ASCII 字符的文档返回 `EXPORT_FONT_MISSING`，不生成乱码 PDF。
- 标题、段落、列表、引用、代码块和表格拥有固定版式与分页规则。
- 长代码默认换行，单个超长单词也必须限制在页面宽度内。
- 宽表格按列数分配宽度并允许单元格换行，不产生横向页面溢出。
- PNG/JPEG/GIF/WebP 图片由 `sharp` 统一生成静态 PNG 后嵌入。
- 图片按页内最大宽高等比缩放，必要时换页。
- 页脚显示页码。

## 资源与安全

- 只允许读取当前文档 `.assets/<document-id>/` 内的本地资源。
- 拒绝路径穿越、绝对路径和越界符号链接。
- 外部图片不由导出接口主动下载；尚未本地化的外部图片保留为链接和替代文字。
- 单张图片沿用 20 MiB 上限，单次导出的图片原始数据总量限制为 100 MiB，Markdown UTF-8 大小限制为 10 MiB。
- 文件名沿用项目的 Windows 安全名称规则，并移除路径分隔符、控制字符和尾部句点。
- Word/PDF 生成过程使用内存上限和明确错误处理；失败时不留下临时文件。

## 插入菜单闪黑修复

- “插入”和“导出”均使用 Radix Dropdown Menu 的非模态模式。
- 菜单打开不锁定页面滚动，不向 `body` 添加模态交互屏蔽。
- 菜单动效只使用 `opacity` 和最多 4px 的纵向位移，不使用 `scale`。
- 保留键盘导航、Esc 关闭、点击外部关闭和焦点恢复。
- `prefers-reduced-motion` 下关闭位移动画。
- 不改变代码块的 CodeMirror 内容、选区、折叠状态和滚动位置。

## 测试策略

### 解析器单元测试

- 空正文、只有空白和只有标题。
- 中文、英文、Emoji、组合字符和超长单词。
- H1-H5、嵌套列表、任务列表、引用嵌套、分割线。
- 多语言代码块、无语言代码块、长行和空代码块。
- GFM 表格、空单元格、宽表格和单列表格。
- 粗体、斜体、删除线、行内代码、链接、文字颜色和背景颜色组合。
- 合法、畸形和恶意 `<span style>`。
- 图片、缺失图片、越界路径、外部图片和普通附件。

### API 集成测试

- 三种格式的 MIME、文件扩展名、UTF-8 文件名和文件签名。
- 当前草稿覆盖服务器旧内容，但不改变服务器文件和 revision。
- 不存在文档、非法格式、空标题、超长正文和恶意路径。
- DOCX 可作为 ZIP 打开且包含主要 OOXML 文件、正文和图片资源。
- PDF 以 `%PDF-` 开头，页数大于零，并包含可提取的正文。
- 图片损坏时文档仍可导出且包含替代文字。
- 连续和并发导出不会串用其他文档内容。

### 客户端测试

- 无文档时不显示导出按钮。
- 有文档时右上角显示导出按钮，左侧全量导出入口消失。
- 菜单包含且只包含 Markdown、Word、PDF。
- 最新标题和未保存正文被发送。
- 下载文件名优先使用响应头，缺失时使用安全回退名。
- 请求失败、网络中断和重复点击状态。
- 手机宽度下按钮无文字溢出。

### Playwright

- 含代码块、图片、表格及长正文时打开和关闭插入菜单。
- 在菜单动画期间采样页面截图，验证页面主体没有黑色像素比例突增。
- 打开菜单前后代码块文本、选区、折叠状态和滚动位置不变。
- `prefers-reduced-motion` 分支。
- 编辑未等待自动保存，立即导出 Markdown，下载内容必须包含最后一次输入。
- 分别下载三种格式并验证响应类型和非空文件。

## 最坏情况与降级

- 中文字体不存在：纯 ASCII PDF 使用 Helvetica；含非 ASCII 字符时返回 `EXPORT_FONT_MISSING`，测试环境通过依赖注入字体路径验证两个分支。
- 图片过大或损坏：跳过图片二进制，输出替代文字，其他内容继续生成。
- 表格或代码内容极宽：强制换行并限制页面宽度。
- 导出过程中当前文档被删除：返回 404，不生成混合或错误文件。
- 多次快速点击：客户端只保留一个进行中的请求。
- 自动保存冲突：导出仍使用当前草稿，不覆盖服务器版本。
- 导出器抛出异常：Fastify 记录错误，返回稳定错误码，不泄露本地路径。
