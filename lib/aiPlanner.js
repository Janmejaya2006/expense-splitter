function round2(value) {
  return Number((value + Number.EPSILON).toFixed(2));
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z\s]/g, "")
    .replace(/\s+/g, " ");
}

function nameKey(name) {
  return normalizeName(name).toLowerCase();
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (ch) => ch.toUpperCase())
    .trim();
}

const NAME_STOPWORDS = new Set([
  "all",
  "among",
  "amount",
  "and",
  "between",
  "booking",
  "by",
  "covered",
  "event",
  "expense",
  "expenses",
  "for",
  "friends",
  "from",
  "group",
  "member",
  "members",
  "paid",
  "people",
  "rental",
  "share",
  "shares",
  "split",
  "spent",
  "total",
  "trip",
  "with",
]);

function cleanCandidateName(value) {
  const normalized = normalizeName(value);
  if (!normalized) return "";

  const words = normalized
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((word) => !NAME_STOPWORDS.has(word.toLowerCase()))
    .filter((word) => word.length > 1);

  if (words.length === 0 || words.length > 3) return "";
  return titleCase(words.join(" "));
}

function parseNameList(text) {
  const cleaned = String(text || "")
    .replace(/\band\b/gi, ",")
    .replace(/&/g, ",")
    .replace(/[()]/g, " ");

  const raw = cleaned
    .split(/[;,]/)
    .map((item) => cleanCandidateName(item))
    .filter(Boolean)
    .filter((item) => item.length <= 40);

  const seen = new Set();
  const result = [];

  for (const name of raw) {
    const key = nameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(titleCase(name));
  }

  return result;
}

function inferCategory(title) {
  const lower = String(title || "").toLowerCase();

  if (/(hotel|stay|resort|airbnb|hostel|room|booking)/.test(lower)) return "Stay";
  if (/(food|dinner|lunch|breakfast|meal|restaurant|cafe|snack)/.test(lower)) return "Food";
  if (/(taxi|uber|ola|bus|flight|fuel|petrol|transport|train|cab|rental)/.test(lower)) return "Transport";
  if (/(grocery|mart|supermarket|milk|vegetable|groceries)/.test(lower)) return "Groceries";
  if (/(internet|wifi|electricity|water|gas|utility|utilities)/.test(lower)) return "Utilities";
  return "Misc";
}

function inferCurrency(prompt) {
  const text = String(prompt || "").toLowerCase();
  if (/(\$|\busd\b)/.test(text)) return "USD";
  if (/(€|\beur\b)/.test(text)) return "EUR";
  return "INR";
}

