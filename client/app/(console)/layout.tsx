import { Suspense } from "react";
import { AppShell } from "@/components/control/app-shell";

export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
