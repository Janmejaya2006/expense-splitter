import VerifyEmailCard from "@/components/VerifyEmailCard";

export const metadata = {
  title: "Verify Email | Expense Split",
};

export default async function VerifyEmailPage({ params }) {
  const resolved = await params;
  const token = String(resolved?.token || "").trim();
  return <VerifyEmailCard token={token} />;
}
