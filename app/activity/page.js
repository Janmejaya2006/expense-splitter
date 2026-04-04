import UiRuntimeHost from "@/components/UiRuntimeHost";
import { requirePageSession } from "@/lib/requirePageSession";

export default async function ActivityPage() {
  await requirePageSession("/activity");
  return <UiRuntimeHost />;
}
