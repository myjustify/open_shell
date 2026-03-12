#!/usr/bin/env node

import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

import { SCRIPTBOOK_CONFIG } from "./config.mjs";
import { defaultTitleFromPath, inferLang, parseHeaderMeta } from "./parse-metadata.mjs";
import { redactText } from "./redact.mjs";

export async function scanRepoFiles(rootDir) {
  const rootAbs = path.resolve(rootDir);
  const results = [];

  // 统一输出为 posix 风格路径，确保后续 id 与 URL 稳定。

  /** @param {string} dirAbs */
  async function walk(dirAbs) {
    const entries = await fs.readdir(dirAbs, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (SCRIPTBOOK_CONFIG.excludeDirNames.has(ent.name)) continue;
        await walk(path.join(dirAbs, ent.name));
        continue;
      }
      if (!ent.isFile()) continue;

      const abs = path.join(dirAbs, ent.name);
      const relPath = path.relative(rootAbs, abs).split(path.sep).join("/");

      if (SCRIPTBOOK_CONFIG.includeFiles.has(relPath)) {
        results.push(relPath);
        continue;
      }
      if (SCRIPTBOOK_CONFIG.includeFiles.has(ent.name) && relPath === ent.name) {
        results.push(relPath);
        continue;
      }

      const ext = path.extname(ent.name).toLowerCase();
      if (!SCRIPTBOOK_CONFIG.includeExts.has(ext)) continue;

      results.push(relPath);
    }
  }

  await walk(rootAbs);
  results.sort((a, b) => a.localeCompare(b));
  return results;
}

function parseArgs(argv) {
  const out = { root: ".", out: "dist/scriptbook", base: "" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") out.root = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--base") out.base = argv[++i] ?? "";
  }
  return out;
}

function sha1Hex(input) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function htmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function formatDate(mtimeMs) {
  try {
    return new Date(mtimeMs).toISOString();
  } catch {
    return "";
  }
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function prismLang(lang) {
  // Prism language class 映射（后续可扩展）
  if (lang === "bash") return "bash";
  if (lang === "python") return "python";
  if (lang === "javascript") return "javascript";
  if (lang === "powershell") return "powershell";
  if (lang === "batch") return "batch";
  if (lang === "yaml") return "yaml";
  if (lang === "ini") return "ini";
  return "plain";
}

async function buildReadmeRefs(rootAbs, manifestItems) {
  const readmePath = path.join(rootAbs, "README.md");
  let readme = "";
  try {
    readme = await fs.readFile(readmePath, "utf8");
  } catch {
    return { version: 1, generatedAt: new Date().toISOString(), items: [] };
  }

  const readmeLower = readme.toLowerCase();
  const items = [];

  for (const it of manifestItems) {
    const base = path.posix.basename(it.relPath).toLowerCase();
    const refs = [];
    if (base && readmeLower.includes(base)) {
      refs.push({ type: "readme-mention", label: "README 提到" });
    }
    if (it.relPath === "tool.sh" && readmeLower.includes("curl") && readmeLower.includes("tool.sh")) {
      refs.push({ type: "readme-entry", label: "README 安装入口" });
    }
    if (refs.length) {
      items.push({ relPath: it.relPath, refs });
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    items,
  };
}

async function buildPackageScripts(rootAbs) {
  const pkgPath = path.join(rootAbs, "nodeimg", "package.json");
  try {
    const raw = await fs.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    const scripts = pkg && pkg.scripts ? pkg.scripts : {};
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      items: [{ relPath: "nodeimg/package.json", scripts }],
    };
  } catch {
    return { version: 1, generatedAt: new Date().toISOString(), items: [] };
  }
}

async function copyFile(src, dst) {
  await ensureDir(path.dirname(dst));
  await fs.copyFile(src, dst);
}

async function loadTemplate(absPath) {
  return fs.readFile(absPath, "utf8");
}

function applyTemplate(tpl, vars) {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }
  return out;
}

async function safeReadText(absPath, maxBytes) {
  const buf = await fs.readFile(absPath);
  if (buf.byteLength > maxBytes) {
    return { tooLarge: true, text: "", bytes: buf.byteLength };
  }
  return { tooLarge: false, text: buf.toString("utf8"), bytes: buf.byteLength };
}

