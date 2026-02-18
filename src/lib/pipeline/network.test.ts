import { describe, expect, it, vi } from "vitest";
import { createRetryNoticeHandler } from "./network";

describe("pipeline/network", () => {
  it("sets formatted retry notice for a given scope", () => {
    const setNetworkNotice = vi.fn();
    const onRetry = createRetryNoticeHandler(setNetworkNotice);

    onRetry("ESI IDs")({ status: 420, attempt: 3, delayMs: 2500 });

    expect(setNetworkNotice).toHaveBeenCalledWith(
      "ESI IDs: rate-limited/retryable response (420), retry 3 in 2500ms"
    );
  });
});
