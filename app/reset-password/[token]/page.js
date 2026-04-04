// app/reset-password/page.js — REPLACE with:
import ResetPasswordForm from "@/components/ResetPasswordForm";

export default function ResetPasswordPage({ searchParams }) {
  const token = searchParams?.token ?? "";
  return <ResetPasswordForm token={token} />;
}