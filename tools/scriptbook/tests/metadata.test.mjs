import test from "node:test";
import assert from "node:assert/strict";

import { inferLang, parseHeaderMeta } from "../parse-metadata.mjs";

test("inferLang 根据扩展名识别语言", () => {
  assert.equal(inferLang({ relPath: "a.sh", ext: ".sh", firstLine: "" }), "bash");
  assert.equal(inferLang({ relPath: "a.py", ext: ".py", firstLine: "" }), "python");
  assert.equal(inferLang({ relPath: "a.ps1", ext: ".ps1", firstLine: "" }), "powershell");
  assert.equal(inferLang({ relPath: "a.yaml", ext: ".yaml", firstLine: "" }), "yaml");
});

test("parseHeaderMeta 解析 Title/Desc/Tags", () => {
  const text = [
    "# Title: 证书管理",
    "# Desc: 申请与续期",
    "# Tags: ssl, acme, cert",
    "echo ok",
  ].join("\n");

  const meta = parseHeaderMeta(text);
  assert.equal(meta.title, "证书管理");
  assert.equal(meta.desc, "申请与续期");
  assert.deepEqual(meta.tags, ["ssl", "acme", "cert"]);
});

test("parseHeaderMeta 无显式字段时，取第一条注释作为 desc", () => {
  const text = [
    "#!/usr/bin/env bash",
    "# 这是一个工具脚本",
    "echo ok",
  ].join("\n");
  const meta = parseHeaderMeta(text);
  assert.equal(meta.title, "");
  assert.equal(meta.desc, "这是一个工具脚本");
  assert.deepEqual(meta.tags, []);
});
