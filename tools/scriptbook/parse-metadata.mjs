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

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const m = line.match(/^(?:\/\/|#|;|\/\*+|\*)\s*(Title|Desc|Tags)\s*:\s*(.+)$/i);
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

  // 如果没有显式字段，尝试用第一条“有效注释句”作为 desc（跳过 shebang）。
  if (!meta.desc) {
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("#!")) continue;

      const m = line.match(/^(?:\/\/|#|;|\/\*+|\*)\s*(.+)$/);
      if (!m) continue;
      const txt = m[1].trim();
      if (txt) {
        meta.desc = txt;
        break;
      }
    }
  }

  return meta;
}

export function defaultTitleFromPath(relPath) {
  const p = toUnixRelPath(relPath);
  const base = path.posix.basename(p);
  return base;
}