async function buildManifest({ rootAbs, relPaths }) {
  const items = [];
  const redactionReports = [];

  for (const relPath of relPaths) {
    const abs = path.join(rootAbs, ...relPath.split("/"));
    const st = await fs.stat(abs);

    const ext = path.extname(relPath).toLowerCase();
    const id = sha1Hex(relPath);

    const { tooLarge, text, bytes } = await safeReadText(abs, SCRIPTBOOK_CONFIG.maxScanBytes);
    const firstLine = text.split(/\r?\n/)[0] || "";

    const header = parseHeaderMeta(text, 60);

    // 脱敏/阻断：仅在允许扫描内容范围内执行；过大文件直接标记 too_large。
    let blocked = tooLarge;
    let blockReason = tooLarge ? "too_large" : "";
    let redacted = false;

    if (!tooLarge) {
      const red = redactText({ relPath, text });
      redactionReports.push(red.report);

      // 只要有任何命中（脱敏或阻断），都认为该文件存在“已脱敏/命中”信号。
      // 注意：阻断会导致详情页不展示内容，但索引仍可用该信号做 badge/筛选。
      if (red.report && Array.isArray(red.report.hits) && red.report.hits.length > 0) {
        redacted = true;
      }

      if (red.blocked) {
        blocked = true;
        blockReason = `blocked:${(red.report.blockReasons || []).join(",")}`;
      }
    } else {
      redactionReports.push({
        relPath,
        blocked: true,
        blockReasons: ["too_large"],
        hits: [],
      });
    }

    items.push({
      id,
      relPath,
      ext,
      sizeBytes: bytes ?? st.size,
      mtimeMs: st.mtimeMs,
      lang: inferLang({ relPath, ext, firstLine }),
      title: header.title || defaultTitleFromPath(relPath),
      desc: header.desc || "",
      tags: header.tags || [],
      blocked,
      blockReason,
      redacted,
    });
  }

  return {
    manifest: { version: 1, generatedAt: new Date().toISOString(), items },
    redactionReport: {
      version: 1,
      generatedAt: new Date().toISOString(),
      items: redactionReports,
    },
  };
}

