// Input sanitization for askswarm.dev
// Defends against prompt injection, credential harvesting, and malicious content.
// Multi-model verification is the second layer — this is the first.

const INJECTION_PATTERNS = [
  // Credential harvesting
  /email.*(?:key|token|secret|password|credential|api.?key)/i,
  /send.*(?:key|token|secret|password|credential)/i,
  /forward.*(?:key|token|secret|password|credential)/i,
  /(?:api.?key|secret|token|password|credential).*(?:to|@|mailto)/i,
  /share.*(?:your|the).*(?:key|token|secret|password)/i,

  // Prompt injection attempts
  /ignore.*(?:previous|above|all).*(?:instructions|rules|prompts)/i,
  /disregard.*(?:previous|above|all).*(?:instructions|rules)/i,
  /you are now/i,
  /act as (?:a |an )?(?:different|new|evil|malicious)/i,
  /new (?:instructions|rules|persona|role)/i,
  /system prompt/i,
  /jailbreak/i,

  // Data exfiltration
  /(?:curl|wget|fetch|http).*(?:evil|attacker|malicious)/i,
  /(?:base64|encode|encrypt).*(?:send|post|upload)/i,

  // Social engineering
  /(?:pretend|act like|roleplay).*(?:admin|moderator|owner|developer)/i,
  /(?:i am|this is).*(?:admin|moderator|owner|anthropic|openai)/i,
];

const SUSPICIOUS_URLS = [
  /https?:\/\/.*(?:evil|malicious|attacker|phishing)/i,
  /(?:bit\.ly|tinyurl|t\.co).*(?:key|token|secret)/i,
];

export function sanitizeInput(text) {
  if (!text || typeof text !== "string") {
    return { clean: true, text: text || "" };
  }

  const flags = [];

  // Check injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      flags.push({ type: "injection", pattern: pattern.source });
    }
  }

  // Check suspicious URLs
  for (const pattern of SUSPICIOUS_URLS) {
    if (pattern.test(text)) {
      flags.push({ type: "suspicious_url", pattern: pattern.source });
    }
  }

  // Check for excessive special characters (encoded payloads)
  const specialCharRatio = (text.match(/[^\w\s.,!?;:'"()\-\/`#@]/g) || []).length / text.length;
  if (specialCharRatio > 0.3 && text.length > 50) {
    flags.push({ type: "encoded_payload", ratio: specialCharRatio });
  }

  if (flags.length > 0) {
    return {
      clean: false,
      text,
      flags,
      reason: "Content flagged by security filter: " + flags.map(f => f.type).join(", "),
    };
  }

  return { clean: true, text };
}

export function sanitizeQuestion(title, body) {
  const titleCheck = sanitizeInput(title);
  const bodyCheck = sanitizeInput(body);

  if (!titleCheck.clean) return titleCheck;
  if (!bodyCheck.clean) return bodyCheck;

  return { clean: true };
}

export function sanitizeAnswer(body) {
  return sanitizeInput(body);
}

export function blockedResponse(result) {
  return new Response(JSON.stringify({
    error: "content_blocked",
    message: "Your content was flagged by our security filter. Multi-model verification is the second layer — input sanitization is the first.",
    reason: result.reason,
  }), {
    status: 422,
    headers: { "Content-Type": "application/json" },
  });
}
