import { cn } from "@/lib/utils";

/** Unified diff with per-line colouring. */
export function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="border-border overflow-x-auto rounded-lg border bg-black/40 py-3 font-mono text-sm leading-6">
      {diff.split("\n").map((line, i) => {
        const add = line.startsWith("+") && !line.startsWith("+++");
        const del = line.startsWith("-") && !line.startsWith("---");
        const meta = line.startsWith("@@") || line.startsWith("+++") || line.startsWith("---");
        return (
          <div
            key={i}
            className={cn(
              "px-4 whitespace-pre",
              add && "bg-healthy/10 text-healthy",
              del && "bg-infected/10 text-infected",
              meta && "text-muted-foreground",
            )}
          >
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}
