# 个人 Markdown 云笔记交接说明

最后更新：2026-07-10

## 项目定位

这是一个个人使用的局域网 Markdown 笔记系统。电脑是唯一的数据源，浏览器、Windows 桌面程序和 Android APP 都访问同一个 Fastify 服务。

- 不使用数据库；笔记和附件直接保存在用户选择的 `DATA_DIR`。
- 不提供登录、HTTPS、权限管理、评论或多人协作。
- 局域网内任何能访问端口的设备都具有读写和删除权限，只适合可信网络。

## 目录与职责

| 目录 | 作用 |
| --- | --- |
| `src/client/` | React/Vite 网页端；编辑器、目录树、搜索、导出和 Android 连接页。 |
| `src/client/editor/` | Milkdown/Crepe 编辑器扩展、工具栏、粘贴、图片交互、框选和文档目录。 |
| `src/server/` | Fastify API、Markdown 文件读写、搜索、回收站、附件和导出。 |
| `src/server/export/` | 当前文档的 Markdown、DOCX、PDF 导出模型与渲染。 |
| `src/desktop/` | Electron 主进程、托盘、桌面配置和本机服务管理。 |
| `src/shared/` | 前后端共享类型。 |
| `tests/client/` | Vitest 客户端/编辑器单元测试。 |
| `tests/server/` | Vitest 服务端和 API 集成测试。 |
| `tests/e2e/` | Playwright 浏览器回归测试。 |
| `docs/changes/` | 每次完成修改后的中文变更记录。 |
| `docs/superpowers/` | 历史设计、规格与实施计划，不是运行时依赖。 |
| `scripts/` | Windows 启动、计划任务、防火墙、Android 构建辅助脚本。 |

## 数据规则与安全边界

默认数据结构：

```text
data/
  notes/
    任意目录/
      文档.md
      .assets/
        文档ID/
          图片和附件
  .trash/
```

- Markdown 是唯一内容源。不要迁移到数据库，也不要随意修改 frontmatter 的 `id`、`title`、`createdAt`。
- 保存必须继续使用现有原子写入和 revision 冲突机制，不能用“最后写入覆盖一切”替代。
- 文件路径、附件路径和回收站路径都必须保持在 `DATA_DIR` 内，拒绝路径穿越和越界符号链接。
- 图片与附件不能被“清理项目”操作误删；实际笔记数据通常在 `data/` 或桌面版配置的外部数据目录，不属于构建产物。
- 测试产物统一使用 `.tmp/`：端到端临时数据位于 `.tmp/e2e-data/`，Playwright 截图和追踪位于 `.tmp/playwright/`，覆盖率报告位于 `.tmp/coverage/`。清理时绝不删除真实 `data/`。

## 启动、构建与打包

项目根目录为 `E:\Desktop\研究生文件\Markdown-Notes`。

```powershell
# 正式服务：浏览器访问 http://localhost:3210
npm run build
npm start

# 前后端开发模式：Vite 5173，API 3211
npm run dev

# Windows 桌面版
npm run desktop:dev
npm run desktop:dist

# Android
npm run android:sync
npm run android:debug
npm run android:apk
```

开发与正式端口不同：`npm run dev` 的前端是 `5173`、后端是 `3211`；`npm start` 才是单端口 `3210`。不要把开发地址写进 Android 或其他设备的服务器配置。

## 修改规则

1. 先读相关模块和现有测试，再改代码；不要为了一个问题顺手重构无关区域。
2. 保持 Markdown 格式、REST API、Android 局域网访问和桌面版数据目录兼容，除非用户明确要求改变兼容性。
3. 编辑器改动要特别谨慎。Milkdown、ProseMirror DOM selection、Crepe 工具栏、代码块和图片交互之间存在耦合；自动保存时不得重建编辑器或丢失焦点。
4. 使用 `apply_patch` 编辑文本文件。不要用 `git reset --hard`、`git checkout --`，也不要回滚不属于当前任务的脏工作区修改。
5. 每次功能或行为修改完成后，在 `docs/changes/YYYY-MM-DD-*.md` 写中文说明。同一天的多项修改可以追加到同一个文件。
6. 纯 UI 调整只做简单、针对性的验证，例如受影响测试、一个浏览器交互检查和构建；不需要为纯样式调整跑大量边界测试。
7. 数据保存、文件操作、导出、粘贴解析、编辑器选区、自动保存和同步等功能修改必须写足边界测试。至少覆盖空值、多行、Unicode、异常输入、重复操作、失败返回和与图片/代码块/表格等混合内容。
8. 发生难复现的编辑器问题时，先确认根因和数据流，再修复。不要连续叠加 CSS 或事件监听“试试看”。

