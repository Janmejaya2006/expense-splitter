import ResetPasswordForm from "@/components/ResetPasswordForm";

export default async function ResetPasswordPage({ params }) {
  const resolved = await params;
  const token = String(resolved?.token || "");

  return <ResetPasswordForm token={token} />;
}
