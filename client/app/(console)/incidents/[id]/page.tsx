import { Suspense } from "react";
import { IncidentView } from "@/components/console/incident-view";

export default function IncidentPage({ params }: PageProps<"/incidents/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading incident…</p>}>
      <IncidentView params={params} />
    </Suspense>
  );
}
