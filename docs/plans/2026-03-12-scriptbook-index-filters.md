# 2026-03-12 ScriptBook index filters

## 背景
ScriptBook 已能生成静态站点并支持目录/类型/搜索/分页，但索引列表页此前主要展示“标题 + 路径”，导致用户仍需进入详情页才能理解脚本用途。同时，筛选维度偏“文件属性”，缺少更贴近用途/风险/入口的筛选。

本次目标：
1) 索引列表做到“一眼知道脚本是干嘛的”（展示用途摘要与标签）
2) 增强筛选：Tag（AND 多选）、状态（可展示/已隐藏）、入口（README 提到 / npm scripts）

约束：
- 用途摘要仅来自安全可控来源（头部注释/显式字段），不从正文自动摘要，避免泄露潜在敏感信息。
- 纯静态站点：继续由 `tools/scriptbook/build.mjs` 离线生成。
- 最小改动：优先利用既有 manifest 字段，必要时增加少量派生字段。

## 关键设计决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| “用途一句话”来源 | 仅解析头部前 60 行的注释行：`Desc:` > `功能/用途/作用/简介/描述：` > `filename - desc` > 首条注释句 | 可控、低风险；避免从正文自动摘要引入敏感信息暴露 |
| 索引页展示内容 | 列表直接展示 `desc` + tags chips | 满足“一眼知道干嘛” |
| 入口筛选来源 | 前端额外加载 `data/readme-refs.json`、`data/package-scripts.json` 并映射到 item 标记 | 复用既有 build 产物，不破坏 manifest 结构 |
| “已脱敏”状态 | 在 manifest item 增加派生字段 `redacted`（基于 redact report hits） | 便于索引页展示 badge 与后续筛选扩展；不需要加载完整 report |
| Tag 筛选交互 | 复选框列表（AND 多选） | 纯静态、实现稳健、可视化明确 |

## 修改文件清单

- `tools/scriptbook/parse-metadata.mjs`
  - 增强头部元数据提取：在注释行中识别 `功能/用途/作用/简介/描述：` 与 `filename - desc`，并明确优先级。

- `tools/scriptbook/tests/metadata.test.mjs`
  - 新增单测覆盖上述两类 desc 规则。

- `tools/scriptbook/build.mjs`
  - `buildManifest()` 里为每个 manifest item 增加 `redacted: boolean`（基于 `redactText().report.hits.length > 0`）。

- `tools/scriptbook/tests/build-manifest.test.mjs`
  - 扩展断言：脱敏命中时 `redacted === true`。

- `tools/scriptbook/templates/index.html`
  - 新增筛选控件：状态、入口；新增标签复选框容器。

- `tools/scriptbook/assets/app.js`
  - 列表项展示：desc 两行、省略；tags chips（前 3 +N）。
  - badges 增强：可展示/已隐藏、已脱敏、README、npm。
  - 数据加载：额外拉取 `readme-refs.json` 与 `package-scripts.json`，映射到 `isReadmeEntry/hasNpmScripts`。
  - 筛选增强：标签 AND 多选、状态、入口。

- `tools/scriptbook/assets/app.css`
  - 列表项 desc clamp；chips/tag 复选框面板样式；新增 badge good。

- `docs/progress.md`
  - 增加本轮改动的进度条目。

## 踩坑记录
- `index.html` 中需要避免重复的 `id="stats"`（已在实现过程中修正为仅保留一次）。

## 验证方式
- 单测：`node --test tools/scriptbook/tests/*.test.mjs`
- 构建：`node tools/scriptbook/build.mjs --root . --out dist/scriptbook`
- 本地预览：`python3 -m http.server 8000 -d dist/scriptbook`
  - 检查索引列表可直接看到用途摘要与标签 chips
  - 检查标签 AND/状态/入口筛选生效
  - 搜索/排序/分页加载不回退

## 关联 Commit
- 待提交（本文件会在提交后补充 commit hash）。
