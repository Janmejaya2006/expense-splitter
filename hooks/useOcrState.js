import { useCallback, useState } from "react";
import { cleanNumber, normalizeReceiptDate } from "@/lib/dashboardUtils";

export default function useOcrState({
  apiRequest,
  clearMessages,
  setError,
  setNotice,
  setBusy,
  setExpenseForm,
}) {
  const [ocrText, setOcrText] = useState("");
  const [ocrParsed, setOcrParsed] = useState(null);
  const [receiptImageFile, setReceiptImageFile] = useState(null);
  const [receiptImagePreview, setReceiptImagePreview] = useState("");
  const [ocrImageMeta, setOcrImageMeta] = useState(null);
  const [ocrImageBusy, setOcrImageBusy] = useState(false);
  const [receiptDragOver, setReceiptDragOver] = useState(false);

  const selectReceiptImageFile = useCallback(
    (file) => {
      if (!file) return;

      if (!String(file.type || "").startsWith("image/")) {
        setError("Upload a valid image file (JPG, PNG, WEBP).");
        return;
      }

      if (Number(file.size || 0) > 8 * 1024 * 1024) {
        setError("Image is too large. Keep file size under 8MB.");
        return;
      }

      clearMessages();
      setReceiptImageFile(file);
      setOcrImageMeta(null);

      setReceiptImagePreview((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(file);
      });
    },
    [clearMessages, setError]
  );

  const clearReceiptImage = useCallback(() => {
    setReceiptImageFile(null);
    setOcrImageMeta(null);
    setReceiptDragOver(false);
    setReceiptImagePreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return "";
    });
  }, []);

  const handleParseReceiptImage = useCallback(async () => {
    if (!receiptImageFile) {
      setError("Upload a receipt image first.");
      return;
    }

    clearMessages();
    setOcrImageBusy(true);

    try {
      const payload = new FormData();
      payload.append("file", receiptImageFile);

      const response = await fetch("/api/ocr/image", {
        method: "POST",
        body: payload,
      });

      if (response.status === 401) {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        throw new Error("Session expired. Please login again.");
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Failed to parse receipt image");
      }

      setOcrParsed(body.parsed || null);
      setOcrText(body.rawText || "");
      setOcrImageMeta(body.ocr || null);
      setNotice("Receipt image parsed. You can now apply extracted values.");
    } catch (err) {
      setError(err.message || "Failed to parse receipt image");
    } finally {
      setOcrImageBusy(false);
    }
  }, [receiptImageFile, setError, clearMessages, setNotice]);

  const handleParseReceipt = useCallback(async () => {
    clearMessages();
    setBusy(true);

    try {
      const body = await apiRequest("/api/ocr/parse", {
        method: "POST",
        body: JSON.stringify({ text: ocrText }),
      });

      setOcrParsed(body.parsed);
      setOcrImageMeta(null);
      setNotice("Receipt parsed. You can use the extracted values in expense form.");
    } catch (err) {
      setError(err.message || "Failed to parse receipt");
    } finally {
      setBusy(false);
    }
  }, [clearMessages, setBusy, apiRequest, ocrText, setNotice, setError]);

  const applyOcrToExpenseForm = useCallback(() => {
    if (!ocrParsed) return;

    setExpenseForm((prev) => ({
      ...prev,
      title: ocrParsed.suggestedTitle || prev.title,
      amount: ocrParsed.total ? String(ocrParsed.total) : prev.amount,
      category: ocrParsed.suggestedCategory || prev.category,
      expenseDate: normalizeReceiptDate(ocrParsed.receiptDate) || prev.expenseDate,
      notes: prev.notes
        ? `${prev.notes} | ${ocrImageMeta ? "Parsed from receipt image" : "Parsed from receipt"}`
        : ocrImageMeta
          ? "Parsed from receipt image"
          : "Parsed from receipt",
    }));

    setNotice("Applied OCR values to expense form.");
  }, [ocrParsed, setExpenseForm, ocrImageMeta, setNotice]);

  return {
    ocrText,
    setOcrText,
    ocrParsed,
    setOcrParsed,
    receiptImageFile,
    receiptImagePreview,
    ocrImageMeta,
    ocrImageBusy,
    receiptDragOver,
    setReceiptDragOver,
    selectReceiptImageFile,
    clearReceiptImage,
    handleParseReceiptImage,
    handleParseReceipt,
    applyOcrToExpenseForm,
    ocrConfidenceLabel: ocrImageMeta
      ? `OCR: ${ocrImageMeta.engine} • Confidence ${Math.round(cleanNumber(ocrImageMeta.confidence) * 100)}%`
      : "Tip: Use clear, well-lit photos for better OCR extraction.",
  };
}
