import { Suspense } from "react";
import { ConsoleNav, NavBar } from "@/components/console/nav";

export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense fallback={<NavBar />}>
        <ConsoleNav />
      </Suspense>
      <main className="mx-auto w-full max-w-[1800px] flex-1 px-6 py-8 text-base">{children}</main>
    </>
  );
}
