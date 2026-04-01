import { buildRetryNotice } from "./stages";

const NETWORK_NOTICE_AUTO_CLEAR_MS = 5_000;

export function createRetryNoticeHandler(
  setNetworkNotice: React.Dispatch<React.SetStateAction<string>>
): (scope: string) => (info: { status: number; attempt: number; delayMs: number }) => void {
  let clearTimer: ReturnType<typeof setTimeout> | undefined;
  return (scope: string) => (info: { status: number; attempt: number; delayMs: number }) => {
    if (clearTimer !== undefined) {
      clearTimeout(clearTimer);
    }
    setNetworkNotice(buildRetryNotice(scope, info));
    clearTimer = setTimeout(() => {
      setNetworkNotice("");
      clearTimer = undefined;
    }, NETWORK_NOTICE_AUTO_CLEAR_MS);
  };
}
