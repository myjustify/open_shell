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

async function safeReadText(absPath, maxBytes) {
  const buf = await fs.readFile(absPath);
  if (buf.byteLength > maxBytes) {
    return { tooLarge: true, text: "" };
  }
  return { tooLarge: false, text: buf.toString("utf8") };
}

async function buildManifest({ rootAbs, relPaths }) {
  const items = [];
  const redactionReports = [];

  for (const relPath of relPaths) {
    const abs = path.join(rootAbs, ...relPath.split("/"));
    const st = await fs.stat(abs);

    const ext = path.extname(relPath).toLowerCase();
    const id = sha1Hex(relPath);

    const { tooLarge, text } = await safeReadText(abs, SCRIPTBOOK_CONFIG.maxScanBytes);
    const firstLine = text.split(/\r?\n/)[0] || "";

    const header = parseHeaderMeta(text, 60);

    // 脱敏/阻断：仅在允许扫描内容范围内执行；过大文件直接标记 too_large。
    let blocked = tooLarge;
    let blockReason = tooLarge ? "too_large" : "";

    if (!tooLarge) {
      const red = redactText({ relPath, text });
      redactionReports.push(red.report);
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
      sizeBytes: st.size,
      mtimeMs: st.mtimeMs,
      lang: inferLang({ relPath, ext, firstLine }),
      title: header.title || defaultTitleFromPath(relPath),
      desc: header.desc || "",
      tags: header.tags || [],
      blocked,
      blockReason,
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

async function main() {
  const args = parseArgs(process.argv);
  const rootAbs = path.resolve(args.root);
  const outAbs = path.resolve(args.out);

  const relPaths = await scanRepoFiles(rootAbs);
  const { manifest, redactionReport } = await buildManifest({ rootAbs, relPaths });

  await ensureDir(path.join(outAbs, "data"));
  await fs.writeFile(
    path.join(outAbs, "data", "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(outAbs, "data", "redaction-report.json"),
    JSON.stringify(redactionReport, null, 2) + "\n",
    "utf8",
  );

  process.stdout.write(`manifest: ${manifest.items.length} files\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
