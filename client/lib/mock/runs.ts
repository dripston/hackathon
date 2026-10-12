import samples from "./samples/detection_runs.json";
import type { ScoredRun } from "@/lib/types";
export const mockRuns = (): ScoredRun[] => structuredClone(samples as ScoredRun[]);
