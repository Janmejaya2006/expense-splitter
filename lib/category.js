const RULES = [
  { category: "Food", pattern: /(zomato|swiggy|restaurant|cafe|coffee|dinner|lunch|breakfast|meal|snack|food)/i },
  { category: "Transport", pattern: /(uber|ola|taxi|cab|metro|bus|train|flight|fuel|petrol|diesel|parking|toll)/i },
  { category: "Stay", pattern: /(hotel|airbnb|hostel|resort|stay|room|accommodation|booking)/i },
  { category: "Groceries", pattern: /(grocery|groceries|supermarket|mart|vegetable|milk|fruits|provision)/i },
  { category: "Utilities", pattern: /(electricity|water|internet|wifi|broadband|gas|utility|recharge|bill)/i },
  { category: "Entertainment", pattern: /(movie|cinema|netflix|spotify|concert|event|game|entertainment)/i },
  { category: "Shopping", pattern: /(amazon|flipkart|myntra|shopping|clothes|apparel|electronics)/i },
  { category: "Health", pattern: /(medicine|pharmacy|doctor|hospital|clinic|health|insurance)/i },
];

export function detectExpenseCategory({ title = "", notes = "", fallback = "Misc" } = {}) {
  const text = `${String(title || "")} ${String(notes || "")}`.trim();
  if (!text) return String(fallback || "Misc");

  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return rule.category;
    }
  }

  return String(fallback || "Misc");
}

