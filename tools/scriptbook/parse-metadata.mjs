import path from "node:path";

function toUnixRelPath(p) {
  return p.split(path.sep).join("/");
}

export function inferLang({ relPath, ext, firstLine }) {
  const e = (ext || "").toLowerCase();
  if (e === ".sh") return "bash";
  if (e === ".py") return "python";
  if (e === ".js") return "javascript";
  if (e === ".ps1") return "powershell";
  if (e === ".bat") return "batch";
  if (e === ".yml" || e === ".yaml") return "yaml";
  if (e === ".conf" || e === ".cfg") return "ini";

  const l1 = (firstLine || "").trim();
  if (l1.startsWith("#!")) {
    if (l1.includes("python")) return "python";
    if (l1.includes("node") || l1.includes("deno")) return "javascript";
    if (l1.includes("bash") || l1.includes("sh")) return "bash";
    if (l1.includes("pwsh") || l1.includes("powershell")) return "powershell";
  }

  return "plain";
}

export function parseHeaderMeta(text, maxLines = 60) {
  const lines = String(text).split(/\r?\n/).slice(0, maxLines);

  // 支持头部形如：
  // Title: xxx
  // Desc: xxx
  // Tags: a, b, c
  // 或 # Title: ...（shell/python/yaml 常见）
  const meta = { title: "", desc: "", tags: [] };

  /**
   * 仅从“注释行”中提取信息，避免误读正文。
   * 允许的注释前缀：// # ; /* *
   */
  function parseCommentText(rawLine) {
    const line = String(rawLine || "").trim();
    if (!line) return null;
    if (line.startsWith("#!")) return null;
    const m = line.match(/^(?:\/\/|#|;|\/\*+|\*)\s*(.+)$/);
    if (!m) return null;
    const txt = String(m[1] || "").trim();
    return txt ? txt : null;
  }

  // 先收集注释文本（保持行序），后续所有派生规则都只在这里运行。
  const commentLines = [];
  for (const raw of lines) {
    const txt = parseCommentText(raw);
    if (txt) commentLines.push(txt);
  }

  // 1) 显式字段：Title/Desc/Tags
  for (const txt of commentLines) {
    const m = txt.match(/^(Title|Desc|Tags)\s*:\s*(.+)$/i);
    if (!m) continue;

    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "title") meta.title = val;
    else if (key === "desc") meta.desc = val;
    else if (key === "tags") {
      meta.tags = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  // 2) 关键词行：功能/用途/作用/简介/描述：...
  if (!meta.desc) {
    for (const txt of commentLines) {
      const m = txt.match(/^(功能|用途|作用|简介|描述)\s*[：:]\s*(.+)$/i);
      if (!m) continue;
      const val = String(m[2] || "").trim();
      if (val) {
        meta.desc = val;
        break;
      }
    }
  }

  // 3) filename - desc（仅对注释行做轻量匹配）
  if (!meta.desc) {
    for (const txt of commentLines) {
      const m = txt.match(/^([^\s]+)\s+-\s+(.+)$/);
      if (!m) continue;
      const val = String(m[2] || "").trim();
      if (val) {
        meta.desc = val;
        break;
      }
    }
  }

  // 4) 最后回退：第一条“有效注释句”
  if (!meta.desc) {
    meta.desc = commentLines[0] || "";
  }

  return meta;
}

export function defaultTitleFromPath(relPath) {
  const p = toUnixRelPath(relPath);
  const base = path.posix.basename(p);
  return base;
}
