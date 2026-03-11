import test from "node:test";
import assert from "node:assert/strict";

import { redactText } from "../redact.mjs";

test("redactText 命中私钥应阻断", () => {
  const text = "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----\n";
  const out = redactText({ relPath: "a.sh", text });
  assert.equal(out.blocked, true);
  assert.equal(out.text, "");
  assert.ok(out.report.blockReasons.includes("private_key_block"));
});

test("redactText 脱敏邮箱与 token= 形式", () => {
  const text = "email=a@b.com\ntoken=abcdef123456\n";
  const out = redactText({ relPath: "a.sh", text });
  assert.equal(out.blocked, false);
  assert.ok(out.text.includes("***@***"));
  assert.ok(/token=.*\*\*\*/.test(out.text));
});
