# 2026-07-13 测试临时文件归档

- Playwright 临时服务数据改为 `.tmp/e2e-data/<端口>`，截图、失败追踪和其他运行产物改为 `.tmp/playwright/`。
- Vitest 覆盖率报告改为 `.tmp/coverage/`，所有测试生成文件统一由 `.tmp/` 忽略。
- 清理项目根目录遗留的 `.tmp-e2e-data-*` 与 `test-results/`，不影响真实 `data/` 和构建目录。
