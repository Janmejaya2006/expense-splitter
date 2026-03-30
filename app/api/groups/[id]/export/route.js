import { NextResponse } from "next/server";
import { buildGroupSummary, groupBundle, readDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { canAccessGroup } from "@/lib/access";
import { parseRouteParams, parseWithSchema, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const groupParamsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid group id"),
});

const exportQuerySchema = z.object({
  format: z.enum(["csv", "pdf"]).optional().default("csv"),
  month: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((value) => !value || /^\d{4}-\d{2}$/.test(value), "month must be in YYYY-MM format"),
});

async function resolveGroupId(paramsPromise) {
  const params = await parseRouteParams(paramsPromise, groupParamsSchema);
  return Number(params.id);
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (!/[,"\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLine(values) {
  return values.map((value) => escapeCsv(value)).join(",");
}

function buildCsv(group) {
  const lines = [];
  const now = new Date().toISOString();

  lines.push(csvLine(["Report", "Expense Split Export"]));
  lines.push(csvLine(["Generated At", now]));
  lines.push(csvLine(["Group", group.name]));
  lines.push(csvLine(["Description", group.description || ""]));
  lines.push(csvLine(["Currency", group.currency || "INR"]));
  lines.push("");

  lines.push(csvLine(["Members"]));
  lines.push(csvLine(["Member ID", "Name", "Email", "Phone"]));
  for (const member of group.members || []) {
    lines.push(csvLine([member.id, member.name, member.email || "", member.phone || ""]));
  }
  lines.push("");

  lines.push(csvLine(["Expenses"]));
  lines.push(
    csvLine([
      "Expense ID",
      "Title",
      "Amount",
      "Category",
      "Date",
      "Payer Member ID",
      "Participants",
      "Split Mode",
      "Notes",
      "Created At",
    ])
  );
  for (const expense of group.expenses || []) {
    lines.push(
      csvLine([
        expense.id,
        expense.title,
        expense.amount,
        expense.category || "",
        expense.expenseDate || "",
        expense.payerMemberId,
        (expense.participants || []).join("|"),
        expense.splitMode || "equal",
        expense.notes || "",
        expense.createdAt || "",
      ])
    );
  }
  lines.push("");

  lines.push(csvLine(["Balances"]));
  lines.push(csvLine(["Member ID", "Name", "Paid", "Owes", "Net"]));
  for (const balance of group.summary?.balances || []) {
    lines.push(csvLine([balance.memberId, balance.name, balance.paid, balance.owes, balance.net]));
  }
  lines.push("");

  lines.push(csvLine(["Suggested Settlements"]));
  lines.push(csvLine(["From Member ID", "From Name", "To Member ID", "To Name", "Amount"]));
  for (const settlement of group.summary?.settlements || []) {
    lines.push(
      csvLine([
        settlement.fromMemberId,
        settlement.fromName,
        settlement.toMemberId,
        settlement.toName,
        settlement.amount,
      ])
    );
  }
  lines.push("");

  lines.push(csvLine(["Settlement Payments"]));
  lines.push(
    csvLine([
      "Payment ID",
      "From Member ID",
      "From Name",
      "To Member ID",
      "To Name",
      "Amount",
      "Status",
      "Note",
      "Created At",
    ])
  );
  for (const payment of group.settlementPayments || []) {
    lines.push(
      csvLine([
        payment.id,
        payment.fromMemberId,
        payment.fromName || "",
        payment.toMemberId,
        payment.toName || "",
        payment.amount,
        payment.status || "",
        payment.note || "",
        payment.createdAt || "",
      ])
    );
  }

  return lines.join("\n");
}

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildSimplePdf(lines, extraOps = []) {
  const contentLines = ["BT", "/F1 11 Tf", "40 800 Td", "14 TL"];
  for (let i = 0; i < lines.length; i += 1) {
    const text = escapePdfText(lines[i]);
    contentLines.push(`(${text}) Tj`);
    if (i < lines.length - 1) {
      contentLines.push("T*");
    }
  }
  contentLines.push("ET");
  contentLines.push(...extraOps);

  const stream = contentLines.join("\n");

  const objects = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n");
  objects.push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function buildCategoryChartOps(categoryBreakdown = [], currency = "INR") {
  const data = (categoryBreakdown || [])
    .map((item) => ({
      category: String(item.category || "Misc"),
      amount: Number(item.amount || 0),
    }))
    .filter((item) => item.amount > 0)
    .slice(0, 6);

  if (!data.length) return [];

  const palette = [
    [0.01, 0.52, 0.78],
    [0.06, 0.46, 0.43],
    [0.98, 0.45, 0.1],
    [0.1, 0.64, 0.29],
    [0.93, 0.69, 0.13],
    [0.9, 0.26, 0.21],
  ];

  const x = 40;
  const y = 300;
  const width = 510;
  const height = 180;
  const maxAmount = Math.max(...data.map((item) => item.amount), 1);
  const slot = width / data.length;
  const ops = [];

  ops.push("0.96 0.98 1 rg");
  ops.push(`${x} ${y - 24} ${width} ${height + 44} re f`);
  ops.push("0.13 0.13 0.13 RG");
  ops.push("0.8 w");
  ops.push(`${x} ${y} m ${x} ${y + height} l S`);
  ops.push(`${x} ${y} m ${x + width} ${y} l S`);
  ops.push("BT");
  ops.push("/F1 10 Tf");
  ops.push(`${x} ${y + height + 20} Td`);
  ops.push(`(Category Spending Chart (${escapePdfText(currency || "INR")})) Tj`);
  ops.push("ET");

  data.forEach((item, index) => {
    const [r, g, b] = palette[index % palette.length];
    const barWidth = slot * 0.56;
    const barHeight = ((height - 20) * item.amount) / maxAmount;
    const barX = x + index * slot + slot * 0.22;
    const barY = y;
    const label = item.category.slice(0, 12);
    const amountLabel = Number(item.amount).toFixed(0);

    ops.push(`${r} ${g} ${b} rg`);
    ops.push(`${barX.toFixed(2)} ${barY.toFixed(2)} ${barWidth.toFixed(2)} ${barHeight.toFixed(2)} re f`);

    ops.push("BT");
    ops.push("/F1 7 Tf");
    ops.push(`${(barX - 2).toFixed(2)} ${(y - 12).toFixed(2)} Td`);
    ops.push(`(${escapePdfText(label)}) Tj`);
    ops.push("ET");

    ops.push("BT");
    ops.push("/F1 7 Tf");
    ops.push(`${(barX + 1).toFixed(2)} ${(barY + barHeight + 4).toFixed(2)} Td`);
    ops.push(`(${escapePdfText(amountLabel)}) Tj`);
    ops.push("ET");
  });

  return ops;
}

function buildPdf(group, monthLabel) {
  const lines = [];
  lines.push("Expense Split Statement");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Group: ${group.name}`);
  lines.push(`Currency: ${group.currency}`);
  lines.push(`Period: ${monthLabel || "All time"}`);
  lines.push("");
  lines.push(`Total Spent: ${group.summary?.totalSpent || 0}`);
  lines.push(`Expenses: ${group.summary?.expenseCount || 0}`);
  lines.push(`Pending Settlements: ${(group.summary?.settlements || []).length}`);
  lines.push(`Settled Amount: ${group.summary?.settledAmount || 0}`);
  lines.push("");
  lines.push("Member Balances:");
  for (const balance of (group.summary?.balances || []).slice(0, 6)) {
    lines.push(`- ${balance.name}: paid ${balance.paid}, owes ${balance.owes}, net ${balance.net}`);
  }
  lines.push("");
  lines.push("Recent Expenses (top 8):");
  for (const expense of (group.expenses || []).slice(0, 8)) {
    lines.push(`- ${expense.expenseDate || "-"} | ${expense.title} | ${expense.amount} | ${expense.category || "Misc"}`);
  }
  lines.push("");
  lines.push("Chart section below summarizes category-wise spending.");

  const chartOps = buildCategoryChartOps(group.summary?.categoryBreakdown || [], group.currency || "INR");
  return buildSimplePdf(lines, chartOps);
}

function monthValue(dateLike) {
  const value = String(dateLike || "").trim();
  if (!value) return "";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const d = new Date(time);
  const month = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}`;
}

function buildFilteredGroupBundle(group, month) {
  if (!month) return group;

  const expenses = (group.expenses || []).filter((item) => monthValue(item.expenseDate || item.createdAt) === month);
  const settlementPayments = (group.settlementPayments || []).filter(
    (item) => monthValue(item.createdAt) === month
  );
  const summary = buildGroupSummary(group, group.members || [], expenses, settlementPayments);

  return {
    ...group,
    expenses,
    settlementPayments,
    summary,
  };
}

function safeFileName(value) {
  return String(value || "group-export")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function GET(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const groupId = await resolveGroupId(params);
    if (!Number.isFinite(groupId)) {
      return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
    }

    const db = await readDB();
    if (!canAccessGroup(db, groupId, session)) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const group = groupBundle(db, groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const query = parseWithSchema(
      exportQuerySchema,
      {
        format: searchParams.get("format") || undefined,
        month: searchParams.get("month") || undefined,
      },
      { message: "Invalid export query parameters" }
    );
    const format = query.format;
    const monthFilter = query.month;
    const filteredGroup = buildFilteredGroupBundle(group, monthFilter);

    if (format === "pdf") {
      const pdf = buildPdf(filteredGroup, monthFilter);
      const fileName = `${safeFileName(group.name) || "group-export"}-${group.id}${monthFilter ? `-${monthFilter}` : ""}.pdf`;
      return new NextResponse(pdf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }

    const csv = buildCsv(filteredGroup);
    const fileName = `${safeFileName(group.name) || "group-export"}-${group.id}${monthFilter ? `-${monthFilter}` : ""}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to export group report" }, { status: 500 });
  }
}
