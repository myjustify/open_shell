#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { SCRIPTBOOK_CONFIG } from "./config.mjs";

export async function scanRepoFiles(rootDir) {
  const rootAbs = path.resolve(rootDir);
  const results = [];

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

async function main() {
  const args = parseArgs(process.argv);
  const files = await scanRepoFiles(args.root);
  // Task 1 阶段：仅验证扫描输入范围，先输出到 stdout。
  process.stdout.write(files.join("\n") + (files.length ? "\n" : ""));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