function normalizeDate(value) {
  if (!value) return "";

  const text = String(value).trim();

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [y, m, d] = text.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(text)) {
    const [a, b, c] = text.split(/[\/-]/);
    if (c.length === 4) {
      const year = c;
      const month = b.padStart(2, "0");
      const day = a.padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    const year = c.length === 2 ? `20${c}` : c;
    const month = b.padStart(2, "0");
    const day = a.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return "";
}

function extractGroupName(prompt) {
  const text = String(prompt || "");

  const explicit = text.match(/(?:group|trip|event)\s*[:\-]\s*([^\n.]+)/i);
  if (explicit?.[1]) {
    return titleCase(explicit[1]);
  }

  const tripTo = text.match(/trip to\s+([a-zA-Z\s]+)/i);
  if (tripTo?.[1]) {
    return `${titleCase(tripTo[1])} Trip`;
  }

  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (firstLine && firstLine.length <= 48 && !/\d/.test(firstLine)) {
    return titleCase(firstLine);
  }

  return "AI Planned Group";
}

function extractPeople(prompt) {
  const text = String(prompt || "");
  const names = [];

  const withPattern = text.match(/(?:with|members?|people|friends?)\s*[:\-]?\s*([^\n.;]+)/i);
  if (withPattern?.[1]) {
    names.push(...parseNameList(withPattern[1]));
  }

  const paidByMatches = [
    ...text.matchAll(/paid by\s+([A-Za-z][A-Za-z\s]{1,40}?)(?=\s+(?:split|among|between|for|on)\b|[.,;]|$)/gi),
  ];
  for (const match of paidByMatches) {
    names.push(...parseNameList(match[1]));
  }

  const splitMatches = [...text.matchAll(/split\s+(?:among|between|with)\s+([^\n.;]+)/gi)];
  const amongMatches = [...text.matchAll(/(?:among|between)\s+([^\n.;]+)/gi)];

  for (const match of splitMatches) {
    names.push(...parseNameList(match[1]));
  }

  for (const match of amongMatches) {
    names.push(...parseNameList(match[1]));
  }

  const unique = [];
  const seen = new Set();

  for (const name of names) {
    const key = nameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }

  return unique;
}

function parseSplitMetadata(segment) {
  const percentages = {};
  const shares = {};

  const pairStyleA = [...segment.matchAll(/([A-Za-z][A-Za-z\s]{0,25})\s*[:=\-]?\s*(\d{1,3}(?:\.\d+)?)%/g)];
  const pairStyleB = [...segment.matchAll(/(\d{1,3}(?:\.\d+)?)%\s*([A-Za-z][A-Za-z\s]{0,25})/g)];

  for (const match of [...pairStyleA, ...pairStyleB]) {
    const maybeName = parseNameList(match[1])[0] || "";
    const maybePct = Number(match[2]);

    if (pairStyleB.includes(match)) {
      const pct = Number(match[1]);
      const name = parseNameList(match[2])[0] || "";
      if (name && Number.isFinite(pct)) percentages[titleCase(name)] = round2(pct);
    } else if (maybeName && Number.isFinite(maybePct)) {
      percentages[titleCase(maybeName)] = round2(maybePct);
    }
  }

  const percentageNames = Object.keys(percentages);
  if (percentageNames.length >= 2) {
    return {
      splitMode: "percent",
      splitConfig: { percentages },
      participantNames: percentageNames,
    };
  }

  const shareMatchesA = [...segment.matchAll(/([A-Za-z][A-Za-z\s]{0,25})\s*[:=\-]?\s*(\d+(?:\.\d+)?)\s*shares?/gi)];
  const sharesZone = segment.split(/\bshares?\b/i)[1] || "";
  const shareMatchesB = sharesZone
    ? [...sharesZone.matchAll(/([A-Za-z][A-Za-z\s]{0,25})\s*[:=\-]\s*(\d+(?:\.\d+)?)/gi)]
    : [];

  for (const match of [...shareMatchesA, ...shareMatchesB]) {
    const name = parseNameList(match[1])[0] || "";
    const share = Number(match[2]);
    if (name && Number.isFinite(share)) shares[titleCase(name)] = round2(share);
  }

  const shareNames = Object.keys(shares);
  if (shareNames.length >= 2) {
    return {
      splitMode: "shares",
      splitConfig: { shares },
      participantNames: shareNames,
    };
  }

  const participantMatch =
    segment.match(/split\s+(?:among|between|with)\s+([^.;\n]+)/i) ||
    segment.match(/(?:among|between)\s+([^.;\n]+)/i);
  const participantNames = participantMatch ? parseNameList(participantMatch[1]) : [];

  return {
    splitMode: "equal",
    splitConfig: null,
    participantNames,
  };
}

function extractPayer(segment) {
  const patternA = segment.match(/paid by\s+([A-Za-z][A-Za-z\s]{1,40}?)(?=\s+(?:split|among|between|for|on)\b|[.,;]|$)/i);
  if (patternA?.[1]) {
    const candidate = parseNameList(patternA[1])[0] || "";
    if (candidate) return candidate;
  }

  const patternB = segment.match(/^([A-Za-z][A-Za-z\s]{1,30}?)(?=\s+(?:paid|spent|booked|covered)\b)/i);
  if (patternB?.[1]) {
    const candidate = parseNameList(patternB[1])[0] || "";
    if (candidate) return candidate;
  }

  return "";
}

function extractAmount(segment) {
  const toNumbers = (text) =>
    [...String(text || "").matchAll(/(?:₹|rs\.?|inr|usd|\$|eur|€)?\s*([0-9]+(?:[.,][0-9]{1,2})?)(?!\s*%)/gi)]
      .map((match) => Number(String(match[1]).replace(",", ".")))
      .filter((num) => Number.isFinite(num) && num > 0);

  const amountZone = String(segment || "").split(/\b(?:paid by|split|among|between|with)\b/i)[0];
  const primary = toNumbers(amountZone);

  if (primary.length > 0) {
    return round2(primary[primary.length - 1]);
  }

  const fallback = toNumbers(segment);
  if (fallback.length === 0) return 0;

  return round2(fallback[0]);
}

function extractExpenseDate(segment) {
  const dateMatch = segment.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/);
  return normalizeDate(dateMatch?.[1] || "");
}

