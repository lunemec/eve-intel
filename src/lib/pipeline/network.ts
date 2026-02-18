import { buildRetryNotice } from "./stages";

export function createRetryNoticeHandler(
  setNetworkNotice: React.Dispatch<React.SetStateAction<string>>
): (scope: string) => (info: { status: number; attempt: number; delayMs: number }) => void {
  return (scope: string) => (info: { status: number; attempt: number; delayMs: number }) => {
    setNetworkNotice(buildRetryNotice(scope, info));
  };
}
