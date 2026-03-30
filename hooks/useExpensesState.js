import { useCallback, useState } from "react";
import { cleanNumber } from "@/lib/dashboardUtils";

const EMPTY_EXPENSE_FORM = {
  title: "",
  amount: "",
  payerMemberId: "",
  participants: [],
  splitMode: "equal",
  splitPercentages: {},
  splitShares: {},
  category: "Misc",
  currency: "",
  expenseDate: "",
  notes: "",
  proofFile: null,
  recurringEnabled: false,
  recurringDayOfMonth: "1",
};

const EMPTY_EXPENSE_EDIT_MODAL = {
  open: false,
  expenseId: null,
  title: "",
  amount: "",
  category: "Misc",
  expenseDate: "",
  notes: "",
};

export default function useExpensesState({
  selectedGroupId,
  selectedMembers,
  canAddExpense,
  canEditExpenses,
  apiRequest,
  loadOverview,
  loadGroupDetail,
  clearMessages,
  setBusy,
  setError,
  setNotice,
}) {
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE_FORM);
  const [expenseEditModal, setExpenseEditModal] = useState(EMPTY_EXPENSE_EDIT_MODAL);

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

  const toggleParticipant = useCallback((memberId) => {
    const memberKey = String(memberId);

    setExpenseForm((prev) => {
      const exists = prev.participants.includes(memberKey);
      const participants = exists
        ? prev.participants.filter((id) => id !== memberKey)
        : [...prev.participants, memberKey];

      const splitPercentages = {};
      const splitShares = {};

      for (const id of participants) {
        splitPercentages[id] = cleanNumber(prev.splitPercentages[id]);
        splitShares[id] = cleanNumber(prev.splitShares[id]) > 0 ? cleanNumber(prev.splitShares[id]) : 1;
      }

      return {
        ...prev,
        participants,
        splitPercentages,
        splitShares,
      };
    });
  }, []);

  const toggleAllParticipants = useCallback(() => {
    setExpenseForm((prev) => {
      const participantIds = selectedMembers.map((member) => String(member.id));
      if (!participantIds.length) return prev;

      const allSelected = participantIds.every((id) => prev.participants.includes(id));
      const participants = allSelected ? [] : participantIds;

      const splitPercentages = {};
      const splitShares = {};

      for (const id of participants) {
        splitPercentages[id] = cleanNumber(prev.splitPercentages[id]);
        splitShares[id] = cleanNumber(prev.splitShares[id]) > 0 ? cleanNumber(prev.splitShares[id]) : 1;
      }

      return {
        ...prev,
        participants,
        splitPercentages,
        splitShares,
      };
    });
  }, [selectedMembers]);

  const buildSplitConfig = useCallback(() => {
    if (expenseForm.splitMode === "percent") {
      const percentages = {};
      for (const memberId of expenseForm.participants) {
        percentages[memberId] = cleanNumber(expenseForm.splitPercentages[memberId]);
      }
      return { percentages };
    }

    if (expenseForm.splitMode === "shares") {
      const shares = {};
      for (const memberId of expenseForm.participants) {
        shares[memberId] = cleanNumber(expenseForm.splitShares[memberId]);
      }
      return { shares };
    }

    return null;
  }, [expenseForm]);

  const resetExpenseForm = useCallback(() => {
    setExpenseForm((prev) => ({
      ...EMPTY_EXPENSE_FORM,
      payerMemberId: prev.payerMemberId,
      currency: prev.currency,
      participants: [],
    }));
  }, []);

  const handleAddExpense = useCallback(
    async (event) => {
      event.preventDefault();
      if (!selectedGroupId || !canAddExpense) return;

      clearMessages();
      setBusy(true);

      try {
        let proof = null;
        if (expenseForm.proofFile) {
          proof = {
            name: expenseForm.proofFile.name,
            type: expenseForm.proofFile.type,
            base64: await toBase64(expenseForm.proofFile),
          };
        }

        await apiRequest(`/api/groups/${selectedGroupId}/expenses`, {
          method: "POST",
          body: JSON.stringify({
            title: expenseForm.title,
            amount: cleanNumber(expenseForm.amount),
            payerMemberId: Number(expenseForm.payerMemberId),
            participants: expenseForm.participants.map((id) => Number(id)),
            splitMode: expenseForm.splitMode,
            splitConfig: buildSplitConfig(),
            category: expenseForm.category,
            currency: expenseForm.currency,
            expenseDate: expenseForm.expenseDate,
            notes: expenseForm.notes,
            proof,
            recurring: {
              enabled: Boolean(expenseForm.recurringEnabled),
              dayOfMonth: cleanNumber(expenseForm.recurringDayOfMonth) || 1,
            },
          }),
        });

        setNotice("Expense added and settlements recalculated");
        resetExpenseForm();
        await loadOverview();
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to add expense");
      } finally {
        setBusy(false);
      }
    },
    [
      selectedGroupId,
      canAddExpense,
      clearMessages,
      setBusy,
      apiRequest,
      expenseForm,
      buildSplitConfig,
      toBase64,
      setNotice,
      resetExpenseForm,
      loadOverview,
      loadGroupDetail,
      setError,
    ]
  );

  const openExpenseEditModal = useCallback(
    (expense) => {
      if (!expense || !canEditExpenses) return;
      setExpenseEditModal({
        open: true,
        expenseId: Number(expense.id),
        title: String(expense.title || ""),
        amount: String(expense.amount || ""),
        category: String(expense.category || "Misc"),
        expenseDate: String(expense.expenseDate || "").slice(0, 10),
        notes: String(expense.notes || ""),
        payerMemberId: Number(expense.payerMemberId),
        participants: (expense.participants || []).map((id) => Number(id)),
        splitMode: expense.splitMode || "equal",
        splitConfig: expense.splitConfig || null,
      });
    },
    [canEditExpenses]
  );

  const handleSubmitExpenseEdit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!selectedGroupId || !expenseEditModal.expenseId || !canEditExpenses) return;

      const amount = cleanNumber(expenseEditModal.amount);
      if (amount <= 0) {
        setError("Amount must be positive");
        return;
      }

      clearMessages();
      setBusy(true);

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/expenses/${expenseEditModal.expenseId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: String(expenseEditModal.title || "").trim(),
            amount,
            payerMemberId: Number(expenseEditModal.payerMemberId),
            participants: (expenseEditModal.participants || []).map((id) => Number(id)),
            splitMode: expenseEditModal.splitMode || "equal",
            splitConfig: expenseEditModal.splitConfig || null,
            category: String(expenseEditModal.category || "Misc").trim() || "Misc",
            expenseDate: String(expenseEditModal.expenseDate || ""),
            notes: String(expenseEditModal.notes || ""),
          }),
        });

        setNotice("Expense updated");
        setExpenseEditModal(EMPTY_EXPENSE_EDIT_MODAL);
        await loadOverview();
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to update expense");
      } finally {
        setBusy(false);
      }
    },
    [
      selectedGroupId,
      expenseEditModal,
      canEditExpenses,
      setError,
      clearMessages,
      setBusy,
      apiRequest,
      setNotice,
      loadOverview,
      loadGroupDetail,
    ]
  );

  const handleDeleteExpense = useCallback(
    async (expense) => {
      if (!selectedGroupId || !expense || !canEditExpenses) return;
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(`Delete expense "${expense.title}"?`);
        if (!confirmed) return;
      }

      clearMessages();
      setBusy(true);

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/expenses/${expense.id}`, {
          method: "DELETE",
        });

        setNotice("Expense deleted");
        await loadOverview();
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to delete expense");
      } finally {
        setBusy(false);
      }
    },
    [
      selectedGroupId,
      canEditExpenses,
      clearMessages,
      setBusy,
      apiRequest,
      setNotice,
      loadOverview,
      loadGroupDetail,
      setError,
    ]
  );

  const closeExpenseEditModal = useCallback(() => {
    setExpenseEditModal(EMPTY_EXPENSE_EDIT_MODAL);
  }, []);

  return {
    expenseForm,
    setExpenseForm,
    expenseEditModal,
    setExpenseEditModal,
    toggleParticipant,
    toggleAllParticipants,
    handleAddExpense,
    openExpenseEditModal,
    handleSubmitExpenseEdit,
    handleDeleteExpense,
    closeExpenseEditModal,
  };
}
