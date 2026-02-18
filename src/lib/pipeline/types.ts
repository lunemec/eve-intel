import type { PilotCard } from "../usePilotIntelPipeline";
import type { ParsedPilotInput } from "../../types";
import type { ZkillKillmail } from "../api/zkill";

export type RetryInfo = {
  status: number;
  attempt: number;
  delayMs: number;
};

export type RetryNoticeHandler = (info: RetryInfo) => void;

export type RetryBuilder = (scope: string) => RetryNoticeHandler;

export type DebugLogger = (message: string, data?: unknown) => void;

export type ErrorLogger = (message: string, error: unknown) => void;

export type DebugLoggerRef = { current: DebugLogger };

export type CancelCheck = () => boolean;

export type PilotCardUpdater = (pilotName: string, patch: Partial<PilotCard>) => void;

export type PipelineSignal = AbortSignal | undefined;

export type ProcessPilotFn = (
  entry: ParsedPilotInput,
  characterId: number,
  onRetry: RetryBuilder
) => Promise<void>;

export type PilotProcessedSnapshot = {
  version: number;
  pilotKey: string;
  characterId: number;
  lookbackDays: number;
  baseRow: Pick<
    PilotCard,
    "status" |
    "fetchPhase" |
    "characterId" |
    "characterName" |
    "corporationId" |
    "corporationName" |
    "allianceId" |
    "allianceName" |
    "securityStatus" |
    "stats"
  >;
  inferenceKills: ZkillKillmail[];
  inferenceLosses: ZkillKillmail[];
  predictedShips: PilotCard["predictedShips"];
  fitCandidates: PilotCard["fitCandidates"];
  cynoRisk: PilotCard["cynoRisk"];
  sourceSignature: string;
  savedAt: number;
};
