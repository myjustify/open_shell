import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { scanRepoFiles } from "../build.mjs";

test("scanRepoFiles 仅包含白名单扩展与指定文件", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "scriptbook-scan-"));

  await fs.writeFile(path.join(tmp, "a.sh"), "echo ok\n");
  await fs.writeFile(path.join(tmp, "b.py"), "print('ok')\n");
  await fs.writeFile(path.join(tmp, "c.png"), "\x89PNG\r\n\x1a\n");
  await fs.writeFile(path.join(tmp, "README.md"), "# hello\n");

  await fs.mkdir(path.join(tmp, "dist"));
  await fs.writeFile(path.join(tmp, "dist", "d.sh"), "echo dist\n");

  await fs.mkdir(path.join(tmp, "nodeimg"));
  await fs.writeFile(path.join(tmp, "nodeimg", "package.json"), "{\"scripts\":{\"dev\":\"node server.js\"}}\n");

  const relPaths = await scanRepoFiles(tmp);

  assert.deepEqual(relPaths, ["README.md", "a.sh", "b.py", "nodeimg/package.json"].slice().sort((a, b) => a.localeCompare(b)));
});
