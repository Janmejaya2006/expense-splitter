import UiRuntimeHost from "@/components/UiRuntimeHost";
import { requirePageSession } from "@/lib/requirePageSession";

export default async function DashboardPage() {
  await requirePageSession("/dashboard");
  return <UiRuntimeHost />;
}
