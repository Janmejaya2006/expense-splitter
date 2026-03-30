import InviteAcceptCard from "@/components/InviteAcceptCard";

export default async function InvitePage({ params }) {
  const resolved = await params;
  const token = String(resolved?.token || "");

  return <InviteAcceptCard token={token} />;
}
