import test from "node:test";
import assert from "node:assert/strict";
import { deleteStoredProof, readStoredProof, storeExpenseProof, storePaymentProof } from "../lib/proofStorage.js";

test("storePaymentProof saves and reads proof file", async () => {
  const pdfBuffer = Buffer.concat([Buffer.from("%PDF-1.4\n", "ascii"), Buffer.from("sample-proof-content", "utf8")]);
  const base64 = pdfBuffer.toString("base64");
  const saved = await storePaymentProof({
    groupId: 1,
    fileName: "receipt-proof.pdf",
    mimeType: "application/pdf",
    base64,
  });

  assert.ok(saved);
  assert.equal(saved.storage, "local");
  assert.ok(saved.proofPath);
  assert.ok(saved.proofBytes > 0);

  const loaded = await readStoredProof(saved.proofPath);
  assert.ok(loaded);
  assert.deepEqual(loaded.buffer, pdfBuffer);

  await deleteStoredProof(saved.proofPath);
  const afterDelete = await readStoredProof(saved.proofPath);
  assert.equal(afterDelete, null);
});

test("storeExpenseProof saves expense attachment file", async () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngBuffer = Buffer.concat([pngHeader, Buffer.from("expense-proof-content", "utf8")]);
  const base64 = pngBuffer.toString("base64");
  const saved = await storeExpenseProof({
    groupId: 2,
    fileName: "expense-proof.png",
    mimeType: "image/png",
    base64,
  });

  assert.ok(saved);
  assert.ok(saved.proofPath);
  const loaded = await readStoredProof(saved.proofPath);
  assert.ok(loaded);
  assert.deepEqual(loaded.buffer, pngBuffer);

  await deleteStoredProof(saved.proofPath);
});