function extractTitle(segment) {
  const base = segment
    .replace(/^[\-\*\d\.)\s]+/, "")
    .replace(/(?:paid by|split|among|between|with).*/i, "")
    .replace(/\bfor\b\s*[0-9].*/i, "")
    .replace(/(?:₹|rs\.?|inr|usd|\$|eur|€)\s*[0-9].*/i, "")
    .replace(/\b\d+(?:[.,]\d{1,2})?\b/g, "")
    .trim();

  if (base) return titleCase(base);
  return "Unnamed Expense";
}

function heuristicPlanFromPrompt(prompt) {
  const text = String(prompt || "").trim();
  const warnings = [];

  const members = extractPeople(text);
  const segments = text
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);

  const expenses = [];

  for (const segment of segments) {
    if (!/[0-9]/.test(segment)) continue;

    const amount = extractAmount(segment);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const title = extractTitle(segment);
    const payerName = extractPayer(segment);
    const split = parseSplitMetadata(segment);

    let participantNames = split.participantNames;

    if (participantNames.length === 0 && members.length > 0) {
      participantNames = members.slice();
    }

    if (participantNames.length === 0 && payerName) {
      participantNames = [payerName];
    }

    expenses.push({
      title,
      amount,
      payerName: payerName || participantNames[0] || "",
      participantNames,
      splitMode: split.splitMode,
      splitConfig: split.splitConfig,
      category: inferCategory(title),
      expenseDate: extractExpenseDate(segment) || new Date().toISOString().slice(0, 10),
      notes: "Imported from AI prompt",
    });
  }

  const mergedMemberNames = new Set(members);
  for (const expense of expenses) {
    if (expense.payerName) mergedMemberNames.add(expense.payerName);
    for (const name of expense.participantNames) mergedMemberNames.add(name);

    if (expense.splitMode === "percent") {
      for (const name of Object.keys(expense.splitConfig?.percentages || {})) {
        mergedMemberNames.add(name);
      }
    }

    if (expense.splitMode === "shares") {
      for (const name of Object.keys(expense.splitConfig?.shares || {})) {
        mergedMemberNames.add(name);
      }
    }
  }

  const memberList = Array.from(mergedMemberNames)
    .map((name) => titleCase(name))
    .filter(Boolean)
    .map((name) => ({ name, email: "" }));

  if (memberList.length === 0) {
    warnings.push("No members detected automatically. Add names in prompt using: with Jan, Priya, Rahul.");
  }

  if (expenses.length === 0) {
    warnings.push("No expenses detected. Include lines like: Hotel 9000 paid by Jan split among Jan, Priya, Rahul.");
  }

  const confidenceBase = 0.3 + Math.min(0.35, memberList.length * 0.05) + Math.min(0.35, expenses.length * 0.08);
  const confidence = round2(Math.min(0.96, confidenceBase));

  return {
    summary: `Parsed ${memberList.length} members and ${expenses.length} expenses from your prompt.`,
    confidence,
    source: "heuristic",
    group: {
      name: extractGroupName(text),
      description: "Created from natural language plan",
      currency: inferCurrency(text),
    },
    members: memberList,
    expenses,
    warnings,
  };
}

