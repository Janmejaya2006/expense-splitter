import UiRuntimeHost from "@/components/UiRuntimeHost";
import { requirePageSession } from "@/lib/requirePageSession";

export default async function ExpensesPage() {
  await requirePageSession("/expenses");
  return <UiRuntimeHost />;
}
