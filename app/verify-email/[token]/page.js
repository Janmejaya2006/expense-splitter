// app/verify-email/page.js  — REPLACE the whole file with this
import VerifyEmailCard from "@/components/VerifyEmailCard";

export const metadata = { title: "Verify Email | Expense Split" };

export default function VerifyEmailPage({ searchParams }) {
  const token = searchParams?.token ?? "";
  return <VerifyEmailCard token={token} />;
}