function sanitizePlanShape(rawPlan, prompt) {
  if (!rawPlan || typeof rawPlan !== "object") {
    return heuristicPlanFromPrompt(prompt);
  }

  const heur = heuristicPlanFromPrompt(prompt);

  const groupName = String(rawPlan.group?.name || heur.group.name).trim() || heur.group.name;
  const currency = String(rawPlan.group?.currency || heur.group.currency || "INR").toUpperCase();
  const description = String(rawPlan.group?.description || heur.group.description || "").trim();

  const members = Array.isArray(rawPlan.members)
    ? rawPlan.members
        .map((entry) => ({
          name: titleCase(normalizeName(entry?.name || "")),
          email: String(entry?.email || "").trim(),
        }))
        .filter((entry) => entry.name)
    : heur.members;

  const expenses = Array.isArray(rawPlan.expenses)
    ? rawPlan.expenses
        .map((item) => {
          const splitMode = ["equal", "percent", "shares"].includes(item?.splitMode) ? item.splitMode : "equal";
          const participantNames = Array.isArray(item?.participantNames)
            ? item.participantNames.map((name) => titleCase(normalizeName(name))).filter(Boolean)
            : [];

          let splitConfig = null;

          if (splitMode === "percent") {
            const percentages = {};
            for (const [name, value] of Object.entries(item?.splitConfig?.percentages || {})) {
              const key = titleCase(normalizeName(name));
              const pct = Number(value);
              if (key && Number.isFinite(pct)) percentages[key] = round2(pct);
            }
            splitConfig = { percentages };
          }

          if (splitMode === "shares") {
            const shares = {};
            for (const [name, value] of Object.entries(item?.splitConfig?.shares || {})) {
              const key = titleCase(normalizeName(name));
              const share = Number(value);
              if (key && Number.isFinite(share)) shares[key] = round2(share);
            }
            splitConfig = { shares };
          }

          return {
            title: titleCase(String(item?.title || "").trim()) || "Unnamed Expense",
            amount: round2(Number(item?.amount || 0)),
            payerName: titleCase(normalizeName(item?.payerName || "")),
            participantNames,
            splitMode,
            splitConfig,
            category: inferCategory(item?.category || item?.title || ""),
            expenseDate: normalizeDate(item?.expenseDate) || new Date().toISOString().slice(0, 10),
            notes: String(item?.notes || "Imported from AI prompt").trim(),
          };
        })
        .filter((item) => item.amount > 0)
    : heur.expenses;

  const mergedWarnings = [
    ...(Array.isArray(rawPlan.warnings) ? rawPlan.warnings.map((item) => String(item || "").trim()).filter(Boolean) : []),
    ...heur.warnings,
  ];

  return {
    summary: String(rawPlan.summary || `Parsed ${members.length} members and ${expenses.length} expenses.`),
    confidence: Number.isFinite(Number(rawPlan.confidence)) ? round2(Number(rawPlan.confidence)) : heur.confidence,
    source: "openai",
    group: {
      name: groupName,
      description,
      currency: ["INR", "USD", "EUR"].includes(currency) ? currency : "INR",
    },
    members,
    expenses,
    warnings: Array.from(new Set(mergedWarnings)),
  };
}

async function parseWithOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["summary", "confidence", "group", "members", "expenses", "warnings"],
    properties: {
      summary: { type: "string" },
      confidence: { type: "number" },
      group: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "currency"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          currency: { type: "string" },
        },
      },
      members: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "email"],
          properties: {
            name: { type: "string" },
            email: { type: "string" },
          },
        },
      },
      expenses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "amount",
            "payerName",
            "participantNames",
            "splitMode",
            "splitConfig",
            "category",
            "expenseDate",
            "notes",
          ],
          properties: {
            title: { type: "string" },
            amount: { type: "number" },
            payerName: { type: "string" },
            participantNames: { type: "array", items: { type: "string" } },
            splitMode: { type: "string" },
            splitConfig: {
              anyOf: [
                { type: "null" },
                {
                  type: "object",
                  additionalProperties: true,
                },
              ],
            },
            category: { type: "string" },
            expenseDate: { type: "string" },
            notes: { type: "string" },
          },
        },
      },
      warnings: { type: "array", items: { type: "string" } },
    },
  };

  const systemInstruction =
    "Extract structured trip expense data from user prompt. Return only valid JSON that matches schema. Keep splitMode as equal/percent/shares. splitConfig should contain percentages or shares maps keyed by member names when needed.";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      input: [
        {
          role: "system",
          content: [{ type: "text", text: systemInstruction }],
        },
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "trip_expense_plan",
          schema,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.output_text;

  if (!rawText) {
    return null;
  }

  const parsed = JSON.parse(rawText);
  return sanitizePlanShape(parsed, prompt);
}

export async function buildPlanFromPrompt(prompt) {
  const text = String(prompt || "").trim();

  if (!text) {
    throw new Error("Prompt cannot be empty");
  }

  try {
    const openAIPlan = await parseWithOpenAI(text);
    if (openAIPlan) {
      return openAIPlan;
    }
  } catch {
    // Silent fallback to local parser.
  }

  return heuristicPlanFromPrompt(text);
}
