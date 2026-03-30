"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useScrollReveal from "@/hooks/useScrollReveal";
import useApiRequest from "@/hooks/useApiRequest";
import useOverviewData from "@/hooks/useOverviewData";
import useGroupDetail from "@/hooks/useGroupDetail";
import useExpenseListState from "@/hooks/useExpenseListState";
import useExpensesState from "@/hooks/useExpensesState";
import useMembersInvitesState from "@/hooks/useMembersInvitesState";
import useSettlementsState from "@/hooks/useSettlementsState";
import useOcrState from "@/hooks/useOcrState";
import useAiPlannerState from "@/hooks/useAiPlannerState";
import Modal from "@/components/Modal";
import {
  AI_SAMPLE_PROMPT,
  cleanNumber,
  formatAmount,
  formatDate,
  formatDateTime,
  hasValue,
  normalizeCurrency,
  SUPPORTED_CURRENCIES,
} from "@/lib/dashboardUtils";

const EMPTY_GROUP_FORM = {
  name: "",
  description: "",
  currency: "INR",
};

const THEME_STORAGE_KEY = "expense-split-theme";
const BROWSER_NOTIFY_ACTIVITY_KEY = "expense-split-last-activity";
const BROWSER_NOTIFY_TOGGLE_KEY = "expense-split-browser-notify";

const CHART_COLORS = ["#0284c7", "#0f766e", "#f97316", "#16a34a", "#eab308", "#ef4444", "#6366f1", "#14b8a6"];

function sanitizeUpiHandle(value) {
  return String(value || "").trim().toLowerCase();
}

function buildUpiPaymentUri({ upiId, payeeName, amount, note, currency = "INR" }) {
  const pa = sanitizeUpiHandle(upiId);
  if (!pa) return "";
  const params = new URLSearchParams({
    pa,
    pn: String(payeeName || "Payee"),
    am: Number(amount || 0).toFixed(2),
    cu: String(currency || "INR").toUpperCase(),
    tn: String(note || "Expense settlement"),
  });
  return `upi://pay?${params.toString()}`;
}

