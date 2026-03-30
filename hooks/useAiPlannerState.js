import { useCallback, useMemo, useState } from "react";
import { cleanNumber, memberNameKey, normalizeCurrency, normalizeReceiptDate, round2, uniqueMemberEntries } from "@/lib/dashboardUtils";

export default function useAiPlannerState({
  apiRequest,
  clearMessages,
  setError,
  setNotice,
  setBusy,
  loadOverview,
  loadGroupDetail,
  setSelectedGroupId,
}) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPlan, setAiPlan] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);

  const aiPlanTotals = useMemo(() => {
    if (!aiPlan?.expenses?.length) return 0;
    return round2(aiPlan.expenses.reduce((sum, expense) => sum + cleanNumber(expense.amount), 0));
  }, [aiPlan]);

  const handleBuildAiPlan = useCallback(async () => {
    if (!aiPrompt.trim()) {
      setError("Add a trip description first.");
      return;
    }

    clearMessages();
    setAiBusy(true);

    try {
      const body = await apiRequest("/api/ai/plan", {
        method: "POST",
        body: JSON.stringify({ prompt: aiPrompt }),
      });

      setAiPlan(body.plan || null);

      const source = body.plan?.source === "openai" ? "OpenAI" : "local parser";
      setNotice(`AI plan ready from ${source}. Review and import when ready.`);
    } catch (err) {
      setError(err.message || "Failed to generate AI plan");
    } finally {
      setAiBusy(false);
    }
  }, [aiPrompt, setError, clearMessages, apiRequest, setNotice]);

  const handleImportAiPlan = useCallback(async () => {
    if (!aiPlan) {
      setError("Generate a plan before importing.");
      return;
    }

    clearMessages();
    setBusy(true);

    try {
      const allMemberCandidates = [];

      for (const member of aiPlan.members || []) {
        allMemberCandidates.push({
          name: member?.name,
          email: member?.email,
        });
      }

      for (const expense of aiPlan.expenses || []) {
        allMemberCandidates.push({ name: expense?.payerName, email: "" });

        for (const name of expense?.participantNames || []) allMemberCandidates.push({ name, email: "" });
        for (const name of Object.keys(expense?.splitConfig?.percentages || {})) allMemberCandidates.push({ name, email: "" });
        for (const name of Object.keys(expense?.splitConfig?.shares || {})) allMemberCandidates.push({ name, email: "" });
      }

      const membersToCreate = uniqueMemberEntries(allMemberCandidates);
      if (membersToCreate.length === 0) throw new Error("AI plan has no members to import.");

      const groupBody = await apiRequest("/api/groups", {
        method: "POST",
        body: JSON.stringify({
          name: String(aiPlan.group?.name || "AI Planned Group").trim() || "AI Planned Group",
          description: String(aiPlan.group?.description || "Created from AI planner").trim() || "Created from AI planner",
          currency: normalizeCurrency(aiPlan.group?.currency),
        }),
      });

      const groupId = groupBody.group?.id;
      if (!groupId) throw new Error("Could not create group for AI import.");

      for (const member of membersToCreate) {
        await apiRequest(`/api/groups/${groupId}/members`, {
          method: "POST",
          body: JSON.stringify(member),
        });
      }

      const groupDetail = await apiRequest(`/api/groups/${groupId}`);
      const createdMembers = groupDetail.group?.members || [];
      const memberIdByName = new Map();
      for (const member of createdMembers) memberIdByName.set(memberNameKey(member.name), Number(member.id));
      const allMemberIds = createdMembers.map((member) => Number(member.id)).filter((id) => Number.isFinite(id));
      const resolveMemberId = (name) => memberIdByName.get(memberNameKey(name || "")) || null;

      const importedExpenses = [];
      for (const expense of aiPlan.expenses || []) {
        const amount = cleanNumber(expense?.amount);
        if (amount <= 0) continue;

        let splitMode = ["equal", "percent", "shares"].includes(expense?.splitMode) ? expense.splitMode : "equal";
        const participantSet = new Set();
        for (const name of expense?.participantNames || []) {
          const id = resolveMemberId(name);
          if (id) participantSet.add(id);
        }
        if (splitMode === "percent") {
          for (const name of Object.keys(expense?.splitConfig?.percentages || {})) {
            const id = resolveMemberId(name);
            if (id) participantSet.add(id);
          }
        }
        if (splitMode === "shares") {
          for (const name of Object.keys(expense?.splitConfig?.shares || {})) {
            const id = resolveMemberId(name);
            if (id) participantSet.add(id);
          }
        }
        if (participantSet.size === 0) {
          for (const id of allMemberIds) participantSet.add(id);
        }

        const participants = Array.from(participantSet);
        if (participants.length === 0) continue;

        const payerMemberId = resolveMemberId(expense?.payerName) || participants[0] || allMemberIds[0];
        if (!payerMemberId) continue;

        let splitConfig = null;

        if (splitMode === "percent") {
          const raw = expense?.splitConfig?.percentages || {};
          const percentageByMemberId = {};
          for (const [name, value] of Object.entries(raw)) {
            const id = resolveMemberId(name);
            const pct = cleanNumber(value);
            if (!id || pct <= 0) continue;
            percentageByMemberId[id] = round2((percentageByMemberId[id] || 0) + pct);
          }

          const normalizedPercentages = {};
          let total = 0;
          for (const participantId of participants) {
            const pct = cleanNumber(percentageByMemberId[participantId]);
            normalizedPercentages[participantId] = pct;
            total += pct;
          }

          if (total <= 0) {
            splitMode = "equal";
          } else {
            if (Math.abs(total - 100) > 0.5) {
              const scale = 100 / total;
              let scaledTotal = 0;
              for (const participantId of participants) {
                normalizedPercentages[participantId] = round2(normalizedPercentages[participantId] * scale);
                scaledTotal += normalizedPercentages[participantId];
              }
              const diff = round2(100 - scaledTotal);
              normalizedPercentages[participants[0]] = round2(normalizedPercentages[participants[0]] + diff);
            }
            splitConfig = { percentages: normalizedPercentages };
          }
        }

        if (splitMode === "shares") {
          const raw = expense?.splitConfig?.shares || {};
          const sharesByMemberId = {};
          for (const [name, value] of Object.entries(raw)) {
            const id = resolveMemberId(name);
            const share = cleanNumber(value);
            if (!id || share <= 0) continue;
            sharesByMemberId[id] = round2((sharesByMemberId[id] || 0) + share);
          }

          const normalizedShares = {};
          let totalShares = 0;
          for (const participantId of participants) {
            const share = cleanNumber(sharesByMemberId[participantId]);
            normalizedShares[participantId] = share;
            totalShares += share;
          }

          if (totalShares <= 0) {
            splitMode = "equal";
          } else {
            splitConfig = { shares: normalizedShares };
          }
        }

        await apiRequest(`/api/groups/${groupId}/expenses`, {
          method: "POST",
          body: JSON.stringify({
            title: String(expense?.title || "Imported Expense").trim() || "Imported Expense",
            amount,
            payerMemberId,
            participants,
            splitMode,
            splitConfig,
            category: String(expense?.category || "Misc").trim() || "Misc",
            expenseDate: normalizeReceiptDate(expense?.expenseDate) || "",
            notes: String(expense?.notes || "Imported from AI planner").trim() || "Imported from AI planner",
          }),
        });

        importedExpenses.push(expense);
      }

      await loadOverview();
      setSelectedGroupId(groupId);
      await loadGroupDetail(groupId);
      setNotice(`Imported ${membersToCreate.length} members and ${importedExpenses.length} expenses into ${groupBody.group.name}.`);
    } catch (err) {
      setError(err.message || "Failed to import AI plan");
    } finally {
      setBusy(false);
    }
  }, [
    aiPlan,
    setError,
    clearMessages,
    setBusy,
    apiRequest,
    loadOverview,
    setSelectedGroupId,
    loadGroupDetail,
    setNotice,
  ]);

  return {
    aiPrompt,
    setAiPrompt,
    aiPlan,
    setAiPlan,
    aiBusy,
    aiPlanTotals,
    handleBuildAiPlan,
    handleImportAiPlan,
  };
}
