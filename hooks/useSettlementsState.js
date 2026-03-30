import { useCallback, useState } from "react";
import { cleanNumber, formatAmount, round2 } from "@/lib/dashboardUtils";

const EMPTY_PAYMENT_EDIT_MODAL = {
  open: false,
  paymentId: null,
  note: "",
};

const EMPTY_SETTLEMENT_PAY_MODAL = {
  open: false,
  fromMemberId: null,
  toMemberId: null,
  fromName: "",
  toName: "",
  maxAmount: 0,
  amount: "",
  note: "",
  proofFile: null,
};

export default function useSettlementsState({
  selectedGroupId,
  canNotifySettlement,
  canManageSelectedGroup,
  canMarkSettlementPaid,
  currentCurrency,
  apiRequest,
  loadOverview,
  loadGroupDetail,
  clearMessages,
  setBusy,
  setError,
  setNotice,
}) {
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [settlementMessage, setSettlementMessage] = useState("");
  const [paymentEditModal, setPaymentEditModal] = useState(EMPTY_PAYMENT_EDIT_MODAL);
  const [settlementPayModal, setSettlementPayModal] = useState(EMPTY_SETTLEMENT_PAY_MODAL);

  const handleNotifySettlement = useCallback(
    async (settlement, channel) => {
      if (!selectedGroupId || !settlement || !canNotifySettlement) return;

      clearMessages();
      setNotifyBusy(true);

      try {
        const body = await apiRequest(`/api/groups/${selectedGroupId}/settlements/notify`, {
          method: "POST",
          body: JSON.stringify({
            fromMemberId: settlement.fromMemberId,
            toMemberId: settlement.toMemberId,
            amount: settlement.amount,
            channel,
            message: settlementMessage,
          }),
        });

        const sentChannels = Object.entries(body.delivery || {})
          .filter(([, item]) => item.status === "sent")
          .map(([key]) => key.toUpperCase());

        const failedChannels = Object.entries(body.delivery || {})
          .filter(([, item]) => item.status !== "sent")
          .map(([key, item]) => `${key.toUpperCase()}: ${item.message}`);

        let message = sentChannels.length
          ? `Sent settlement notice via ${sentChannels.join(", ")}.`
          : "Settlement notice was processed.";

        if (failedChannels.length) {
          message = `${message} Failed: ${failedChannels.join(" | ")}`;
        }

        setNotice(message);
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to send settlement notification");
      } finally {
        setNotifyBusy(false);
      }
    },
    [
      selectedGroupId,
      canNotifySettlement,
      clearMessages,
      apiRequest,
      settlementMessage,
      setNotice,
      loadGroupDetail,
      setError,
    ]
  );

  const toBase64 = useCallback(
    (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || "");
          const base64 = result.includes(",") ? result.split(",")[1] : result;
          resolve(base64);
        };
        reader.onerror = () => reject(new Error("Could not read selected file"));
        reader.readAsDataURL(file);
      }),
    []
  );

  const handleRetryNotification = useCallback(
    async (logId) => {
      if (!selectedGroupId || !logId) return;

      clearMessages();
      setNotifyBusy(true);

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/notifications/retry`, {
          method: "POST",
          body: JSON.stringify({ logId }),
        });

        setNotice("Notification retry processed");
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to retry notification");
      } finally {
        setNotifyBusy(false);
      }
    },
    [selectedGroupId, clearMessages, apiRequest, setNotice, loadGroupDetail, setError]
  );

  const openPaymentEditModal = useCallback(
    (payment) => {
      if (!payment || !canManageSelectedGroup) return;
      setPaymentEditModal({
        open: true,
        paymentId: Number(payment.id),
        note: String(payment.note || ""),
      });
    },
    [canManageSelectedGroup]
  );

  const handleSubmitPaymentEdit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!selectedGroupId || !paymentEditModal.paymentId || !canManageSelectedGroup) return;

      clearMessages();
      setBusy(true);

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/settlements/payments/${paymentEditModal.paymentId}`, {
          method: "PATCH",
          body: JSON.stringify({ note: String(paymentEditModal.note || "").trim() }),
        });

        setNotice("Payment updated");
        setPaymentEditModal(EMPTY_PAYMENT_EDIT_MODAL);
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to update payment");
      } finally {
        setBusy(false);
      }
    },
    [
      selectedGroupId,
      paymentEditModal,
      canManageSelectedGroup,
      clearMessages,
      setBusy,
      apiRequest,
      setNotice,
      loadGroupDetail,
      setError,
    ]
  );

  const handleDeleteSettlementPayment = useCallback(
    async (payment) => {
      if (!selectedGroupId || !payment || !canManageSelectedGroup) return;
      if (typeof window !== "undefined") {
        const confirmed = window.confirm("Delete this payment entry?");
        if (!confirmed) return;
      }

      clearMessages();
      setBusy(true);

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/settlements/payments/${payment.id}`, {
          method: "DELETE",
        });

        setNotice("Payment deleted");
        await loadOverview();
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to delete payment");
      } finally {
        setBusy(false);
      }
    },
    [
      selectedGroupId,
      canManageSelectedGroup,
      clearMessages,
      setBusy,
      apiRequest,
      setNotice,
      loadOverview,
      loadGroupDetail,
      setError,
    ]
  );

  const handleDeleteNotificationLog = useCallback(
    async (log) => {
      if (!selectedGroupId || !log || !canManageSelectedGroup) return;
      if (typeof window !== "undefined") {
        const confirmed = window.confirm("Delete this notification log?");
        if (!confirmed) return;
      }

      clearMessages();
      setNotifyBusy(true);

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/notifications/${log.id}`, {
          method: "DELETE",
        });

        setNotice("Notification log deleted");
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to delete notification log");
      } finally {
        setNotifyBusy(false);
      }
    },
    [
      selectedGroupId,
      canManageSelectedGroup,
      clearMessages,
      apiRequest,
      setNotice,
      loadGroupDetail,
      setError,
    ]
  );

  const openSettlementPayModal = useCallback(
    (settlement) => {
      if (!settlement || !canMarkSettlementPaid) return;
      setSettlementPayModal({
        open: true,
        fromMemberId: Number(settlement.fromMemberId),
        toMemberId: Number(settlement.toMemberId),
        fromName: String(settlement.fromName || ""),
        toName: String(settlement.toName || ""),
        maxAmount: cleanNumber(settlement.amount),
        amount: String(round2(cleanNumber(settlement.amount))),
        note: "",
        proofFile: null,
      });
    },
    [canMarkSettlementPaid]
  );

  const handleSubmitSettlementPaid = useCallback(
    async (event) => {
      event.preventDefault();
      if (
        !selectedGroupId ||
        !settlementPayModal.fromMemberId ||
        !settlementPayModal.toMemberId ||
        !canMarkSettlementPaid
      ) {
        return;
      }

      const amount = cleanNumber(settlementPayModal.amount);
      if (amount <= 0) {
        setError("Paid amount must be positive");
        return;
      }

      clearMessages();
      setBusy(true);

      try {
        let proof = null;
        if (settlementPayModal.proofFile) {
          proof = {
            name: settlementPayModal.proofFile.name,
            type: settlementPayModal.proofFile.type,
            base64: await toBase64(settlementPayModal.proofFile),
          };
        }

        await apiRequest(`/api/groups/${selectedGroupId}/settlements/payments`, {
          method: "POST",
          body: JSON.stringify({
            fromMemberId: settlementPayModal.fromMemberId,
            toMemberId: settlementPayModal.toMemberId,
            amount,
            note: String(settlementPayModal.note || "").trim(),
            proof,
          }),
        });

        setNotice(`Recorded payment of ${formatAmount(amount, currentCurrency)}.`);
        setSettlementPayModal(EMPTY_SETTLEMENT_PAY_MODAL);
        await loadOverview();
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to mark settlement as paid");
      } finally {
        setBusy(false);
      }
    },
    [
      selectedGroupId,
      settlementPayModal,
      canMarkSettlementPaid,
      setError,
      clearMessages,
      setBusy,
      toBase64,
      apiRequest,
      setNotice,
      currentCurrency,
      loadOverview,
      loadGroupDetail,
    ]
  );

  const resetSettlementsState = useCallback(() => {
    setSettlementMessage("");
    setPaymentEditModal(EMPTY_PAYMENT_EDIT_MODAL);
    setSettlementPayModal(EMPTY_SETTLEMENT_PAY_MODAL);
  }, []);

  return {
    notifyBusy,
    settlementMessage,
    setSettlementMessage,
    paymentEditModal,
    setPaymentEditModal,
    settlementPayModal,
    setSettlementPayModal,
    handleNotifySettlement,
    handleRetryNotification,
    openPaymentEditModal,
    handleSubmitPaymentEdit,
    handleDeleteSettlementPayment,
    handleDeleteNotificationLog,
    openSettlementPayModal,
    handleSubmitSettlementPaid,
    resetSettlementsState,
  };
}
