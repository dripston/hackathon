import { Suspense } from "react";
import { IncidentLive } from "@/components/control/incident-live";

export default function IncidentPage({ params }: PageProps<"/incidents/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading incident…</p>}>
      <IncidentLive params={params} />
    </Suspense>
  );
}
