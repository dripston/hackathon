import { Suspense } from "react";
import { ControlBar } from "@/components/control/control-bar";

export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense fallback={<div className="border-border h-14 border-b" />}>
        <ControlBar />
      </Suspense>
      <main className="monitor-grid mx-auto w-full max-w-[1800px] flex-1 px-6 py-6 text-base">{children}</main>
    </>
  );
}
