# 2026-03-11 ScriptBook HTML Docs

## 背景
仓库包含大量运维/安全相关脚本与配置模板（`.sh/.py/.js/.ps1/.bat + .yml/.yaml/.conf/.cfg`）。目标是将其整理为可在线浏览的**纯静态 HTML 文档站点**：
- 多页面：`index.html` 索引页 + 每个文件独立详情页
- 支持目录/类型筛选与搜索
- 必须做敏感信息脱敏/阻断，避免泄露 token/密钥/私钥等

## 关键设计决策

| 决策点 | 选择 | 理由 | 备选方案 |
|---|---|---|---|
| 站点生成方式 | Node.js 离线生成器 `tools/scriptbook/build.mjs` | 无运行时依赖，产物可直接托管 | 运行时服务端渲染（不符合纯静态） |
| URL 与中文路径 | `id = sha1(relPath)`，详情页 `s/<id>/index.html` | URL 稳定且不受中文/特殊字符影响 | 直接使用路径编码（易受字符影响） |
| 敏感信息策略 | 高危阻断 + 中危脱敏 + 生成报告 | 防止泄露，同时保留可读性 | 全量隐藏（可用性差） |
| 大文件策略 | 默认仅展示前 N 行 + 提供脱敏 raw 下载 | 性能可控，避免页面卡顿 | 全文渲染（易卡顿） |
| 搜索/过滤 | 客户端 JS（加载 manifest）实现搜索/过滤/分页 | 纯静态、实现简单 | 生成搜索索引分片（后续可做） |
| 部署方式 | GitHub Pages via Actions | 不提交 dist 到仓库，保持仓库干净 | 提交 dist 到 main（污染仓库） |

## 修改文件清单

### 新增
- `tools/scriptbook/config.mjs`：扫描范围、排除目录、阈值（大文件行数/大小等）
- `tools/scriptbook/build.mjs`：生成器入口（扫描→元数据→脱敏/阻断→生成静态站点）
- `tools/scriptbook/parse-metadata.mjs`：解析 shebang/注释头（Title/Desc/Tags）
- `tools/scriptbook/redact.mjs`：脱敏/阻断规则与命中报告
- `tools/scriptbook/templates/index.html`：索引页模板
- `tools/scriptbook/templates/detail.html`：详情页模板
- `tools/scriptbook/assets/app.css`：站点样式
- `tools/scriptbook/assets/app.js`：索引页搜索/过滤/分页
- `tools/scriptbook/assets/prism.js`：Prism.js（用于浏览器端高亮）
- `tools/scriptbook/assets/prism.css`：Prism 主题样式
- `tools/scriptbook/tests/*.test.mjs`：使用 `node:test` 的最小测试集
- `docs/progress.md`：任务进度（复选框）
- `docs/lessons.md`：经验教训记录（当前为空）
- `.github/workflows/scriptbook-pages.yml`：GitHub Pages Actions 工作流

### 产物（不提交）
- `dist/scriptbook/`：静态站点输出目录（index/assets/data/s/raw 等）

## 踩坑记录
- README 引用聚合实现时曾误留一段函数外的代码块，触发 `SyntaxError: Illegal return statement`；已修正为单一 `buildReadmeRefs()` async 函数。

## 验证方式
- 构建：
  - `node tools/scriptbook/build.mjs --root . --out dist/scriptbook`
- 本地预览：
  - `python3 -m http.server 8000 -d dist/scriptbook`
  - 打开 `http://localhost:8000/` 检查：
    - index 可加载列表
    - 搜索/目录/类型过滤有效
    - 任意详情页可打开，且内容已 HTML escape
    - 命中高危规则的文件显示“已隐藏”
    - 大文件只预览前 N 行，并提供脱敏 raw 下载

## 关联 Commit
- `acd1e20` chore: 添加 ScriptBook 扫描器与最小单测
- `fdd05e1` chore: 生成最小 manifest 并解析脚本元数据
- `4d7e4d5` chore: 增加内容脱敏与阻断并输出报告
- `1eda161` feat: 生成静态站点骨架与详情页
- `d8e5711` feat: 首页支持搜索过滤与分页加载
- `84466d1` feat: 聚合 README 引用与 nodeimg 脚本入口

