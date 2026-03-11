export const SCRIPTBOOK_CONFIG = {
  includeExts: new Set([
    ".sh",
    ".py",
    ".js",
    ".ps1",
    ".bat",
    ".yml",
    ".yaml",
    ".conf",
    ".cfg",
  ]),
  includeFiles: new Set(["README.md", "nodeimg/package.json"]),
  excludeDirNames: new Set([
    ".git",
    "node_modules",
    "dist",
    ".worktrees",
  ]),
  // 安全与性能：扫描内容上限，超过则默认阻断详情页内容（仅保留元信息）。
  maxScanBytes: 2 * 1024 * 1024,
  // 详情页大文件默认展示行数
  defaultPreviewLines: 400,
  // 超过该字节数的文件默认视为“大文件”（仍可扫描/脱敏，但详情页只预览前 N 行）
  bigFileBytes: 512 * 1024,
};
