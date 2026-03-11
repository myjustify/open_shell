import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("build.mjs 可生成 index 与详情页", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "scriptbook-site-"));
  await fs.writeFile(path.join(tmp, "a.sh"), "# Title: A\n# Desc: D\necho ok\n");
  await fs.writeFile(path.join(tmp, "README.md"), "# Hello\n");
  await fs.mkdir(path.join(tmp, "nodeimg"));
  await fs.writeFile(path.join(tmp, "nodeimg", "package.json"), "{\"scripts\":{\"dev\":\"node server.js\"}}\n");

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

  const indexHtml = await fs.readFile(path.join(outDir, "index.html"), "utf8");
  assert.ok(indexHtml.includes("ScriptBook"));

  const manifestRaw = await fs.readFile(path.join(outDir, "data", "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestRaw);
  const a = manifest.items.find((x) => x.relPath === "a.sh");
  assert.ok(a);

  const detailHtml = await fs.readFile(path.join(outDir, "s", a.id, "index.html"), "utf8");
  assert.ok(detailHtml.includes("echo ok"));
});