function base64UrlToUint8Array(base64UrlValue) {
  const base64 = String(base64UrlValue || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  const rawData = atob(padded);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function Dashboard({ loggedInUserEmail = "", loggedInUserId = 0 }) {
  const [groupForm, setGroupForm] = useState(EMPTY_GROUP_FORM);

  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [exportMonth, setExportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [theme, setTheme] = useState("light");
  const [groupEditForm, setGroupEditForm] = useState(EMPTY_GROUP_FORM);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    title: "",
    amount: "",
    payerMemberId: "",
    participants: [],
    splitMode: "equal",
    splitPercentages: {},
    splitShares: {},
    category: "Misc",
    currency: "",
    notes: "",
    dayOfMonth: "1",
  });
  const [commentDrafts, setCommentDrafts] = useState({});
  const [commentBusyExpenseId, setCommentBusyExpenseId] = useState(null);
  const [browserNotifyPermission, setBrowserNotifyPermission] = useState("default");
  const [browserNotifyEnabled, setBrowserNotifyEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const heroRef = useRef(null);
  const metricsRef = useRef(null);
  const plannerPanelRef = useRef(null);
  const workspaceCreatePanelRef = useRef(null);
  const workspaceExpensePanelRef = useRef(null);
  const workspaceOcrPanelRef = useRef(null);
  const workspaceSettlementPanelRef = useRef(null);
  const profileMenuRef = useRef(null);
  const recentActivitySeenRef = useRef("");

  useScrollReveal(heroRef);
  useScrollReveal(metricsRef);
  useScrollReveal(plannerPanelRef);
  useScrollReveal(workspaceCreatePanelRef);
  useScrollReveal(workspaceExpensePanelRef);
  useScrollReveal(workspaceOcrPanelRef);
  useScrollReveal(workspaceSettlementPanelRef);

  const apiRequest = useApiRequest();
  const {
    groups,
    analytics,
    configHealth,
    loading,
    selectedGroupId,
    setSelectedGroupId,
    loadOverview,
  } = useOverviewData(apiRequest, setError);
  const { selectedGroup, selectedGroupPermissions, loadGroupDetail } = useGroupDetail(
    apiRequest,
    setError,
    selectedGroupId
  );
  const currentCurrency = selectedGroup?.currency || "INR";
  const {
    expenseFilters,
    setExpenseFilters,
    expensePage,
    setExpensePage,
    filteredExpenses,
    expenseCategories,
    expenseTotalPages,
    visibleExpenses,
    resetExpenseListState,
  } = useExpenseListState(selectedGroup);
  const {
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
  } = useExpensesState({
    selectedGroupId,
    selectedMembers: selectedGroup?.members || [],
    canAddExpense:
      selectedGroupPermissions?.addExpense !== undefined
        ? Boolean(selectedGroupPermissions.addExpense)
        : Boolean(selectedGroup),
    canEditExpenses:
      selectedGroupPermissions?.editExpense !== undefined
        ? Boolean(selectedGroupPermissions.editExpense)
        : Boolean(selectedGroup),
    apiRequest,
    loadOverview,
    loadGroupDetail,
    clearMessages: () => {
      setError("");
      setNotice("");
    },
    setBusy,
    setError,
    setNotice,
  });

  const clearMessages = useCallback(() => {
    setError("");
    setNotice("");
  }, []);
  const selectedMembers = useMemo(() => selectedGroup?.members || [], [selectedGroup]);
  const canAddExpense = useMemo(
    () =>
      selectedGroupPermissions?.addExpense !== undefined
        ? Boolean(selectedGroupPermissions.addExpense)
        : Boolean(selectedGroup),
    [selectedGroupPermissions, selectedGroup]
  );

  const requestBrowserNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setError("This browser does not support notifications.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setBrowserNotifyPermission(permission);
      if (permission !== "granted") {
        setNotice("Browser notification permission not granted.");
        return;
      }
      setBrowserNotifyEnabled(true);
      setNotice("Browser notifications enabled.");
    } catch {
      setError("Could not enable browser notifications");
    }
  }, [setError, setNotice]);

  const syncPushSubscriptionStatus = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushSupported(false);
      setPushSubscribed(false);
      return;
    }

    setPushSupported(true);

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      setPushSubscribed(Boolean(subscription));

      if (subscription) {
        await apiRequest("/api/push/subscribe", {
          method: "POST",
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        }).catch(() => null);
      }
    } catch {
      setPushSupported(false);
      setPushSubscribed(false);
    }
  }, [apiRequest]);

  const handleEnableWebPush = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setError("Web Push is not supported in this browser.");
      return;
    }

    setPushBusy(true);
    clearMessages();

    try {
      const permission = await Notification.requestPermission();
      setBrowserNotifyPermission(permission);
      if (permission !== "granted") {
        throw new Error("Notification permission was not granted.");
      }

      const keyBody = await apiRequest("/api/push/public-key");
      const publicKey = String(keyBody.publicKey || "").trim();
      if (!publicKey) {
        throw new Error("Web Push public key is missing on server.");
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const applicationServerKey = base64UrlToUint8Array(publicKey);
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      await apiRequest("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      setPushSubscribed(true);
      setNotice("Web Push notifications enabled.");
    } catch (err) {
      setError(err.message || "Could not enable Web Push");
    } finally {
      setPushBusy(false);
    }
  }, [apiRequest, clearMessages, setError, setNotice]);

  const handleDisableWebPush = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    setPushBusy(true);
    clearMessages();

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint || "";
      if (subscription) {
        await subscription.unsubscribe();
      }

      await apiRequest("/api/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint }),
      });

      setPushSubscribed(false);
      setNotice("Web Push notifications disabled.");
    } catch (err) {
      setError(err.message || "Could not disable Web Push");
    } finally {
      setPushBusy(false);
    }
  }, [apiRequest, clearMessages, setError, setNotice]);

  const toggleRecurringParticipant = useCallback((memberId) => {
    const memberKey = String(memberId);
    setRecurringForm((prev) => {
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

  const toggleAllRecurringParticipants = useCallback(() => {
    setRecurringForm((prev) => {
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

  const buildRecurringSplitConfig = useCallback(() => {
    if (recurringForm.splitMode === "percent") {
      const percentages = {};
      for (const memberId of recurringForm.participants) {
        percentages[memberId] = cleanNumber(recurringForm.splitPercentages[memberId]);
      }
      return { percentages };
    }
    if (recurringForm.splitMode === "shares") {
      const shares = {};
      for (const memberId of recurringForm.participants) {
        shares[memberId] = cleanNumber(recurringForm.splitShares[memberId]);
      }
      return { shares };
    }
    return null;
  }, [recurringForm]);

  const handleCreateRecurringExpense = useCallback(
    async (event) => {
      event.preventDefault();
      if (!selectedGroupId || !canAddExpense) return;

      clearMessages();
      setBusy(true);

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/recurring-expenses`, {
          method: "POST",
          body: JSON.stringify({
            title: recurringForm.title,
            amount: cleanNumber(recurringForm.amount),
            payerMemberId: Number(recurringForm.payerMemberId),
            participants: (recurringForm.participants || []).map((id) => Number(id)),
            splitMode: recurringForm.splitMode,
            splitConfig: buildRecurringSplitConfig(),
            category: recurringForm.category,
            currency: recurringForm.currency,
            notes: recurringForm.notes,
            dayOfMonth: cleanNumber(recurringForm.dayOfMonth) || 1,
          }),
        });
        setRecurringForm((prev) => ({
          ...prev,
          title: "",
          amount: "",
          notes: "",
          currency: prev.currency,
          dayOfMonth: "1",
          participants: [],
          splitPercentages: {},
          splitShares: {},
        }));
        setNotice("Recurring expense scheduled.");
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to create recurring expense");
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
      recurringForm,
      buildRecurringSplitConfig,
      setNotice,
      loadGroupDetail,
      setError,
    ]
  );

  const handleToggleRecurringExpense = useCallback(
    async (recurring) => {
      if (!selectedGroupId || !recurring) return;
      clearMessages();
      setBusy(true);
      try {
        await apiRequest(`/api/groups/${selectedGroupId}/recurring-expenses/${recurring.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: !Boolean(recurring.active) }),
        });
        setNotice(Boolean(recurring.active) ? "Recurring expense paused." : "Recurring expense resumed.");
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to update recurring expense");
      } finally {
        setBusy(false);
      }
    },
    [selectedGroupId, clearMessages, setBusy, apiRequest, setNotice, loadGroupDetail, setError]
  );

  const handleDeleteRecurringExpense = useCallback(
    async (recurring) => {
      if (!selectedGroupId || !recurring) return;
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(`Delete recurring expense "${recurring.title}"?`);
        if (!confirmed) return;
      }

      clearMessages();
      setBusy(true);
      try {
        await apiRequest(`/api/groups/${selectedGroupId}/recurring-expenses/${recurring.id}`, {
          method: "DELETE",
        });
        setNotice("Recurring expense deleted.");
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to delete recurring expense");
      } finally {
        setBusy(false);
      }
    },
    [selectedGroupId, clearMessages, setBusy, apiRequest, setNotice, loadGroupDetail, setError]
  );

  const handleAddExpenseComment = useCallback(
    async (expense) => {
      if (!selectedGroupId || !expense) return;
      const text = String(commentDrafts[expense.id] || "").trim();
      if (!text) return;

      setCommentBusyExpenseId(Number(expense.id));
      clearMessages();

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/expenses/${expense.id}/comments`, {
          method: "POST",
          body: JSON.stringify({ text }),
        });
        setCommentDrafts((prev) => ({ ...prev, [expense.id]: "" }));
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to add comment");
      } finally {
        setCommentBusyExpenseId(null);
      }
    },
    [selectedGroupId, commentDrafts, clearMessages, apiRequest, loadGroupDetail, setError]
  );

  const handleDeleteExpenseComment = useCallback(
    async (expenseId, commentId) => {
      if (!selectedGroupId || !expenseId || !commentId) return;

      setCommentBusyExpenseId(Number(expenseId));
      clearMessages();
      try {
        await apiRequest(`/api/groups/${selectedGroupId}/expenses/${expenseId}/comments/${commentId}`, {
          method: "DELETE",
        });
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to delete comment");
      } finally {
        setCommentBusyExpenseId(null);
      }
    },
    [selectedGroupId, clearMessages, apiRequest, loadGroupDetail, setError]
  );

  const handleLogout = async () => {
    setAuthBusy(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      setAuthBusy(false);
    }
  };

  useEffect(() => {
    if (!selectedGroup?.members?.length) {
      setExpenseForm((prev) => ({
        ...prev,
        payerMemberId: "",
        currency: prev.currency || selectedGroup?.currency || "INR",
        participants: [],
      }));
      setRecurringForm((prev) => ({
        ...prev,
        payerMemberId: "",
        currency: prev.currency || selectedGroup?.currency || "INR",
        participants: [],
      }));
      return;
    }

    setExpenseForm((prev) => {
      const hasCurrentPayer = selectedGroup.members.some((member) => String(member.id) === String(prev.payerMemberId));
      const payerMemberId = hasCurrentPayer ? prev.payerMemberId : String(selectedGroup.members[0].id);

      const participants = prev.participants.filter((id) =>
        selectedGroup.members.some((member) => String(member.id) === String(id))
      );

      return {
        ...prev,
        payerMemberId,
        currency: prev.currency || selectedGroup.currency || "INR",
        participants,
      };
    });

    setRecurringForm((prev) => {
      const hasCurrentPayer = selectedGroup.members.some((member) => String(member.id) === String(prev.payerMemberId));
      const payerMemberId = hasCurrentPayer ? prev.payerMemberId : String(selectedGroup.members[0].id);
      const participants = (prev.participants || []).filter((id) =>
        selectedGroup.members.some((member) => String(member.id) === String(id))
      );

      return {
        ...prev,
        payerMemberId,
        currency: prev.currency || selectedGroup.currency || "INR",
        participants,
      };
    });
  }, [selectedGroup, setExpenseForm]);



  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const interval = setInterval(() => {
      if (document.hidden) return;
      loadOverview();
      if (selectedGroupId) {
        loadGroupDetail(selectedGroupId);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [loadOverview, loadGroupDetail, selectedGroupId]);

  useEffect(() => {
    if (!selectedGroup) {
      setGroupEditForm(EMPTY_GROUP_FORM);
      return;
    }

    setGroupEditForm({
      name: selectedGroup.name || "",
      description: selectedGroup.description || "",
      currency: selectedGroup.currency || "INR",
    });
  }, [selectedGroup]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const initialTheme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : prefersDark ? "dark" : "light";

    setTheme(initialTheme);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.documentElement.dataset.theme = theme;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const enabled = window.localStorage.getItem(BROWSER_NOTIFY_TOGGLE_KEY) === "1";
    setBrowserNotifyEnabled(enabled);
    if ("Notification" in window) {
      setBrowserNotifyPermission(Notification.permission || "default");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BROWSER_NOTIFY_TOGGLE_KEY, browserNotifyEnabled ? "1" : "0");
  }, [browserNotifyEnabled]);

  useEffect(() => {
    syncPushSubscriptionStatus();
  }, [syncPushSubscriptionStatus]);

  useEffect(() => {
    if (!selectedGroup) return;
    const latestActivity = selectedGroup.activityLogs?.[0];
    if (!latestActivity?.createdAt) return;

    const marker = `${selectedGroup.id}:${latestActivity.id}:${latestActivity.createdAt}`;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(BROWSER_NOTIFY_ACTIVITY_KEY) : "";
    const seen = recentActivitySeenRef.current || stored || "";
    if (!seen) {
      recentActivitySeenRef.current = marker;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(BROWSER_NOTIFY_ACTIVITY_KEY, marker);
      }
      return;
    }
    if (seen === marker) return;

    recentActivitySeenRef.current = marker;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BROWSER_NOTIFY_ACTIVITY_KEY, marker);
    }
    if (!browserNotifyEnabled || browserNotifyPermission !== "granted") return;
    if (typeof window !== "undefined" && "Notification" in window) {
      const notification = new Notification(selectedGroup.name || "Expense Split", {
        body: latestActivity.message || "New group activity",
        tag: `group-${selectedGroup.id}-activity`,
      });
      setTimeout(() => notification.close(), 5000);
    }
  }, [selectedGroup, browserNotifyEnabled, browserNotifyPermission]);

  useEffect(() => {
    if (!profileMenuOpen || typeof document === "undefined") return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!profileMenuRef.current || profileMenuRef.current.contains(target)) return;
      setProfileMenuOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileMenuOpen]);

  const memberById = useMemo(
    () => new Map(selectedMembers.map((member) => [Number(member.id), member])),
    [selectedMembers]
  );
  const fallbackManage = useMemo(() => {
    if (!selectedGroup) return false;
    const ownerUserId = Number(selectedGroup.ownerUserId || 0);
    if (ownerUserId > 0) {
      return ownerUserId === Number(loggedInUserId || 0);
    }
    return true;
  }, [selectedGroup, loggedInUserId]);
  const canManageSelectedGroup = useMemo(
    () =>
      selectedGroupPermissions?.manageGroup !== undefined
        ? Boolean(selectedGroupPermissions.manageGroup)
        : fallbackManage,
    [selectedGroupPermissions, fallbackManage]
  );
  const canManageMembers = useMemo(
    () =>
      selectedGroupPermissions?.manageMembers !== undefined
        ? Boolean(selectedGroupPermissions.manageMembers)
        : canManageSelectedGroup,
    [selectedGroupPermissions, canManageSelectedGroup]
  );
  const canDeleteSelectedGroup = useMemo(
    () =>
      selectedGroupPermissions?.deleteGroup !== undefined
        ? Boolean(selectedGroupPermissions.deleteGroup)
        : canManageSelectedGroup,
    [selectedGroupPermissions, canManageSelectedGroup]
  );
  const canInviteMembers = useMemo(
    () =>
      selectedGroupPermissions?.inviteMembers !== undefined
        ? Boolean(selectedGroupPermissions.inviteMembers)
        : canManageMembers,
    [selectedGroupPermissions, canManageMembers]
  );
  const {
    memberForm,
    setMemberForm,
    memberEditModal,
    setMemberEditModal,
    inviteForm,
    setInviteForm,
    latestInviteLink,
    handleAddMember,
    openMemberEditModal,
    handleSubmitMemberEdit,
    handleDeleteMember,
    handleChangeMemberRole,
    handleCreateInvite,
    handleCopyInviteLink,
    handleShareInviteOnWhatsApp,
    handleUpdateInvite,
    handleDeleteInvite,
  } = useMembersInvitesState({
    selectedGroupId,
    selectedGroup,
    canManageMembers,
    canInviteMembers,
    apiRequest,
    loadOverview,
    loadGroupDetail,
    clearMessages,
    setBusy,
    setError,
    setNotice,
  });
  const canEditExpenses = useMemo(
    () =>
      selectedGroupPermissions?.editExpense !== undefined
        ? Boolean(selectedGroupPermissions.editExpense)
        : canManageSelectedGroup,
    [selectedGroupPermissions, canManageSelectedGroup]
  );
  const canNotifySettlement = useMemo(
    () =>
      selectedGroupPermissions?.notifySettlement !== undefined
        ? Boolean(selectedGroupPermissions.notifySettlement)
        : Boolean(selectedGroup),
    [selectedGroupPermissions, selectedGroup]
  );
  const canMarkSettlementPaid = useMemo(
    () =>
      selectedGroupPermissions?.markSettlementPaid !== undefined
        ? Boolean(selectedGroupPermissions.markSettlementPaid)
        : canManageSelectedGroup,
    [selectedGroupPermissions, canManageSelectedGroup]
  );
  const {
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
  } = useSettlementsState({
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
  });
  const {
    ocrText,
    setOcrText,
    ocrParsed,
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
    ocrConfidenceLabel,
  } = useOcrState({
    apiRequest,
    clearMessages,
    setError,
    setNotice,
    setBusy,
    setExpenseForm,
  });
  const {
    aiPrompt,
    setAiPrompt,
    aiPlan,
    setAiPlan,
    aiBusy,
    aiPlanTotals,
    handleBuildAiPlan,
    handleImportAiPlan,
  } = useAiPlannerState({
    apiRequest,
    clearMessages,
    setError,
    setNotice,
    setBusy,
    loadOverview,
    loadGroupDetail,
    setSelectedGroupId,
  });
  const areAllParticipantsSelected = useMemo(() => {
    if (!selectedMembers.length) return false;
    return selectedMembers.every((member) => expenseForm.participants.includes(String(member.id)));
  }, [selectedMembers, expenseForm.participants]);
  const areAllRecurringParticipantsSelected = useMemo(() => {
    if (!selectedMembers.length) return false;
    return selectedMembers.every((member) => recurringForm.participants.includes(String(member.id)));
  }, [selectedMembers, recurringForm.participants]);
  const expenseCommentsByExpense = useMemo(() => {
    const map = new Map();
    for (const comment of selectedGroup?.expenseComments || []) {
      const key = Number(comment.expenseId);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(comment);
    }
    return map;
  }, [selectedGroup]);
  const leaderboard = useMemo(() => {
    const rows = (selectedGroup?.summary?.balances || []).map((item) => ({
      memberId: item.memberId,
      name: item.name,
      amount: Number(item.paid || 0),
    }));
    return rows.sort((a, b) => b.amount - a.amount);
  }, [selectedGroup]);
  const weeklyInsights = useMemo(() => {
    const expenses = selectedGroup?.expenses || [];
    if (!expenses.length) return [];

    const nowMs = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const currentStart = nowMs - weekMs;
    const previousStart = nowMs - weekMs * 2;

    let currentTotal = 0;
    let previousTotal = 0;
    const currentCategory = new Map();
    const previousCategory = new Map();

    for (const expense of expenses) {
      const ts = new Date(expense.expenseDate || expense.createdAt || "").getTime();
      if (!Number.isFinite(ts)) continue;
      const amount = Number(expense.amount || 0);
      const category = String(expense.category || "Misc");

      if (ts >= currentStart && ts <= nowMs) {
        currentTotal += amount;
        currentCategory.set(category, Number(currentCategory.get(category) || 0) + amount);
      } else if (ts >= previousStart && ts < currentStart) {
        previousTotal += amount;
        previousCategory.set(category, Number(previousCategory.get(category) || 0) + amount);
      }
    }

    const insights = [];
    if (previousTotal > 0) {
      const deltaPct = Number((((currentTotal - previousTotal) / previousTotal) * 100).toFixed(1));
      if (Math.abs(deltaPct) >= 5) {
        insights.push(
          deltaPct > 0
            ? `You spent ${deltaPct}% more this week than last week.`
            : `You spent ${Math.abs(deltaPct)}% less this week than last week.`
        );
      } else {
        insights.push("Your spending is stable compared with last week.");
      }
    } else if (currentTotal > 0) {
      insights.push("You started spending this week after a quiet previous week.");
    }

    const topCurrentCategory = Array.from(currentCategory.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topCurrentCategory) {
      const previousForTop = Number(previousCategory.get(topCurrentCategory[0]) || 0);
      const currentForTop = Number(topCurrentCategory[1] || 0);
      if (previousForTop > 0) {
        const upPct = Number((((currentForTop - previousForTop) / previousForTop) * 100).toFixed(1));
        insights.push(
          `${topCurrentCategory[0]} is your top category this week (${formatAmount(currentForTop, currentCurrency)}), ${upPct > 0 ? `${upPct}% higher` : `${Math.abs(upPct)}% lower`} than last week.`
        );
      } else {
        insights.push(
          `${topCurrentCategory[0]} is your top category this week at ${formatAmount(currentForTop, currentCurrency)}.`
        );
      }
    }

    if (leaderboard[0]) {
      insights.push(
        `${leaderboard[0].name} currently leads spending with ${formatAmount(leaderboard[0].amount, currentCurrency)}.`
      );
    }

    return insights.slice(0, 4);
  }, [selectedGroup, leaderboard, currentCurrency]);
  const categoryChartData = useMemo(
    () =>
      (selectedGroup?.summary?.categoryBreakdown || []).map((item, index) => ({
        ...item,
        fill: CHART_COLORS[index % CHART_COLORS.length],
      })),
    [selectedGroup]
  );
  const recentActivities = useMemo(
    () => (selectedGroup?.activityLogs || []).slice(0, 20),
    [selectedGroup]
  );

  useEffect(() => {
    resetExpenseListState();
    closeExpenseEditModal();
    resetSettlementsState();
    setCommentDrafts({});
    setCommentBusyExpenseId(null);
    setExpenseForm((prev) => ({
      ...prev,
      currency: "",
    }));
    setRecurringForm((prev) => ({
      ...prev,
      title: "",
      amount: "",
      notes: "",
      currency: "",
      participants: [],
      splitMode: "equal",
      splitPercentages: {},
      splitShares: {},
      dayOfMonth: "1",
    }));
  }, [selectedGroupId, resetExpenseListState, closeExpenseEditModal, resetSettlementsState, setExpenseForm]);

  const handleCreateGroup = async (event) => {
    event.preventDefault();
    clearMessages();
    setBusy(true);

    try {
      const body = await apiRequest("/api/groups", {
        method: "POST",
        body: JSON.stringify(groupForm),
      });

      setGroupForm(EMPTY_GROUP_FORM);
      setNotice(`Created group ${body.group.name}`);
      await loadOverview();
      setSelectedGroupId(body.group.id);
    } catch (err) {
      setError(err.message || "Failed to create group");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateGroup = async (event) => {
    event.preventDefault();
    if (!selectedGroupId || !canManageSelectedGroup) return;

    clearMessages();
    setBusy(true);

    try {
      await apiRequest(`/api/groups/${selectedGroupId}`, {
        method: "PATCH",
        body: JSON.stringify(groupEditForm),
      });

      setNotice("Group details updated");
      await loadOverview();
      await loadGroupDetail(selectedGroupId);
    } catch (err) {
      setError(err.message || "Failed to update group");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroupId || !canDeleteSelectedGroup) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Delete this group and all its members/expenses?");
      if (!confirmed) return;
    }

    clearMessages();
    setBusy(true);

    try {
      await apiRequest(`/api/groups/${selectedGroupId}`, {
        method: "DELETE",
      });

      setNotice("Group deleted");
      setSelectedGroupId(null);
      await loadOverview();
    } catch (err) {
      setError(err.message || "Failed to delete group");
    } finally {
      setBusy(false);
    }
  };

  const handleExportGroupReport = async (format = "csv") => {
    if (!selectedGroupId) return;
    const safeFormat = String(format || "csv").toLowerCase() === "pdf" ? "pdf" : "csv";

    clearMessages();

    try {
      const query = new URLSearchParams({
        format: safeFormat,
      });
      if (exportMonth) {
        query.set("month", exportMonth);
      }
      const response = await fetch(`/api/groups/${selectedGroupId}/export?${query.toString()}`);
      if (response.status === 401) {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        throw new Error("Session expired. Please login again.");
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selectedGroup?.name || "group"}-${selectedGroupId}${exportMonth ? `-${exportMonth}` : ""}.${safeFormat}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setNotice(`${safeFormat.toUpperCase()} export downloaded`);
    } catch (err) {
      setError(err.message || "Failed to export group");
    }
  };

  const profileInitial = String(loggedInUserEmail || "U").trim().charAt(0).toUpperCase() || "U";

  const handleOpenProfilePage = () => {
    setProfileMenuOpen(false);
    if (typeof window !== "undefined") {
      window.location.href = "/profile";
    }
  };

  const handleRefreshFromProfileMenu = async () => {
    setProfileMenuOpen(false);
    await loadOverview();
    if (selectedGroupId) {
      await loadGroupDetail(selectedGroupId);
    }
  };

  const handleRunMaintenance = async () => {
    setProfileMenuOpen(false);
    clearMessages();
    setMaintenanceBusy(true);

    try {
      const body = await apiRequest("/api/jobs/maintenance", {
        method: "POST",
        body: JSON.stringify({ notificationLimit: 25 }),
      });
      setNotice(
        `Maintenance complete: ${body.expiredInvites || 0} invites expired, ${body.recurringExpensesAdded || 0} recurring expenses added, ${body.notificationQueue?.sent || 0} notifications sent, ${body.monthlySummaryEmailsSent || 0} monthly summary emails sent.`
      );
      await loadGroupDetail(selectedGroupId);
    } catch (err) {
      setError(err.message || "Failed to run maintenance jobs");
    } finally {
      setMaintenanceBusy(false);
    }
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <main className="app-shell">
      <header ref={heroRef} className="hero reveal reveal-hero">
        <div>
          <p className="eyebrow">Full Stack Internship Project</p>
          <h1>Expense Split + AI Planner + Receipt OCR</h1>
          <p>Plan trips in plain English, auto-import structured expenses, and settle balances instantly.</p>
          {loggedInUserEmail ? <p className="muted tiny top-gap">Logged in as {loggedInUserEmail}</p> : null}
          {configHealth.summary ? (
            <p className={`tiny top-gap config-copy ${configHealth.ok ? "ok" : "warn"}`}>
              Config Health: {configHealth.ok ? "Core Ready" : "Action Needed"} ({configHealth.score}%)
            </p>
          ) : null}
        </div>
        <div className="hero-actions">
          <span
            className={`config-pill ${configHealth.ok ? "ok" : "warn"}`}
            title={configHealth.summary || "Configuration health"}
          >
            {configHealth.ok ? "Healthy Config" : "Config Setup Needed"}
          </span>
          <div className="profile-menu-wrap" ref={profileMenuRef}>
            <button
              className={`btn ghost profile-trigger ${profileMenuOpen ? "open" : ""}`}
              onClick={() => setProfileMenuOpen((prev) => !prev)}
              aria-label="Open profile menu"
              aria-expanded={profileMenuOpen}
              type="button"
            >
              <span className="avatar-badge" aria-hidden="true">
                {profileInitial}
              </span>
              <span className="profile-trigger-text">Profile</span>
              <svg
                className="profile-caret"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {profileMenuOpen ? (
              <div className="profile-menu" role="menu" aria-label="Profile options">
                <div className="profile-menu-head">
                  <p className="profile-menu-label">Signed in as</p>
                  <p className="profile-menu-email">{loggedInUserEmail || "User"}</p>
                </div>
                <button className="profile-menu-btn" onClick={handleOpenProfilePage} type="button" role="menuitem">
                  Profile Settings
                </button>
                <button
                  className="profile-menu-btn"
                  onClick={handleRefreshFromProfileMenu}
                  disabled={loading}
                  type="button"
                  role="menuitem"
                >
                  {loading ? "Refreshing..." : "Refresh Dashboard"}
                </button>
                <button
                  className="profile-menu-btn"
                  onClick={handleRunMaintenance}
                  disabled={maintenanceBusy}
                  type="button"
                  role="menuitem"
                >
                  {maintenanceBusy ? "Running Jobs..." : "Run Maintenance"}
                </button>
                <button
                  className="profile-menu-btn"
                  onClick={() => {
                    handleToggleTheme();
                    setProfileMenuOpen(false);
                  }}
                  type="button"
                  role="menuitem"
                >
                  {theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                </button>
                <button
                  className="profile-menu-btn danger"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    handleLogout();
                  }}
                  disabled={authBusy}
                  type="button"
                  role="menuitem"
                >
                  {authBusy ? "Logging out..." : "Logout"}
                </button>
              </div>
            ) : null}
          </div>
          <button
            className="btn ghost icon-btn"
            onClick={handleToggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            type="button"
          >
            {theme === "dark" ? (
              <svg
                className="theme-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2.2M12 19.8V22M4.22 4.22 5.8 5.8M18.2 18.2l1.58 1.58M2 12h2.2M19.8 12H22M4.22 19.78l1.58-1.58M18.2 5.8l1.58-1.58" />
              </svg>
            ) : (
              <svg
                className="theme-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3c-.11.57-.17 1.16-.17 1.77a8 8 0 0 0 8 8c.61 0 1.2-.06 1.76-.18z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <section ref={metricsRef} className="metrics-grid reveal">
        <article className="reveal-child"><span>Groups</span><strong>{analytics.metrics.totalGroups}</strong></article>
        <article className="reveal-child"><span>Members</span><strong>{analytics.metrics.totalMembers}</strong></article>
        <article className="reveal-child"><span>Expenses</span><strong>{analytics.metrics.totalExpenses}</strong></article>
        <article className="reveal-child"><span>Total Spent</span><strong>{formatAmount(analytics.metrics.totalSpent, "INR")}</strong></article>
        <article className="reveal-child"><span>Pending Settlements</span><strong>{analytics.metrics.pendingSettlements}</strong></article>
      </section>

      <section ref={plannerPanelRef} className="panel planner-panel reveal">
        <div className="panel-header planner-header">
          <div>
            <h2>AI Trip Planner</h2>
            <p className="planner-copy">Describe members + expenses in natural language. The app converts it into group, members, and split-ready expenses.</p>
          </div>
          <span className={`source-tag ${aiPlan?.source === "openai" ? "live" : "local"}`}>
            {aiPlan ? (aiPlan.source === "openai" ? "OpenAI" : "Local Parser") : "Awaiting Plan"}
          </span>
        </div>

        <div className="planner-grid">
          <div className="stack">
            <textarea
              rows="7"
              placeholder="Example: Trip to Bangalore with Jan, Priya, Rahul. Hotel 9000 paid by Jan split among all. Cab 1200 paid by Rahul split among Jan and Rahul."
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
            />

            <div className="planner-actions">
              <button className="btn primary" onClick={handleBuildAiPlan} disabled={aiBusy || busy || !aiPrompt.trim()} type="button">
                {aiBusy ? "Planning..." : "Generate AI Plan"}
              </button>
              <button className="btn secondary" onClick={() => setAiPrompt(AI_SAMPLE_PROMPT)} disabled={aiBusy || busy} type="button">
                Use Sample
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  setAiPrompt("");
                  setAiPlan(null);
                }}
                disabled={aiBusy || busy}
                type="button"
              >
                Clear
              </button>
            </div>

            <p className="muted tiny">Tip: include payer and split text like &quot;paid by Priya split 40% Priya 60% Rahul&quot; for best results.</p>
          </div>

          <div className="planner-preview">
            {!aiPlan ? (
              <p className="muted">Generate a plan to preview members, expenses, and warnings before importing.</p>
            ) : (
              <>
                <p className="planner-summary">{aiPlan.summary || "AI plan generated."}</p>

                <div className="summary-cards planner-stats">
                  <article><span>Members</span><strong>{aiPlan.members?.length || 0}</strong></article>
                  <article><span>Expenses</span><strong>{aiPlan.expenses?.length || 0}</strong></article>
                  <article><span>Total</span><strong>{formatAmount(aiPlanTotals, normalizeCurrency(aiPlan.group?.currency))}</strong></article>
                  <article><span>Confidence</span><strong>{Math.round(cleanNumber(aiPlan.confidence) * 100)}%</strong></article>
                </div>

                <div className="planner-block">
                  <p className="planner-title-row">
                    <strong>{aiPlan.group?.name || "AI Planned Group"}</strong>
                    <span>{normalizeCurrency(aiPlan.group?.currency)}</span>
                  </p>
                  {hasValue(aiPlan.group?.description) ? <p className="muted">{aiPlan.group.description}</p> : null}
                </div>

                <div className="planner-block">
                  <p className="field-label">Detected Members</p>
                  <div className="chips">
                    {(aiPlan.members || []).map((member, idx) => (
                      <span key={`${member.name}-${idx}`} className="chip">{member.name}</span>
                    ))}
                  </div>
                </div>

                <div className="planner-block">
                  <p className="field-label">Planned Expenses</p>
                  <div className="list planner-expense-list">
                    {(aiPlan.expenses || []).slice(0, 6).map((expense, idx) => (
                      <div key={`${expense.title}-${idx}`} className="list-row">
                        <div>
                          <strong>{expense.title}</strong>
                          <p>
                            {expense.payerName || "Unknown"} paid • {expense.splitMode} split
                          </p>
                        </div>
                        <strong>{formatAmount(expense.amount, normalizeCurrency(aiPlan.group?.currency))}</strong>
                      </div>
                    ))}
                  </div>
                  {(aiPlan.expenses || []).length > 6 ? (
                    <p className="muted tiny">Showing first 6 expenses in preview.</p>
                  ) : null}
                </div>

                {(aiPlan.warnings || []).length > 0 ? (
                  <ul className="warning-list">
                    {aiPlan.warnings.map((warning, idx) => (
                      <li key={`${warning}-${idx}`}>{warning}</li>
                    ))}
                  </ul>
                ) : null}

                <button className="btn primary" onClick={handleImportAiPlan} disabled={busy || aiBusy} type="button">
                  {busy ? "Importing..." : "Import Plan to App"}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <div
          ref={workspaceCreatePanelRef}
          className="panel reveal workspace-panel workspace-panel-create workspace-panel-scroll"
        >
          <div className="panel-header">
            <h2>Create Group</h2>
            <span>Start a new expense pool</span>
          </div>

          <section className="panel-section">
            <h3 className="section-title">New Group</h3>
            <form className="stack" onSubmit={handleCreateGroup}>
              <input
                placeholder="Group name"
                value={groupForm.name}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
              <input
                placeholder="Description"
                value={groupForm.description}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, description: event.target.value }))}
              />
              <div className="split">
                <select
                  value={groupForm.currency}
                  onChange={(event) => setGroupForm((prev) => ({ ...prev, currency: event.target.value }))}
                >
                  {SUPPORTED_CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <button className="btn primary" disabled={busy}>
                  {busy ? "Saving..." : "Create Group"}
                </button>
              </div>
            </form>
          </section>

          <section className="panel-section">
            <div className="section-head">
              <h3 className="section-title">Groups</h3>
              <span>{groups.length} active</span>
            </div>
            <div className="list">
              {loading ? (
                <p className="muted">Loading groups...</p>
              ) : groups.length === 0 ? (
                <p className="muted">No groups yet.</p>
              ) : (
                groups.map((group) => (
                  <button
                    key={group.id}
                    className={`list-item ${selectedGroupId === group.id ? "active" : ""}`}
                    onClick={() => setSelectedGroupId(group.id)}
                    type="button"
                  >
                    <strong>{group.name}</strong>
                    <p>{group.memberCount} members • {group.expenseCount} expenses</p>
                    <p>{formatAmount(group.totalSpent, group.currency)}</p>
                  </button>
                ))
              )}
            </div>
          </section>

          {selectedGroup ? (
            <>
              <section className="panel-section">
                <div className="section-head">
                  <h3 className="section-title">Group Settings</h3>
                  <span className="role-pill">
                    {selectedGroupPermissions?.role || (canManageSelectedGroup ? "admin" : "member")}
                  </span>
                </div>
                {canManageSelectedGroup ? (
                  <form className="stack" onSubmit={handleUpdateGroup}>
                    <input
                      placeholder="Group name"
                      value={groupEditForm.name}
                      onChange={(event) => setGroupEditForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                    <input
                      placeholder="Description"
                      value={groupEditForm.description}
                      onChange={(event) => setGroupEditForm((prev) => ({ ...prev, description: event.target.value }))}
                    />
                    <div className="split">
                      <select
                        value={groupEditForm.currency}
                        onChange={(event) => setGroupEditForm((prev) => ({ ...prev, currency: event.target.value }))}
                      >
                        {SUPPORTED_CURRENCIES.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                      <button className="btn secondary" disabled={busy} type="submit">
                        Save Group
                      </button>
                    </div>
                    <label className="field-label">Monthly export range</label>
                    <input
                      type="month"
                      value={exportMonth}
                      onChange={(event) => setExportMonth(event.target.value)}
                    />
                    <div className="split">
                      <button
                        className="btn ghost"
                        onClick={() => handleExportGroupReport("csv")}
                        disabled={busy}
                        type="button"
                      >
                        Export CSV
                      </button>
                      <button
                        className="btn ghost"
                        onClick={() => handleExportGroupReport("pdf")}
                        disabled={busy}
                        type="button"
                      >
                        Export PDF
                      </button>
                    </div>
                    {canDeleteSelectedGroup ? (
                      <button className="btn danger" onClick={handleDeleteGroup} disabled={busy} type="button">
                        Delete Group
                      </button>
                    ) : null}
                  </form>
                ) : (
                  <div className="stack">
                    <p className="muted tiny">Only admins/owner can edit this group. Exports are still available.</p>
                    <label className="field-label">Monthly export range</label>
                    <input
                      type="month"
                      value={exportMonth}
                      onChange={(event) => setExportMonth(event.target.value)}
                    />
                    <div className="split">
                      <button
                        className="btn ghost"
                        onClick={() => handleExportGroupReport("csv")}
                        disabled={busy}
                        type="button"
                      >
                        Export CSV
                      </button>
                      <button
                        className="btn ghost"
                        onClick={() => handleExportGroupReport("pdf")}
                        disabled={busy}
                        type="button"
                      >
                        Export PDF
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {canInviteMembers ? (
                <section className="panel-section">
                  <div className="section-head">
                    <h3 className="section-title">Invite Member</h3>
                    <span>Email invite</span>
                  </div>
                  <form className="stack" onSubmit={handleCreateInvite}>
                    <input
                      type="email"
                      placeholder="Invite email"
                      value={inviteForm.email}
                      onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
                      required
                    />
                    <select
                      value={inviteForm.role}
                      onChange={(event) => setInviteForm((prev) => ({ ...prev, role: event.target.value }))}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button className="btn secondary" disabled={busy} type="submit">
                      Send Invite
                    </button>
                  </form>
                  {latestInviteLink ? (
                    <div className="invite-block">
                      <p className="tiny">{latestInviteLink}</p>
                      <div className="row-actions">
                        <button className="btn ghost btn-inline" onClick={handleCopyInviteLink} type="button">
                          Copy Invite Link
                        </button>
                        <button
                          className="btn secondary btn-inline"
                          onClick={handleShareInviteOnWhatsApp}
                          type="button"
                        >
                          Share WhatsApp
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {(selectedGroup.invites || []).length ? (
                    <div className="list">
                      {selectedGroup.invites.slice(0, 6).map((invite) => (
                        <div key={invite.id} className="list-row settlement-row">
                          <div>
                            <strong>{invite.email}</strong>
                            <p>
                              {invite.role} • {invite.status}
                            </p>
                            <p className="tiny">Created {formatDateTime(invite.createdAt)}</p>
                            {invite.emailDelivery ? (
                              <p
                                className={`tiny ${
                                  String(invite.emailDelivery.status || "").toLowerCase() === "sent"
                                    ? ""
                                    : "muted"
                                }`}
                              >
                                Email: {String(invite.emailDelivery.status || "unknown").toUpperCase()}
                                {invite.emailDelivery.message ? ` • ${invite.emailDelivery.message}` : ""}
                              </p>
                            ) : (
                              <p className="tiny muted">Email: Not attempted</p>
                            )}
                            <div className="row-actions">
                              <select
                                value={invite.role || "member"}
                                onChange={(event) =>
                                  handleUpdateInvite(invite, { role: event.target.value })
                                }
                                disabled={
                                  busy ||
                                  !canInviteMembers ||
                                  String(invite.status || "").toLowerCase() !== "pending"
                                }
                              >
                                <option value="member">member</option>
                                <option value="admin">admin</option>
                              </select>
                              <button
                                className="btn ghost btn-inline"
                                onClick={() =>
                                  handleUpdateInvite(invite, {
                                    status:
                                      String(invite.status || "").toLowerCase() === "revoked"
                                        ? "pending"
                                        : "revoked",
                                  })
                                }
                                disabled={
                                  busy ||
                                  !canInviteMembers ||
                                  String(invite.status || "").toLowerCase() === "accepted"
                                }
                                type="button"
                              >
                                {String(invite.status || "").toLowerCase() === "revoked"
                                  ? "Activate"
                                  : "Revoke"}
                              </button>
                              <button
                                className="btn danger btn-inline"
                                onClick={() => handleDeleteInvite(invite)}
                                disabled={
                                  busy ||
                                  !canInviteMembers ||
                                  String(invite.status || "").toLowerCase() === "accepted"
                                }
                                type="button"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="panel-section">
                <div className="section-head">
                  <h3 className="section-title">Add Member</h3>
                  <span>{selectedGroup.members.length} members</span>
                </div>
                <form className="stack" onSubmit={handleAddMember}>
                  <input
                    placeholder="Name"
                    value={memberForm.name}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                  />
                  <input
                    placeholder="Email"
                    type="email"
                    value={memberForm.email}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                  <input
                    placeholder="Contact number"
                    type="tel"
                    value={memberForm.phone}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, phone: event.target.value }))}
                  />
                  <input
                    placeholder="UPI ID (example@bank)"
                    value={memberForm.upiId}
                    onChange={(event) =>
                      setMemberForm((prev) => ({ ...prev, upiId: sanitizeUpiHandle(event.target.value) }))
                    }
                  />
                  <select
                    value={memberForm.role || "member"}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, role: event.target.value }))}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button className="btn secondary" disabled={busy || !canManageMembers}>
                    Add Member
                  </button>
                  {!canManageMembers ? <p className="muted tiny">Only admins/owner can add members.</p> : null}
                </form>
              </section>

              <section className="panel-section">
                <div className="section-head">
                  <h3 className="section-title">Members</h3>
                  <span>Directory</span>
                </div>
                <div className="list">
                  {selectedGroup.members.map((member) => (
                    <div key={member.id} className="list-row settlement-row">
                      <div>
                        <strong>{member.name}</strong>
                        <p>
                          {member.email || "No email"} • {member.phone || "No contact"} •{" "}
                          {member.role || "member"}
                        </p>
                        <p className="tiny">UPI: {member.upiId || "Not set"}</p>
                        <div className="row-actions">
                          {String(member.role || "").toLowerCase() !== "owner" ? (
                            <select
                              value={member.role || "member"}
                              onChange={(event) => handleChangeMemberRole(member, event.target.value)}
                              disabled={busy || !canManageMembers}
                            >
                              <option value="member">member</option>
                              <option value="admin">admin</option>
                            </select>
                          ) : (
                            <span className="tiny role-pill">owner</span>
                          )}
                          <button
                            className="btn ghost btn-inline"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              openMemberEditModal(member);
                            }}
                            disabled={busy}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="btn danger btn-inline"
                            onClick={() => handleDeleteMember(member)}
                            disabled={
                              busy ||
                              !canManageMembers ||
                              String(member.role || "").toLowerCase() === "owner"
                            }
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                        {!canManageMembers ? (
                          <p className="tiny muted">Edit/remove available for admin or owner.</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </div>

        <div
          ref={workspaceExpensePanelRef}
          className="panel reveal workspace-panel workspace-panel-expense workspace-panel-scroll"
        >
          <div className="panel-header">
            <h2>Add Expense</h2>
            <span>{selectedGroup ? selectedGroup.name : "Select group"}</span>
          </div>

          {!selectedGroup ? (
            <p className="muted">Select a group to add expenses.</p>
          ) : (
            <>
              <section className="panel-section">
                <h3 className="section-title">Add Expense Entry</h3>
                <form className="stack" onSubmit={handleAddExpense}>
                  <input
                    placeholder="Expense title"
                    value={expenseForm.title}
                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, title: event.target.value }))}
                    required
                  />
                  <div className="split">
                    <input
                      placeholder="Amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={expenseForm.amount}
                      onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))}
                      required
                    />
                    <input
                      type="date"
                      value={expenseForm.expenseDate}
                      onChange={(event) => setExpenseForm((prev) => ({ ...prev, expenseDate: event.target.value }))}
                    />
                  </div>
                  <div className="split">
                    <select
                      value={expenseForm.currency || currentCurrency}
                      onChange={(event) => setExpenseForm((prev) => ({ ...prev, currency: event.target.value }))}
                    >
                      {SUPPORTED_CURRENCIES.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                    <p className="tiny muted">Auto-convert to {currentCurrency} for group totals.</p>
                  </div>
                  <div className="split">
                    <select
                      value={expenseForm.payerMemberId}
                      onChange={(event) => setExpenseForm((prev) => ({ ...prev, payerMemberId: event.target.value }))}
                    >
                      {selectedMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} paid
                        </option>
                      ))}
                    </select>
                    <select
                      value={expenseForm.category}
                      onChange={(event) => setExpenseForm((prev) => ({ ...prev, category: event.target.value }))}
                    >
                      <option value="Auto">Auto detect</option>
                      {expenseCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="participants-row">
                    <label className="field-label">Participants</label>
                    <button
                      className="btn ghost btn-inline"
                      onClick={toggleAllParticipants}
                      disabled={!selectedMembers.length}
                      type="button"
                    >
                      {areAllParticipantsSelected ? "Clear All" : "Select All"}
                    </button>
                  </div>
                  <div className="chips">
                    {selectedMembers.map((member) => {
                      const checked = expenseForm.participants.includes(String(member.id));
                      return (
                        <label key={member.id} className={`chip check ${checked ? "checked" : ""}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleParticipant(member.id)} />
                          {member.name}
                        </label>
                      );
                    })}
                  </div>

                  <div className="split">
                    <select
                      value={expenseForm.splitMode}
                      onChange={(event) =>
                        setExpenseForm((prev) => ({
                          ...prev,
                          splitMode: event.target.value,
                        }))
                      }
                    >
                      <option value="equal">Equal split</option>
                      <option value="percent">Percent split</option>
                      <option value="shares">Shares split</option>
                    </select>
                    <input
                      placeholder="Notes"
                      value={expenseForm.notes}
                      onChange={(event) => setExpenseForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </div>

                  <div className="split">
                    <label className="tiny muted file-label">
                      Expense bill/photo proof
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(event) =>
                          setExpenseForm((prev) => ({
                            ...prev,
                            proofFile: event.target.files?.[0] || null,
                          }))
                        }
                      />
                    </label>
                    <label className="chip check">
                      <input
                        type="checkbox"
                        checked={Boolean(expenseForm.recurringEnabled)}
                        onChange={(event) =>
                          setExpenseForm((prev) => ({
                            ...prev,
                            recurringEnabled: event.target.checked,
                          }))
                        }
                      />
                      Monthly recurring
                    </label>
                  </div>
                  {expenseForm.proofFile ? <p className="tiny muted">Attached: {expenseForm.proofFile.name}</p> : null}
                  {expenseForm.recurringEnabled ? (
                    <div className="split">
                      <label className="tiny muted">
                        Day of month
                        <input
                          type="number"
                          min="1"
                          max="28"
                          value={expenseForm.recurringDayOfMonth}
                          onChange={(event) =>
                            setExpenseForm((prev) => ({
                              ...prev,
                              recurringDayOfMonth: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <p className="tiny muted">This expense will auto-add monthly after selected day.</p>
                    </div>
                  ) : null}

                  {expenseForm.splitMode !== "equal" ? (
                    <div className="split-config">
                      {expenseForm.participants.map((memberId) => {
                        const member = selectedMembers.find((item) => String(item.id) === String(memberId));
                        if (!member) return null;

                        const value =
                          expenseForm.splitMode === "percent"
                            ? expenseForm.splitPercentages[memberId] ?? 0
                            : expenseForm.splitShares[memberId] ?? 1;

                        return (
                          <label key={memberId}>
                            {member.name}
                            <input
                              type="number"
                              step="0.01"
                              value={value}
                              onChange={(event) =>
                                setExpenseForm((prev) => ({
                                  ...prev,
                                  splitPercentages:
                                    expenseForm.splitMode === "percent"
                                      ? { ...prev.splitPercentages, [memberId]: event.target.value }
                                      : prev.splitPercentages,
                                  splitShares:
                                    expenseForm.splitMode === "shares"
                                      ? { ...prev.splitShares, [memberId]: event.target.value }
                                      : prev.splitShares,
                                }))
                              }
                            />
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  <button className="btn primary" disabled={busy || !canAddExpense || selectedMembers.length === 0}>
                    Add Expense
                  </button>
                  {!canAddExpense ? (
                    <p className="muted tiny">Your role cannot add expenses in this group.</p>
                  ) : null}
                  {selectedMembers.length === 0 ? (
                    <p className="muted tiny">Add at least one member before creating expenses.</p>
                  ) : null}
                </form>
              </section>

              <section className="panel-section">
                <div className="section-head">
                  <h3 className="section-title">Recurring Expenses</h3>
                  <span>{(selectedGroup.recurringExpenses || []).length} configured</span>
                </div>
                <form className="stack" onSubmit={handleCreateRecurringExpense}>
                  <input
                    placeholder="Recurring expense title"
                    value={recurringForm.title}
                    onChange={(event) => setRecurringForm((prev) => ({ ...prev, title: event.target.value }))}
                    required
                  />
                  <div className="split">
                    <input
                      placeholder="Amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={recurringForm.amount}
                      onChange={(event) => setRecurringForm((prev) => ({ ...prev, amount: event.target.value }))}
                      required
                    />
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={recurringForm.dayOfMonth}
                      onChange={(event) => setRecurringForm((prev) => ({ ...prev, dayOfMonth: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="split">
                    <select
                      value={recurringForm.currency || currentCurrency}
                      onChange={(event) => setRecurringForm((prev) => ({ ...prev, currency: event.target.value }))}
                    >
                      {SUPPORTED_CURRENCIES.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                    <p className="tiny muted">Auto-convert recurring amount to {currentCurrency}.</p>
                  </div>
                  <div className="split">
                    <select
                      value={recurringForm.payerMemberId}
                      onChange={(event) => setRecurringForm((prev) => ({ ...prev, payerMemberId: event.target.value }))}
                    >
                      {selectedMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} paid
                        </option>
                      ))}
                    </select>
                    <select
                      value={recurringForm.category}
                      onChange={(event) => setRecurringForm((prev) => ({ ...prev, category: event.target.value }))}
                    >
                      <option value="Auto">Auto detect</option>
                      {expenseCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="participants-row">
                    <label className="field-label">Participants</label>
                    <button
                      className="btn ghost btn-inline"
                      onClick={toggleAllRecurringParticipants}
                      disabled={!selectedMembers.length}
                      type="button"
                    >
                      {areAllRecurringParticipantsSelected ? "Clear All" : "Select All"}
                    </button>
                  </div>
                  <div className="chips">
                    {selectedMembers.map((member) => {
                      const checked = recurringForm.participants.includes(String(member.id));
                      return (
                        <label key={member.id} className={`chip check ${checked ? "checked" : ""}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleRecurringParticipant(member.id)} />
                          {member.name}
                        </label>
                      );
                    })}
                  </div>
                  <div className="split">
                    <select
                      value={recurringForm.splitMode}
                      onChange={(event) =>
                        setRecurringForm((prev) => ({
                          ...prev,
                          splitMode: event.target.value,
                        }))
                      }
                    >
                      <option value="equal">Equal split</option>
                      <option value="percent">Percent split</option>
                      <option value="shares">Shares split</option>
                    </select>
                    <input
                      placeholder="Notes"
                      value={recurringForm.notes}
                      onChange={(event) => setRecurringForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </div>
                  {recurringForm.splitMode !== "equal" ? (
                    <div className="split-config">
                      {recurringForm.participants.map((memberId) => {
                        const member = selectedMembers.find((item) => String(item.id) === String(memberId));
                        if (!member) return null;
                        const value =
                          recurringForm.splitMode === "percent"
                            ? recurringForm.splitPercentages[memberId] ?? 0
                            : recurringForm.splitShares[memberId] ?? 1;
                        return (
                          <label key={memberId}>
                            {member.name}
                            <input
                              type="number"
                              step="0.01"
                              value={value}
                              onChange={(event) =>
                                setRecurringForm((prev) => ({
                                  ...prev,
                                  splitPercentages:
                                    recurringForm.splitMode === "percent"
                                      ? { ...prev.splitPercentages, [memberId]: event.target.value }
                                      : prev.splitPercentages,
                                  splitShares:
                                    recurringForm.splitMode === "shares"
                                      ? { ...prev.splitShares, [memberId]: event.target.value }
                                      : prev.splitShares,
                                }))
                              }
                            />
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                  <button className="btn secondary" disabled={busy || !canAddExpense}>
                    Save Recurring Expense
                  </button>
                </form>
                <div className="list">
                  {(selectedGroup.recurringExpenses || []).length === 0 ? (
                    <p className="muted tiny">No recurring expenses configured yet.</p>
                  ) : (
                    (selectedGroup.recurringExpenses || []).map((recurring) => {
                      const recurringSourceCurrency = normalizeCurrency(recurring.sourceCurrency || currentCurrency);
                      const recurringSourceAmount = Number(recurring.sourceAmount || recurring.amount || 0);
                      const recurringConverted =
                        recurringSourceCurrency !== normalizeCurrency(currentCurrency) ||
                        Math.abs(recurringSourceAmount - Number(recurring.amount || 0)) > 0.009;

                      return (
                        <div key={recurring.id} className="list-row settlement-row">
                          <div>
                            <strong>{recurring.title}</strong>
                            <p className="tiny">
                              Day {recurring.dayOfMonth} • {recurring.category || "Misc"} •{" "}
                              {recurring.active === false ? "Paused" : "Active"}
                            </p>
                            {recurringConverted ? (
                              <p className="tiny muted">
                                Original: {formatAmount(recurringSourceAmount, recurringSourceCurrency)} • Rate{" "}
                                {Number(recurring.fxRateToGroup || 1).toFixed(4)}
                              </p>
                            ) : null}
                            {recurring.lastRunMonth ? (
                              <p className="tiny muted">Last generated month: {recurring.lastRunMonth}</p>
                            ) : (
                              <p className="tiny muted">Not generated yet</p>
                            )}
                            <div className="row-actions">
                              <button
                                className="btn ghost btn-inline"
                                onClick={() => handleToggleRecurringExpense(recurring)}
                                disabled={busy}
                                type="button"
                              >
                                {recurring.active === false ? "Resume" : "Pause"}
                              </button>
                              <button
                                className="btn danger btn-inline"
                                onClick={() => handleDeleteRecurringExpense(recurring)}
                                disabled={busy}
                                type="button"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          <strong>{formatAmount(recurring.amount, currentCurrency)}</strong>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="panel-section">
                <div className="section-head">
                  <h3 className="section-title">Expense Ledger</h3>
                  <span>{filteredExpenses.length} result(s)</span>
                </div>
                <div className="filter-grid">
                  <input
                    placeholder="Search title/notes"
                    value={expenseFilters.search}
                    onChange={(event) => {
                      setExpensePage(1);
                      setExpenseFilters((prev) => ({ ...prev, search: event.target.value }));
                    }}
                  />
                  <select
                    value={expenseFilters.memberId}
                    onChange={(event) => {
                      setExpensePage(1);
                      setExpenseFilters((prev) => ({ ...prev, memberId: event.target.value }));
                    }}
                  >
                    <option value="">All members</option>
                    {selectedMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={expenseFilters.category}
                    onChange={(event) => {
                      setExpensePage(1);
                      setExpenseFilters((prev) => ({ ...prev, category: event.target.value }));
                    }}
                  >
                    <option value="">All categories</option>
                    {expenseCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={expenseFilters.dateFrom}
                    onChange={(event) => {
                      setExpensePage(1);
                      setExpenseFilters((prev) => ({ ...prev, dateFrom: event.target.value }));
                    }}
                  />
                  <input
                    type="date"
                    value={expenseFilters.dateTo}
                    onChange={(event) => {
                      setExpensePage(1);
                      setExpenseFilters((prev) => ({ ...prev, dateTo: event.target.value }));
                    }}
                  />
                  <select
                    value={expenseFilters.sortBy}
                    onChange={(event) => {
                      setExpensePage(1);
                      setExpenseFilters((prev) => ({ ...prev, sortBy: event.target.value }));
                    }}
                  >
                    <option value="expenseDate">Sort: Date</option>
                    <option value="amount">Sort: Amount</option>
                    <option value="title">Sort: Title</option>
                    <option value="category">Sort: Category</option>
                  </select>
                  <select
                    value={expenseFilters.sortDir}
                    onChange={(event) => {
                      setExpensePage(1);
                      setExpenseFilters((prev) => ({ ...prev, sortDir: event.target.value }));
                    }}
                  >
                    <option value="desc">Newest first</option>
                    <option value="asc">Oldest first</option>
                  </select>
                  <button
                    className="btn ghost"
                    onClick={() => {
                      setExpensePage(1);
                      setExpenseFilters({
                        search: "",
                        memberId: "",
                        category: "",
                        dateFrom: "",
                        dateTo: "",
                        sortBy: "expenseDate",
                        sortDir: "desc",
                      });
                    }}
                    type="button"
                  >
                    Reset Filters
                  </button>
                </div>
                <div className="list">
                  {visibleExpenses.length === 0 ? (
                    <p className="muted">No expenses matched these filters.</p>
                  ) : (
                    visibleExpenses.map((expense) => {
                      const payer = selectedGroup.members.find((member) => member.id === expense.payerMemberId);
                      const participantNames = (expense.participants || [])
                        .map((memberId) => selectedGroup.members.find((member) => member.id === memberId)?.name)
                        .filter(Boolean);
                      const comments = expenseCommentsByExpense.get(Number(expense.id)) || [];
                      const sourceCurrency = normalizeCurrency(expense.sourceCurrency || currentCurrency);
                      const sourceAmount = Number(expense.sourceAmount || expense.amount || 0);
                      const converted =
                        sourceCurrency !== normalizeCurrency(currentCurrency) ||
                        Math.abs(sourceAmount - Number(expense.amount || 0)) > 0.009;
                      return (
                        <div key={expense.id} className="list-row settlement-row">
                          <div>
                            <strong>{expense.title}</strong>
                            <p>
                              {payer ? payer.name : "Unknown"} • {expense.category} • {formatDate(expense.expenseDate)}
                            </p>
                            <p className="tiny">
                              Split: {expense.splitMode || "equal"} • Participants:{" "}
                              {participantNames.length ? participantNames.join(", ") : "-"}
                            </p>
                            {converted ? (
                              <p className="tiny muted">
                                Original: {formatAmount(sourceAmount, sourceCurrency)} • Rate{" "}
                                {Number(expense.fxRateToGroup || 1).toFixed(4)}
                              </p>
                            ) : null}
                            {expense.proofUrl ? (
                              <p className="tiny">
                                Proof:{" "}
                                <a className="inline-link" href={expense.proofUrl} target="_blank" rel="noreferrer">
                                  {expense.proofName || "View attachment"}
                                </a>
                              </p>
                            ) : null}
                            {comments.length ? (
                              <div className="comment-list">
                                {comments.slice(0, 4).map((comment) => (
                                  <div key={comment.id} className="comment-item">
                                    <p className="tiny">
                                      <strong>{comment.authorName || "Member"}:</strong> {comment.text}
                                    </p>
                                    <div className="row-actions">
                                      <span className="tiny muted">{formatDateTime(comment.createdAt)}</span>
                                      <button
                                        className="btn ghost btn-inline"
                                        onClick={() => handleDeleteExpenseComment(expense.id, comment.id)}
                                        disabled={commentBusyExpenseId === Number(expense.id)}
                                        type="button"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <div className="split comment-compose">
                              <input
                                placeholder="Add comment"
                                value={commentDrafts[expense.id] || ""}
                                onChange={(event) =>
                                  setCommentDrafts((prev) => ({ ...prev, [expense.id]: event.target.value }))
                                }
                              />
                              <button
                                className="btn ghost btn-inline"
                                onClick={() => handleAddExpenseComment(expense)}
                                disabled={commentBusyExpenseId === Number(expense.id)}
                                type="button"
                              >
                                Comment
                              </button>
                            </div>
                            {canEditExpenses ? (
                              <div className="row-actions">
                                <button
                                  className="btn ghost btn-inline"
                                  onClick={() => openExpenseEditModal(expense)}
                                  disabled={busy}
                                  type="button"
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn danger btn-inline"
                                  onClick={() => handleDeleteExpense(expense)}
                                  disabled={busy}
                                  type="button"
                                >
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <strong>{formatAmount(expense.amount, currentCurrency)}</strong>
                        </div>
                      );
                    })
                  )}
                </div>
                {filteredExpenses.length > 0 ? (
                  <div className="pager-row">
                    <button
                      className="btn ghost btn-inline"
                      onClick={() => setExpensePage((prev) => Math.max(1, prev - 1))}
                      disabled={expensePage <= 1}
                      type="button"
                    >
                      Previous
                    </button>
                    <p className="muted tiny">
                      Page {Math.min(expensePage, expenseTotalPages)} of {expenseTotalPages}
                    </p>
                    <button
                      className="btn ghost btn-inline"
                      onClick={() => setExpensePage((prev) => Math.min(expenseTotalPages, prev + 1))}
                      disabled={expensePage >= expenseTotalPages}
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </section>
            </>
          )}
        </div>

        <div
          ref={workspaceOcrPanelRef}
          className="panel reveal workspace-panel workspace-panel-ocr workspace-panel-scroll"
        >
          <div className="panel-header">
            <h2>Receipt OCR Studio</h2>
            <span>Upload image or paste text</span>
          </div>

          <div className="stack">
            <div className="ocr-upload-shell">
              <label
                className={`upload-dropzone ${receiptDragOver ? "active" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setReceiptDragOver(true);
                }}
                onDragLeave={() => setReceiptDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setReceiptDragOver(false);
                  const file = event.dataTransfer?.files?.[0];
                  if (file) selectReceiptImageFile(file);
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) selectReceiptImageFile(file);
                    event.target.value = "";
                  }}
                />
                {receiptImagePreview ? (
                  <Image
                    src={receiptImagePreview}
                    alt="Receipt preview"
                    width={1200}
                    height={900}
                    className="upload-preview"
                    unoptimized
                  />
                ) : (
                  <div className="upload-placeholder">
                    <strong>Drop receipt image here</strong>
                    <p>or click to choose file (JPG, PNG, WEBP, max 8MB)</p>
                  </div>
                )}
              </label>

              <div className="split">
                <button
                  className="btn secondary"
                  onClick={handleParseReceiptImage}
                  disabled={!receiptImageFile || ocrImageBusy || busy}
                  type="button"
                >
                  {ocrImageBusy ? "Scanning Image..." : "Scan Image Receipt"}
                </button>
                <button
                  className="btn ghost"
                  onClick={clearReceiptImage}
                  disabled={!receiptImageFile || ocrImageBusy || busy}
                  type="button"
                >
                  Remove Image
                </button>
              </div>

              <p className="muted tiny">
                {ocrImageMeta
                  ? `OCR: ${ocrImageMeta.engine} • Confidence ${Math.round(cleanNumber(ocrImageMeta.confidence) * 100)}%`
                  : "Tip: Use clear, well-lit photos for better OCR extraction."}
              </p>
            </div>

            <textarea
              rows="5"
              placeholder="Paste receipt text here if you want to parse manually..."
              value={ocrText}
              onChange={(event) => setOcrText(event.target.value)}
            />
            <div className="split">
              <button className="btn secondary" onClick={handleParseReceipt} disabled={busy || !ocrText.trim()} type="button">
                Parse Pasted Text
              </button>
              <button className="btn ghost" onClick={applyOcrToExpenseForm} disabled={!ocrParsed || !selectedGroup} type="button">
                Use Parsed Values
              </button>
            </div>
            {!selectedGroup ? (
              <p className="muted tiny">Select a group to apply parsed values into the expense form.</p>
            ) : null}
            {ocrParsed ? (
              <div className="ocr-card">
                <p><span>Merchant</span><strong>{ocrParsed.merchant}</strong></p>
                <p><span>Total</span><strong>{formatAmount(ocrParsed.total, currentCurrency)}</strong></p>
                <p><span>Date</span><strong>{ocrParsed.receiptDate || "Not found"}</strong></p>
                <p><span>Category</span><strong>{ocrParsed.suggestedCategory}</strong></p>
                <p><span>Confidence</span><strong>{Math.round(ocrParsed.confidence * 100)}%</strong></p>
                {ocrImageMeta ? (
                  <p><span>Source</span><strong>{ocrImageMeta.fileName || "Uploaded receipt image"}</strong></p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div
          ref={workspaceSettlementPanelRef}
          className="panel reveal workspace-panel workspace-panel-settlement workspace-panel-scroll"
        >
          <div className="panel-header">
            <h2>Settlement Summary</h2>
            <span>{selectedGroup ? selectedGroup.name : "Select group"}</span>
          </div>

          {!selectedGroup ? (
            <p className="muted">Select a group to see balances and settlements.</p>
          ) : (
            <>
              <section className="panel-section compact">
                <div className="summary-cards">
                  <article>
                    <span>Total Spent</span>
                    <strong>{formatAmount(selectedGroup.summary.totalSpent, currentCurrency)}</strong>
                  </article>
                  <article>
                    <span>Expenses</span>
                    <strong>{selectedGroup.summary.expenseCount}</strong>
                  </article>
                  <article>
                    <span>Pending</span>
                    <strong>{selectedGroup.summary.settlements.length}</strong>
                  </article>
                  <article>
                    <span>Settled</span>
                    <strong>{formatAmount(selectedGroup.summary.settledAmount, currentCurrency)}</strong>
                  </article>
                </div>
              </section>

              <section className="panel-section">
                <div className="section-head">
                  <h3 className="section-title">Member Balances</h3>
                  <span>{selectedGroup.summary.balances.length} members</span>
                </div>
                <div className="list">
                  {selectedGroup.summary.balances.map((balance) => (
                    <div key={balance.memberId} className="list-row">
                      <div>
                        <strong>{balance.name}</strong>
                        <p>
                          Paid {formatAmount(balance.paid, currentCurrency)} • Owes{" "}
                          {formatAmount(balance.owes, currentCurrency)}
                        </p>
                      </div>
                      <span className={`net ${balance.net >= 0 ? "positive" : "negative"}`}>
                        {balance.net >= 0 ? "+" : ""}
                        {formatAmount(balance.net, currentCurrency)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel-section">
                <div className="section-head">
                  <h3 className="section-title">Suggested Settlements</h3>
                  <span>{selectedGroup.summary.settlements.length} pending</span>
                </div>
                <div className="stack">
                  <label className="field-label">Reminder Message (optional)</label>
                  <textarea
                    rows="2"
                    placeholder="Add custom reminder text for email/SMS notifications..."
                    value={settlementMessage}
                    onChange={(event) => setSettlementMessage(event.target.value)}
                  />
                  <p className="tiny muted">
                    Use <strong>Mark Paid</strong> to add paid amount, optional proof, and note.
                  </p>
                  <p className="tiny muted">
                    Debt simplification is active:{" "}
                    {Number(selectedGroup.summary?.settlementStats?.naiveTransactionCount || 0) > 0
                      ? `${selectedGroup.summary?.settlementStats?.simplifiedTransactionCount || 0} settlement${
                          Number(selectedGroup.summary?.settlementStats?.simplifiedTransactionCount || 0) === 1 ? "" : "s"
                        } instead of up to ${selectedGroup.summary?.settlementStats?.naiveTransactionCount || 0} (${
                          selectedGroup.summary?.settlementStats?.transactionsSaved || 0
                        } fewer transaction${
                          Number(selectedGroup.summary?.settlementStats?.transactionsSaved || 0) === 1 ? "" : "s"
                        }).`
                      : "settlements are minimized to reduce total transactions."}
                  </p>
                </div>
                {!canNotifySettlement ? (
                  <p className="muted tiny">Your role cannot send settlement reminders.</p>
                ) : null}
                {!canMarkSettlementPaid ? (
                  <p className="muted tiny">Your role cannot mark settlements as paid.</p>
                ) : null}
                <div className="list">
                  {selectedGroup.summary.settlements.length === 0 ? (
                    <p className="muted">No pending settlements.</p>
                  ) : (
                  selectedGroup.summary.settlements.map((item, idx) => {
                    const payerMember = memberById.get(Number(item.fromMemberId));
                    const payeeMember = memberById.get(Number(item.toMemberId));
                    const hasEmail = Boolean(String(payerMember?.email || "").trim());
                    const hasPhone = Boolean(String(payerMember?.phone || "").trim());
                    const canSendAny = hasEmail || hasPhone;
                    const upiUri =
                      String(currentCurrency || "INR").toUpperCase() === "INR"
                        ? buildUpiPaymentUri({
                            upiId: payeeMember?.upiId,
                            payeeName: item.toName,
                            amount: item.amount,
                            note: `${item.fromName} settlement to ${item.toName}`,
                            currency: "INR",
                          })
                        : "";

                    return (
                      <div key={`${item.fromMemberId}-${item.toMemberId}-${idx}`} className="list-row settlement-row">
                        <div>
                          <p>
                            {item.fromName} pays {item.toName}
                          </p>
                          <div className="settlement-actions">
                            <button
                              className="btn ghost btn-inline"
                              onClick={() => handleNotifySettlement(item, "email")}
                              disabled={notifyBusy || !canNotifySettlement || !hasEmail}
                              title={!hasEmail ? "Add member email in Members section first" : "Send email reminder"}
                              type="button"
                            >
                              Email
                            </button>
                            <button
                              className="btn ghost btn-inline"
                              onClick={() => handleNotifySettlement(item, "sms")}
                              disabled={notifyBusy || !canNotifySettlement || !hasPhone}
                              title={!hasPhone ? "Add member contact number in Members section first" : "Send SMS reminder"}
                              type="button"
                            >
                              Text
                            </button>
                            <button
                              className="btn ghost btn-inline"
                              onClick={() => handleNotifySettlement(item, "whatsapp")}
                              disabled={notifyBusy || !canNotifySettlement || !hasPhone}
                              title={!hasPhone ? "Add member contact number in Members section first" : "Send WhatsApp reminder"}
                              type="button"
                            >
                              WhatsApp
                            </button>
                            <button
                              className="btn ghost btn-inline"
                              onClick={() => handleNotifySettlement(item, "all")}
                              disabled={notifyBusy || !canNotifySettlement || !canSendAny}
                              title={!canSendAny ? "Add member email/phone in Members section first" : "Try all channels"}
                              type="button"
                            >
                              All
                            </button>
                            <button
                              className="btn ghost btn-inline"
                              onClick={() => openSettlementPayModal(item)}
                              disabled={busy || !canMarkSettlementPaid}
                              type="button"
                            >
                              Mark Paid
                            </button>
                          </div>
                          {!canSendAny ? (
                            <p className="tiny muted">
                              Add email or phone for {item.fromName} in Members to send reminders.
                            </p>
                          ) : null}
                          {upiUri ? (
                            <div className="qr-wrap">
                              <div className="qr-box">
                                <QRCodeSVG value={upiUri} size={112} />
                              </div>
                              <div className="qr-copy">
                                <p className="tiny muted">Scan with any UPI app to pay {item.toName}.</p>
                                <button
                                  className="btn ghost btn-inline"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(upiUri);
                                      setNotice("UPI payment link copied.");
                                    } catch {
                                      setError("Could not copy UPI link");
                                    }
                                  }}
                                  type="button"
                                >
                                  Copy UPI Link
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="tiny muted">
                              Add UPI ID for {item.toName} in Members to show QR code.
                            </p>
                          )}
                        </div>
                        <strong>{formatAmount(item.amount, currentCurrency)}</strong>
                      </div>
                    );
                  })
                )}
              </div>
              </section>

              <section className="panel-section">
                <div className="section-head">
                  <h3 className="section-title">Payment History</h3>
                  <span>{(selectedGroup.settlementPayments || []).length} records</span>
                </div>
                <div className="list">
                  {(selectedGroup.settlementPayments || []).length === 0 ? (
                    <p className="muted">No completed payments yet.</p>
                  ) : (
                    selectedGroup.settlementPayments.slice(0, 12).map((payment) => (
                      <div key={payment.id} className="list-row settlement-row">
                        <div>
                          <p>
                            {payment.fromName} paid {payment.toName}
                          </p>
                          <p className="tiny">
                            {String(payment.status || "completed").toUpperCase()} •{" "}
                            {formatDateTime(payment.createdAt)}
                          </p>
                          {payment.note ? <p className="tiny">{payment.note}</p> : null}
                          {payment.proofName ? (
                            <p className="tiny">
                              Proof:{" "}
                              {payment.proofUrl ? (
                                <a className="inline-link" href={payment.proofUrl} target="_blank" rel="noreferrer">
                                  {payment.proofName}
                                </a>
                              ) : (
                                payment.proofName
                              )}
                            </p>
                          ) : null}
                          <div className="row-actions">
                            <button
                              className="btn ghost btn-inline"
                              onClick={() => openPaymentEditModal(payment)}
                              disabled={busy || !canManageSelectedGroup}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="btn danger btn-inline"
                              onClick={() => handleDeleteSettlementPayment(payment)}
                              disabled={busy || !canManageSelectedGroup}
                              type="button"
                            >
                              Delete
                            </button>
                          </div>
                          {!canManageSelectedGroup ? (
                            <p className="tiny muted">Edit/delete available for admin or owner.</p>
                          ) : null}
                        </div>
                        <strong>{formatAmount(payment.amount, payment.currency || currentCurrency)}</strong>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="panel-section">
                <div className="section-head">
                  <h3 className="section-title">Notification History</h3>
                  <span>{(selectedGroup.notificationLogs || []).length} records</span>
                </div>
                <div className="list">
                  {(selectedGroup.notificationLogs || []).length === 0 ? (
                    <p className="muted">No notifications sent yet.</p>
                  ) : (
                    selectedGroup.notificationLogs.slice(0, 12).map((log) => {
                      const failed = String(log.status || "").toLowerCase() === "failed";
                      return (
                        <div key={log.id} className="list-row settlement-row">
                          <div>
                            <p>
                              {log.fromName} reminder via {String(log.channel || "").toUpperCase()} ({log.status})
                            </p>
                            <p className="tiny">
                              Target: {log.target || "-"} • {formatDateTime(log.createdAt)}
                            </p>
                            {log.message ? <p className="tiny">{log.message}</p> : null}
                            {hasValue(log.webhookStatus) ? (
                              <p className="tiny">Webhook status: {log.webhookStatus}</p>
                            ) : null}
                            {failed ? (
                              <button
                                className="btn ghost btn-inline"
                                onClick={() => handleRetryNotification(log.id)}
                                disabled={notifyBusy}
                                type="button"
                              >
                                Retry
                              </button>
                            ) : null}
                            <button
                              className="btn danger btn-inline"
                              onClick={() => handleDeleteNotificationLog(log)}
                              disabled={notifyBusy || !canManageSelectedGroup}
                              type="button"
                            >
                              Delete
                            </button>
                            {!canManageSelectedGroup ? (
                              <p className="tiny muted">Delete available for admin or owner.</p>
                            ) : null}
                          </div>
                          <strong>{formatAmount(log.amount, log.currency || currentCurrency)}</strong>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="panel-section">
                <div className="section-head">
                  <h3 className="section-title">Spending Charts</h3>
                  <span>{selectedGroup.summary.categoryBreakdown.length} categories</span>
                </div>
                {selectedGroup.summary.categoryBreakdown.length === 0 ? (
                  <div className="list">
                    <p className="muted">No category data yet.</p>
                  </div>
                ) : (
                  <div className="chart-grid">
                    <div className="chart-card">
                      <p className="tiny muted">Spend by category (Bar)</p>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={categoryChartData}>
                          <XAxis dataKey="category" />
                          <YAxis />
                          <Tooltip
                            formatter={(value) => formatAmount(value, currentCurrency)}
                            contentStyle={{ borderRadius: 12, border: "1px solid var(--line)" }}
                          />
                          <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                            {categoryChartData.map((entry) => (
                              <Cell key={entry.category} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="chart-card">
                      <p className="tiny muted">Share by category (Pie)</p>
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={categoryChartData}
                            dataKey="amount"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            outerRadius={88}
                          >
                            {categoryChartData.map((entry) => (
                              <Cell key={entry.category} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) => formatAmount(value, currentCurrency)}
                            contentStyle={{ borderRadius: 12, border: "1px solid var(--line)" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </section>

              <section className="panel-section">
                <div className="section-head">
                  <h3 className="section-title">Member Spending Leaderboard</h3>
                  <span>{leaderboard.length} members</span>
                </div>
                <div className="list">
                  {leaderboard.length === 0 ? (
                    <p className="muted">No spending data yet.</p>
                  ) : (
                    leaderboard.map((item, index) => (
                      <div key={item.memberId} className="list-row">
                        <p>
                          #{index + 1} {item.name}
                        </p>
                        <strong>{formatAmount(item.amount, currentCurrency)}</strong>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="panel-section">
                <div className="section-head">
                  <h3 className="section-title">AI Spending Insights</h3>
                  <span>Weekly trends</span>
                </div>
                <div className="list">
                  {weeklyInsights.length === 0 ? (
                    <p className="muted">Not enough recent data to generate insights yet.</p>
                  ) : (
                    weeklyInsights.map((line, index) => (
                      <div key={`${line}-${index}`} className="list-row">
                        <p>{line}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="panel-section">
                <div className="section-head">
                  <h3 className="section-title">Activity Feed</h3>
                  <span>{recentActivities.length} recent events</span>
                </div>
                <div className="row-actions">
                  <button
                    className="btn ghost btn-inline"
                    onClick={requestBrowserNotificationPermission}
                    type="button"
                  >
                    Enable Browser Alerts
                  </button>
                  <button
                    className="btn secondary btn-inline"
                    onClick={pushSubscribed ? handleDisableWebPush : handleEnableWebPush}
                    disabled={pushBusy || !pushSupported}
                    type="button"
                  >
                    {pushSubscribed ? "Disable Web Push" : "Enable Web Push"}
                  </button>
                  <label className="chip check">
                    <input
                      type="checkbox"
                      checked={browserNotifyEnabled}
                      onChange={(event) => setBrowserNotifyEnabled(event.target.checked)}
                    />
                    Alerts active
                  </label>
                  <p className="tiny muted">Permission: {browserNotifyPermission}</p>
                  <p className="tiny muted">
                    Push: {pushSupported ? (pushSubscribed ? "Subscribed" : "Not subscribed") : "Unsupported"}
                  </p>
                </div>
                <div className="list">
                  {recentActivities.length === 0 ? (
                    <p className="muted">No activity yet.</p>
                  ) : (
                    recentActivities.map((activity) => (
                      <div key={activity.id} className="list-row">
                        <div>
                          <p>{activity.message}</p>
                          <p className="tiny muted">
                            {String(activity.type || "event").replaceAll("_", " ")} •{" "}
                            {formatDateTime(activity.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </section>
      <Modal
        open={memberEditModal.open}
        title="Edit Member"
        onClose={() =>
          setMemberEditModal({ open: false, memberId: null, name: "", email: "", phone: "", upiId: "" })
        }
      >
        <form className="stack" onSubmit={handleSubmitMemberEdit}>
          <input
            placeholder="Name"
            value={memberEditModal.name}
            onChange={(event) => setMemberEditModal((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <input
            placeholder="Email"
            type="email"
            value={memberEditModal.email}
            onChange={(event) => setMemberEditModal((prev) => ({ ...prev, email: event.target.value }))}
          />
          <input
            placeholder="Contact number"
            type="tel"
            value={memberEditModal.phone}
            onChange={(event) => setMemberEditModal((prev) => ({ ...prev, phone: event.target.value }))}
          />
          <input
            placeholder="UPI ID (example@bank)"
            value={memberEditModal.upiId || ""}
            onChange={(event) =>
              setMemberEditModal((prev) => ({ ...prev, upiId: sanitizeUpiHandle(event.target.value) }))
            }
          />
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? "Saving..." : "Save Member"}
          </button>
        </form>
      </Modal>

      <Modal
        open={expenseEditModal.open}
        title="Edit Expense"
        onClose={() =>
          setExpenseEditModal({
            open: false,
            expenseId: null,
            title: "",
            amount: "",
            category: "Misc",
            expenseDate: "",
            notes: "",
          })
        }
      >
        <form className="stack" onSubmit={handleSubmitExpenseEdit}>
          <input
            placeholder="Expense title"
            value={expenseEditModal.title}
            onChange={(event) => setExpenseEditModal((prev) => ({ ...prev, title: event.target.value }))}
            required
          />
          <div className="split">
            <input
              placeholder="Amount"
              type="number"
              min="0"
              step="0.01"
              value={expenseEditModal.amount}
              onChange={(event) => setExpenseEditModal((prev) => ({ ...prev, amount: event.target.value }))}
              required
            />
            <input
              type="date"
              value={expenseEditModal.expenseDate}
              onChange={(event) => setExpenseEditModal((prev) => ({ ...prev, expenseDate: event.target.value }))}
            />
          </div>
          <select
            value={expenseEditModal.category}
            onChange={(event) => setExpenseEditModal((prev) => ({ ...prev, category: event.target.value }))}
          >
            <option value="Auto">Auto detect</option>
            {expenseCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            placeholder="Notes"
            value={expenseEditModal.notes}
            onChange={(event) => setExpenseEditModal((prev) => ({ ...prev, notes: event.target.value }))}
          />
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? "Saving..." : "Save Expense"}
          </button>
        </form>
      </Modal>

      <Modal
        open={paymentEditModal.open}
        title="Edit Payment Note"
        onClose={() => setPaymentEditModal({ open: false, paymentId: null, note: "" })}
      >
        <form className="stack" onSubmit={handleSubmitPaymentEdit}>
          <textarea
            rows="4"
            placeholder="Payment note"
            value={paymentEditModal.note}
            onChange={(event) => setPaymentEditModal((prev) => ({ ...prev, note: event.target.value }))}
          />
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? "Saving..." : "Save Note"}
          </button>
        </form>
      </Modal>

      <Modal
        open={settlementPayModal.open}
        title="Mark Settlement as Paid"
        onClose={() =>
          setSettlementPayModal({
            open: false,
            fromMemberId: null,
            toMemberId: null,
            fromName: "",
            toName: "",
            maxAmount: 0,
            amount: "",
            note: "",
            proofFile: null,
          })
        }
      >
        <form className="stack" onSubmit={handleSubmitSettlementPaid}>
          <p className="muted tiny">
            {settlementPayModal.fromName} pays {settlementPayModal.toName}. Pending amount:{" "}
            {formatAmount(settlementPayModal.maxAmount, currentCurrency)}
          </p>
          <input
            placeholder="Paid amount"
            type="number"
            min="0"
            max={settlementPayModal.maxAmount || undefined}
            step="0.01"
            value={settlementPayModal.amount}
            onChange={(event) => setSettlementPayModal((prev) => ({ ...prev, amount: event.target.value }))}
            required
          />
          <textarea
            rows="3"
            placeholder="Optional note"
            value={settlementPayModal.note}
            onChange={(event) => setSettlementPayModal((prev) => ({ ...prev, note: event.target.value }))}
          />
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(event) =>
              setSettlementPayModal((prev) => ({ ...prev, proofFile: event.target.files?.[0] || null }))
            }
          />
          {settlementPayModal.proofFile ? (
            <p className="tiny muted">Attached: {settlementPayModal.proofFile.name}</p>
          ) : null}
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? "Saving..." : "Confirm Payment"}
          </button>
        </form>
      </Modal>

      {error ? <p className="banner error">{error}</p> : null}
      {notice ? <p className="banner notice">{notice}</p> : null}
    </main>
  );
}