async function buildSite({ rootAbs, outAbs, base }) {
  const relPaths = await scanRepoFiles(rootAbs);
  const { manifest, redactionReport } = await buildManifest({ rootAbs, relPaths });

  const dataDir = path.join(outAbs, "data");
  const assetsDir = path.join(outAbs, "assets");

  await ensureDir(dataDir);
  await ensureDir(assetsDir);

  // data
  await fs.writeFile(
    path.join(dataDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(dataDir, "redaction-report.json"),
    JSON.stringify(redactionReport, null, 2) + "\n",
    "utf8",
  );

  // assets（静态复制）
  const toolsDir = path.dirname(new URL(import.meta.url).pathname);
  await copyFile(path.join(toolsDir, "assets", "app.css"), path.join(assetsDir, "app.css"));
  await copyFile(path.join(toolsDir, "assets", "app.js"), path.join(assetsDir, "app.js"));
  await copyFile(path.join(toolsDir, "assets", "prism.js"), path.join(assetsDir, "prism.js"));
  await copyFile(path.join(toolsDir, "assets", "prism.css"), path.join(assetsDir, "prism.css"));

  // pages
  const tplIndex = await loadTemplate(path.join(toolsDir, "templates", "index.html"));
  const tplDetail = await loadTemplate(path.join(toolsDir, "templates", "detail.html"));

  await fs.writeFile(path.join(outAbs, "index.html"), tplIndex, "utf8");

  // README 引用与 npm scripts
  const readmeRefs = await buildReadmeRefs(rootAbs, manifest.items);
  const packageScripts = await buildPackageScripts(rootAbs);

  await fs.writeFile(
    path.join(dataDir, "readme-refs.json"),
    JSON.stringify(readmeRefs, null, 2) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(dataDir, "package-scripts.json"),
    JSON.stringify(packageScripts, null, 2) + "\n",
    "utf8",
  );

  const readmeRefsByRel = new Map(readmeRefs.items.map((x) => [x.relPath, x.refs]));
  const scriptsByRel = new Map(packageScripts.items.map((x) => [x.relPath, x.scripts]));

  // 为每个文件生成详情页：s/<id>/index.html
  for (const it of manifest.items) {
    const pageDir = path.join(outAbs, "s", it.id);
    await ensureDir(pageDir);

    let codeHtml = "";
    let notice = "";
    let downloadLink = "";

    if (it.blocked) {
      notice = `<div class="notice">该文件因风险命中或过大已隐藏（${htmlEscape(it.blockReason || "blocked")}）。</div>`;
    } else {
      const abs = path.join(rootAbs, ...it.relPath.split("/"));
      const { text } = await safeReadText(abs, SCRIPTBOOK_CONFIG.maxScanBytes);
      const red = redactText({ relPath: it.relPath, text });

      // 默认仅展示前 N 行（你已选择该策略）。
      // 对超过阈值的文件也同样只预览前 N 行。
      const lines = red.text.split(/\r?\n/);
      const preview = lines.slice(0, SCRIPTBOOK_CONFIG.defaultPreviewLines).join("\n");
      const shouldPreviewOnly =
        lines.length > SCRIPTBOOK_CONFIG.defaultPreviewLines ||
        (Number.isFinite(it.sizeBytes) && it.sizeBytes > SCRIPTBOOK_CONFIG.bigFileBytes);

      if (shouldPreviewOnly) {
        notice = `<div class="notice">大文件预览：仅显示前 ${SCRIPTBOOK_CONFIG.defaultPreviewLines} 行（共 ${lines.length} 行）。</div>`;
      }

      codeHtml = htmlEscape(preview);

      // raw 下载（脱敏后）
      const rawDir = path.join(outAbs, "raw");
      await ensureDir(rawDir);
      const rawName = `${it.id}.txt`;
      await fs.writeFile(path.join(rawDir, rawName), red.text, "utf8");
      downloadLink = `<div class="download"><a href="../../raw/${rawName}">下载脱敏后的 raw</a></div>`;

      if (red.report.hits && red.report.hits.length) {
        // 只提示“已脱敏”，不展示命中详情
        notice = notice || `<div class="notice">该文件内容已进行脱敏处理。</div>`;
      }
    }

    const riskLabel = it.blocked ? "已隐藏" : "可展示";

    const refs = readmeRefsByRel.get(it.relPath) || [];
    const scripts = scriptsByRel.get(it.relPath) || null;

    const refsHtml = refs.length
      ? `<div class="notice">README 引用：${htmlEscape(refs.map((r) => r.label).join("、"))}</div>`
      : "";

    const scriptsHtml = scripts
      ? `<div class="notice">npm scripts：${htmlEscape(Object.entries(scripts).map(([k, v]) => `${k} = ${v}`).join("；"))}</div>`
      : "";

    const html = applyTemplate(tplDetail, {
      TITLE: htmlEscape(it.title || it.relPath),
      REL_PATH: htmlEscape(it.relPath),
      LANG: htmlEscape(it.lang || ""),
      PRISM_LANG: prismLang(it.lang || "plain"),
      SIZE: htmlEscape(formatBytes(it.sizeBytes)),
      MTIME: htmlEscape(formatDate(it.mtimeMs)),
      RISK: htmlEscape(riskLabel),
      BLOCK_NOTICE: notice,
      ENTRYPOINTS: scriptsHtml,
      CODE_HTML: codeHtml,
      DOWNLOAD_LINK: downloadLink,
      README_REFS: refsHtml,
      BASE: base || "",
    });

    await fs.writeFile(path.join(pageDir, "index.html"), html, "utf8");
  }

  // stats
  const stats = {
    version: 1,
    generatedAt: new Date().toISOString(),
    fileCount: manifest.items.length,
    blockedCount: manifest.items.filter((x) => x.blocked).length,
  };
  await fs.writeFile(path.join(dataDir, "stats.json"), JSON.stringify(stats, null, 2) + "\n", "utf8");

  return stats;
}

async function main() {
  const args = parseArgs(process.argv);
  const rootAbs = path.resolve(args.root);
  const outAbs = path.resolve(args.out);

  const stats = await buildSite({ rootAbs, outAbs, base: args.base });
  process.stdout.write(`site: ${stats.fileCount} files, blocked ${stats.blockedCount}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
