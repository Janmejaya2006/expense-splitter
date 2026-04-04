import UiRuntimeHost from "@/components/UiRuntimeHost";
import { requirePageSession } from "@/lib/requirePageSession";

export default async function GroupsPage() {
  await requirePageSession("/groups");
  return <UiRuntimeHost />;
}
