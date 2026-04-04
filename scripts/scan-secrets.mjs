#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PATH_ALLOWLIST = [
  /^README\.md$/,
  /^\.env\.example$/,
  /^package-lock\.json$/,
  /^public\/ui\/assets\//,
  /^tests\//,
  /^data\/db\.json$/,
];

const PLACEHOLDER_TOKENS = [
  "changeme",
  "replace",
  "example",
  "your_real",
  "xxxxxxxx",
  "local-dev",
  "test",
  "dummy",
  "sample",
];

const PATTERNS = [
  { label: "OpenAI API key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { label: "Resend API key", regex: /\bre_[A-Za-z0-9_-]{20,}\b/g },
  { label: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{20,}\b/g },
  { label: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    label: "Private key block",
    regex: /-----BEGIN (RSA|EC|DSA|OPENSSH|PGP|PRIVATE) KEY-----/g,
  },
  {
    label: "Secret assignment",
    regex:
      /\b(AUTH_SECRET|OPENAI_API_KEY|GOOGLE_OAUTH_CLIENT_SECRET|STRIPE_SECRET_KEY|PAYPAL_CLIENT_SECRET|TWILIO_AUTH_TOKEN|WEB_PUSH_VAPID_PRIVATE_KEY|RAZORPAY_KEY_SECRET)\b\s*[:=]\s*["']?[A-Za-z0-9_\-+/=]{24,}/gi,
  },
];

function isAllowlistedPath(filePath) {
  return PATH_ALLOWLIST.some((rule) => rule.test(filePath));
}

function isPlaceholder(value) {
  const text = String(value || "").toLowerCase();
  return PLACEHOLDER_TOKENS.some((token) => text.includes(token));
}

function listTrackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return output
    .split("\0")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readTextFile(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function findLineNumber(content, index) {
  const before = content.slice(0, Math.max(0, index));
  return before.split("\n").length;
}

function sanitizeSnippet(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function collectFindings() {
  const findings = [];
  const files = listTrackedFiles();

  for (const filePath of files) {
    if (isAllowlistedPath(filePath)) continue;
    if (filePath.includes("/.next/")) continue;
    if (filePath.startsWith("node_modules/")) continue;
    if (/^\.env(\.|$)/.test(filePath)) continue;

    const content = readTextFile(filePath);
    if (!content) continue;

    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const matchText = String(match[0] || "");
        if (isPlaceholder(matchText)) continue;

        findings.push({
          filePath,
          label: pattern.label,
          line: findLineNumber(content, match.index),
          snippet: sanitizeSnippet(matchText),
        });
      }
    }
  }

  return findings;
}

function main() {
  const findings = collectFindings();
  if (!findings.length) {
    console.log("security:scan passed (no hardcoded secrets detected)");
    process.exit(0);
  }

  console.error("security:scan failed. Potential secrets detected:");
  for (const finding of findings) {
    console.error(
      `- ${finding.filePath}:${finding.line} [${finding.label}] ${finding.snippet}`
    );
  }

  process.exit(1);
}

main();
