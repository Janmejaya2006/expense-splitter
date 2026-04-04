import UiRuntimeHost from "@/components/UiRuntimeHost";
import { requirePageSession } from "@/lib/requirePageSession";

export default async function AiAssistancePage() {
  await requirePageSession("/ai-assistance");
  return <UiRuntimeHost virtualPath="/ai-assistance" bootstrapPath="/dashboard" />;
}