## 测试分级

| 改动类型 | 最低验证 |
| --- | --- |
| 纯 UI、间距、颜色、图标 | 相关 Vitest 或 Playwright，`npm run typecheck`，必要时 `npm run build`。 |
| 普通客户端行为 | 相关 Vitest，`npm run typecheck`，`npm run lint`。 |
| API、数据、导出、附件、保存、路径安全 | 新增或更新测试，并运行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。 |
| 多视口或鼠标/键盘交互 | 运行受影响的 Playwright；全量 E2E 按改动范围决定。 |
| Windows/Android 打包逻辑 | 至少运行对应构建命令；真实设备或安装包验证按影响范围决定。 |

常用命令：

```powershell
npm test
npx vitest run --maxWorkers=4
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

`npm test` 偶尔会因并发负载让个别 UI 测试超时。先单独重跑失败文件，再用 `npx vitest run --maxWorkers=4` 判断是否为并发波动；不要直接删除测试或放宽断言。

## 编辑器与 UI 注意事项

- 工具栏项目顺序与 `toolbar-tooltips.ts` 的索引和可访问名称绑定，改动顺序时必须同步更新标签与测试。
- 自定义工具栏配置在 `crepe-config.ts`，布局覆盖在 `styles.css`。Crepe 默认工具按钮有固定 `width: 32px`，下拉按钮需要显式覆盖为 `width: auto`。
- 颜色与格式菜单由 `toolbar-tooltips.ts` 创建并挂在 `document.body`。改动菜单关闭、悬浮或滚动定位时，要防止浮层遮挡编辑器和错误重开。
- 图片复制、缩放、框选与拖动逻辑集中在 `image-interactions.ts`；不要把普通文字框选逻辑混入图片复制分支。
- 复制到外部程序时应输出可见纯文本，不能输出 Markdown 转义或颜色 HTML；实现为 `plain-text-clipboard.ts`。
- 代码块粘贴、语言推断和 CodeMirror 渲染分别在 `code-paste.ts`、`code-block-language.ts`、`code-block-interactions.ts`。改其中一个前先检查其余两处的测试。

## 部署与运行注意事项

- 正式服务默认监听 `0.0.0.0:3210`。局域网设备访问失败时检查防火墙脚本、电脑 IPv4 地址和服务进程。
- Windows 计划任务名称是 `PersonalMarkdownNotes`。项目移动位置后，重新运行 `scripts/install-startup.ps1`；原任务仍会引用旧路径。
- Electron 关闭窗口默认保留托盘和服务；选择托盘“退出”才会停止由桌面版启动的服务。
- Android APP 不保存离线 Markdown 副本，电脑服务关闭或不在同一局域网时无法编辑。签名 keystore 不能丢失，否则无法覆盖安装已发布 APK。
- PDF 中文依赖 Windows 本机字体；没有可用中文字体时应明确报错，不能生成乱码。

## 当前工作区状态（2026-07-10）

以下文件是未提交的工具栏 UI 优化，保留即可，不要误删：

```text
src/client/editor/crepe-config.ts
src/client/styles.css
tests/client/editor-config.test.ts
tests/e2e/toolbar-layout.spec.ts
docs/changes/2026-07-10-toolbar-ui.md
```

这些改动将链接、引用、代码块替换为统一线性图标，并修复“正文”下拉按钮被 Crepe 固定宽度挤压的问题。验证记录：Vitest 189 项通过，相关 Playwright 工具栏布局测试通过，类型检查、Lint 和生产构建通过。

## 已知边界与排查入口

- 全量 Playwright 曾有文档目录长标题宽度的既有断言失败。若再次出现，先检查 `DocumentOutline.tsx` 与 `styles.css` 的单行显示、宽度和横向滚动规则，不要把它归因于编辑器工具栏。
- Vite 会提示主包超过 500 kB。这是性能优化建议，不是构建失败；如要处理，应先评估 Milkdown、代码高亮语言包和导出依赖的拆分方式。
- 历史 `docs/superpowers/specs/` 与 `docs/superpowers/plans/` 记录了导出、目录、桌面版等较大改动的设计背景。遇到行为不明时先查对应日期文档。
