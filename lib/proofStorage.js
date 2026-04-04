import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR, PROOF_ROOT, relativeToDataDir, resolveInsideDataDir } from "./dataPaths.js";

const STORAGE_BACKEND = String(process.env.PROOF_STORAGE_BACKEND || "local").trim().toLowerCase();
const ALLOWED_PROOF_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

function sanitizeName(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w.\- ]+/g, "")
    .slice(0, 120);
}

function extFromMimeType(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  if (value === "image/png") return "png";
  if (value === "image/jpeg") return "jpg";
  if (value === "image/webp") return "webp";
  if (value === "application/pdf") return "pdf";
  return "bin";
}

function normalizeMimeType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "image/jpg") return "image/jpeg";
  if (raw.includes(";")) return raw.split(";")[0].trim();
  return raw;
}

function matchesMimeSignature(buffer, mimeType) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8;
  }
  if (mimeType === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (mimeType === "application/pdf") {
    return buffer.subarray(0, 4).toString("ascii") === "%PDF";
  }
  return false;
}

function ensureInsideRoot(absolutePath) {
  if (!absolutePath) return false;
  const normalizedRoot = path.resolve(PROOF_ROOT);
  const normalizedPath = path.resolve(absolutePath);
  return normalizedPath.startsWith(normalizedRoot);
}

async function storeBinaryProof({ groupId, fileName, mimeType, base64, prefix = "proof" }) {
  if (STORAGE_BACKEND !== "local") {
    throw new Error(`Unsupported proof storage backend: ${STORAGE_BACKEND}`);
  }

  const content = String(base64 || "").trim();
  if (!content) return null;

  const buffer = Buffer.from(content, "base64");
  if (!buffer.length) {
    throw new Error("Proof content is empty");
  }

  const safeMimeType = normalizeMimeType(mimeType);
  if (!ALLOWED_PROOF_MIME_TYPES.has(safeMimeType)) {
    throw new Error("UNSUPPORTED_PROOF_TYPE");
  }
  if (!matchesMimeSignature(buffer, safeMimeType)) {
    throw new Error("INVALID_PROOF_CONTENT");
  }

  await fs.mkdir(PROOF_ROOT, { recursive: true });

  const now = new Date();
  const folder = path.join(PROOF_ROOT, `${now.getUTCFullYear()}`, String(now.getUTCMonth() + 1).padStart(2, "0"));
  await fs.mkdir(folder, { recursive: true });

  const extension = extFromMimeType(safeMimeType);
  const safeBaseName = sanitizeName(fileName).replace(/\.[a-z0-9]+$/i, "") || String(prefix || "proof");
  const proofId = crypto.randomBytes(10).toString("hex");
  const storedFile = `${safeBaseName}-${proofId}.${extension}`;
  const absolutePath = path.join(folder, storedFile);
  await fs.writeFile(absolutePath, buffer);

  const relativePath = relativeToDataDir(absolutePath);
  return {
    storage: STORAGE_BACKEND,
    proofName: sanitizeName(fileName) || "proof",
    proofMimeType: safeMimeType,
    proofPath: relativePath,
    proofBytes: buffer.length,
    proofHash: crypto.createHash("sha256").update(buffer).digest("hex"),
    createdAt: now.toISOString(),
    groupId: Number(groupId),
  };
}

export async function storePaymentProof({ groupId, fileName, mimeType, base64 }) {
  return storeBinaryProof({
    groupId,
    fileName,
    mimeType,
    base64,
    prefix: "payment-proof",
  });
}

export async function storeExpenseProof({ groupId, fileName, mimeType, base64 }) {
  return storeBinaryProof({
    groupId,
    fileName,
    mimeType,
    base64,
    prefix: "expense-proof",
  });
}

export function resolveStoredProofPath(relativePath) {
  const absolutePath = resolveInsideDataDir(relativePath);
  if (!ensureInsideRoot(absolutePath)) {
    return null;
  }
  return absolutePath;
}

export async function readStoredProof(relativePath) {
  const absolutePath = resolveStoredProofPath(relativePath);
  if (!absolutePath) return null;

  try {
    const buffer = await fs.readFile(absolutePath);
    return {
      absolutePath,
      buffer,
    };
  } catch {
    return null;
  }
}

export async function deleteStoredProof(relativePath) {
  const absolutePath = resolveStoredProofPath(relativePath);
  if (!absolutePath) return;

  try {
    await fs.unlink(absolutePath);
  } catch {
    // Ignore cleanup failures to avoid breaking delete flows.
  }
}
