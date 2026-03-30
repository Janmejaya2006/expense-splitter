import { useCallback, useMemo, useState } from "react";

const DEFAULT_EXPENSE_FILTERS = {
  search: "",
  memberId: "",
  category: "",
  dateFrom: "",
  dateTo: "",
  sortBy: "expenseDate",
  sortDir: "desc",
};

export default function useExpenseListState(selectedGroup) {
  const [expenseFilters, setExpenseFilters] = useState(DEFAULT_EXPENSE_FILTERS);
  const [expensePage, setExpensePage] = useState(1);

  const filteredExpenses = useMemo(() => {
    const expenses = [...(selectedGroup?.expenses || [])];
    const search = String(expenseFilters.search || "").trim().toLowerCase();
    const memberId = Number(expenseFilters.memberId || 0);
    const category = String(expenseFilters.category || "").trim().toLowerCase();
    const fromValue = expenseFilters.dateFrom ? new Date(expenseFilters.dateFrom).getTime() : null;
    const toValue = expenseFilters.dateTo ? new Date(expenseFilters.dateTo).getTime() : null;

    let list = expenses;

    if (search) {
      list = list.filter(
        (expense) =>
          String(expense.title || "").toLowerCase().includes(search) ||
          String(expense.notes || "").toLowerCase().includes(search)
      );
    }

    if (memberId > 0) {
      list = list.filter(
        (expense) =>
          Number(expense.payerMemberId) === memberId || (expense.participants || []).includes(memberId)
      );
    }

    if (category) {
      list = list.filter((expense) => String(expense.category || "").toLowerCase() === category);
    }

    if (fromValue !== null && Number.isFinite(fromValue)) {
      list = list.filter((expense) => {
        const value = new Date(expense.expenseDate || expense.createdAt).getTime();
        return Number.isFinite(value) && value >= fromValue;
      });
    }

    if (toValue !== null && Number.isFinite(toValue)) {
      list = list.filter((expense) => {
        const value = new Date(expense.expenseDate || expense.createdAt).getTime();
        return Number.isFinite(value) && value <= toValue;
      });
    }

    const sortBy = expenseFilters.sortBy || "expenseDate";
    const sortDir = expenseFilters.sortDir === "asc" ? "asc" : "desc";
    list.sort((a, b) => {
      let left;
      let right;
      if (sortBy === "amount") {
        left = Number(a.amount || 0);
        right = Number(b.amount || 0);
      } else if (sortBy === "title") {
        left = String(a.title || "").toLowerCase();
        right = String(b.title || "").toLowerCase();
      } else if (sortBy === "category") {
        left = String(a.category || "").toLowerCase();
        right = String(b.category || "").toLowerCase();
      } else {
        left = new Date(a.expenseDate || a.createdAt).getTime();
        right = new Date(b.expenseDate || b.createdAt).getTime();
      }

      if (left < right) return sortDir === "asc" ? -1 : 1;
      if (left > right) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [selectedGroup, expenseFilters]);

  const expenseCategories = useMemo(() => {
    const base = new Set(["Misc", "Food", "Transport", "Stay", "Utilities", "Groceries"]);
    for (const expense of selectedGroup?.expenses || []) {
      const category = String(expense?.category || "").trim();
      if (category) {
        base.add(category);
      }
    }
    return Array.from(base);
  }, [selectedGroup]);

  const expensePageSize = 8;
  const expenseTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredExpenses.length / expensePageSize)),
    [filteredExpenses.length]
  );
  const safeExpensePage = useMemo(
    () => Math.min(Math.max(1, expensePage), expenseTotalPages),
    [expensePage, expenseTotalPages]
  );
  const visibleExpenses = useMemo(() => {
    const start = (safeExpensePage - 1) * expensePageSize;
    return filteredExpenses.slice(start, start + expensePageSize);
  }, [filteredExpenses, safeExpensePage]);

  const resetExpenseListState = useCallback(() => {
    setExpensePage(1);
    setExpenseFilters(DEFAULT_EXPENSE_FILTERS);
  }, []);

  return {
    expenseFilters,
    setExpenseFilters,
    expensePage: safeExpensePage,
    setExpensePage,
    filteredExpenses,
    expenseCategories,
    expenseTotalPages,
    visibleExpenses,
    resetExpenseListState,
  };
}
