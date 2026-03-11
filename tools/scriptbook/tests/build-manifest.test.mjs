import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { scanRepoFiles } from "../build.mjs";

test("build 脚本可生成最小 manifest.json", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "scriptbook-manifest-"));
  await fs.writeFile(path.join(tmp, "a.sh"), "# Title: A\n# Desc: D\necho ok\n");
  await fs.writeFile(path.join(tmp, "README.md"), "# Hello\n");
  await fs.mkdir(path.join(tmp, "nodeimg"));
  await fs.writeFile(path.join(tmp, "nodeimg", "package.json"), "{\"scripts\":{\"dev\":\"node server.js\"}}\n");

  const relPaths = await scanRepoFiles(tmp);
  // 运行 build.mjs 的 main 比较重，这里直接复用其输出文件逻辑。
  // 我们通过运行子进程方式验证生成结果。
  const outDir = path.join(tmp, "out");

  const { spawn } = await import("node:child_process");
  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [
      path.join(
        path.dirname(new URL(import.meta.url).pathname),
        "..",
        "build.mjs",
      ),
      "--root",
      tmp,
      "--out",
      outDir,
    ]);
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    p.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `exit ${code}`));
      else resolve();
    });
  });

  const manifestRaw = await fs.readFile(path.join(outDir, "data", "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestRaw);

  assert.equal(manifest.version, 1);
  assert.ok(Array.isArray(manifest.items));
  assert.equal(manifest.items.length, 3);

  const a = manifest.items.find((x) => x.relPath === "a.sh");
  assert.ok(a);
  assert.equal(a.lang, "bash");
  assert.equal(a.title, "A");
  assert.equal(a.desc, "D");
});
