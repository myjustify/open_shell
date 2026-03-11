const RULES = {
  // 高危：直接阻断
  block: [
    {
      id: "private_key_block",
      re: /BEGIN (?:RSA|OPENSSH|EC|PGP) PRIVATE KEY/i,
      desc: "私钥内容",
    },
    {
      id: "auth_bearer_block",
      re: /Authorization\s*:\s*Bearer\s+\S+/i,
      desc: "Authorization Bearer 令牌",
    },
    {
      id: "jwt_block",
      re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
      desc: "疑似 JWT",
    },
  ],

  // 中危：脱敏
  redact: [
    {
      id: "email_redact",
      re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      desc: "邮箱",
      replacer: () => "***@***",
    },
    {
      id: "kv_secret_redact",
      // 形如 token=..., token: ..., password: ... 等（允许空格与引号）
      re: /\b(token|api[_-]?key|secret|password|passwd)\b\s*[:=]\s*(["']?)([^\s"'\\]{4,})(\2)/gi,
      desc: "常见密钥字段",
      replacer: (m, k, q, v) => {
        const masked = maskValue(String(v));
        return `${k}=${q}${masked}${q}`;
      },
    },
    {
      id: "url_query_redact",
      re: /(\b(?:token|access_token|api_key|key|secret|password)=)([^&\s#]+)/gi,
      desc: "URL query 密钥",
      replacer: (m, p1, v) => `${p1}${maskValue(String(v))}`,
    },
  ],
};

function maskValue(v) {
  const s = String(v);
  if (s.length <= 6) return "***";
  return `${s.slice(0, 2)}***${s.slice(-2)}`;
}

export function redactText({ relPath, text }) {
  const report = {
    relPath,
    blocked: false,
    blockReasons: [],
    hits: [],
  };

  let out = String(text);

  // 按行给出大概行号（用于 report，不写出命中片段）
  const lines = out.split(/\r?\n/);
  const markHit = (ruleId, lineNo) => {
    report.hits.push({ ruleId, line: lineNo });
  };

  // 先做阻断检测（全量扫描，找到第一处就阻断，但仍记录行号）
  for (const r of RULES.block) {
    for (let i = 0; i < lines.length; i++) {
      if (r.re.test(lines[i])) {
        report.blocked = true;
        report.blockReasons.push(r.id);
        markHit(r.id, i + 1);
        break;
      }
    }
    if (report.blocked) break;
  }

  if (report.blocked) {
    return {
      blocked: true,
      text: "",
      report,
    };
  }

  // 脱敏替换（逐条规则）
  for (const r of RULES.redact) {
    // 记录行号：先扫描行，再替换全量
    for (let i = 0; i < lines.length; i++) {
      if (r.re.test(lines[i])) {
        markHit(r.id, i + 1);
      }
    }

    out = out.replace(r.re, (...args) => {
      if (typeof r.replacer === "function") return r.replacer(...args);
      return "***";
    });
  }

  return {
    blocked: false,
    text: out,
    report,
  };
}
