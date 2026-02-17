/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDogmaIndex } from "./useDogmaIndex";
import { buildDogmaIndex } from "./dogma/index";
import { loadDogmaData } from "./dogma/loader";

vi.mock("./dogma/loader", () => ({
  loadDogmaData: vi.fn()
}));

vi.mock("./dogma/index", () => ({
  buildDogmaIndex: vi.fn()
}));

function Harness(props: { logDebug: (message: string, data?: unknown) => void }) {
  const state = useDogmaIndex({ logDebug: props.logDebug });
  return (
    <div
      data-testid="state"
      data-has-index={state.dogmaIndex ? "yes" : "no"}
      data-version={state.dogmaVersion}
      data-error={state.dogmaLoadError}
    />
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useDogmaIndex", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads and indexes dogma payload, then logs success", async () => {
    vi.mocked(loadDogmaData).mockResolvedValueOnce({
      manifest: { activeVersion: "2026-02-17" },
      pack: { typeCount: 12345 }
    } as never);
    vi.mocked(buildDogmaIndex).mockReturnValueOnce({} as never);
    const logDebug = vi.fn();

    render(<Harness logDebug={logDebug} />);

    await waitFor(() => {
      expect(screen.getByTestId("state").getAttribute("data-has-index")).toBe("yes");
    });
    expect(screen.getByTestId("state").getAttribute("data-version")).toBe("2026-02-17");
    expect(screen.getByTestId("state").getAttribute("data-error")).toBe("");
    expect(logDebug).toHaveBeenCalledWith("Dogma pack loaded", {
      version: "2026-02-17",
      typeCount: 12345
    });
  });

  it("stores loader errors and logs failure", async () => {
    vi.mocked(loadDogmaData).mockRejectedValueOnce(new Error("manifest fetch failed"));
    const logDebug = vi.fn();

    render(<Harness logDebug={logDebug} />);

    await waitFor(() => {
      expect(screen.getByTestId("state").getAttribute("data-error")).toBe("manifest fetch failed");
    });
    expect(screen.getByTestId("state").getAttribute("data-has-index")).toBe("no");
    expect(screen.getByTestId("state").getAttribute("data-version")).toBe("");
    expect(logDebug).toHaveBeenCalledWith("Dogma loader failed", { error: "manifest fetch failed" });
  });

  it("ignores async completion after unmount", async () => {
    const pending = deferred<{ manifest: { activeVersion: string }; pack: { typeCount: number } }>();
    vi.mocked(loadDogmaData).mockReturnValueOnce(pending.promise as never);
    vi.mocked(buildDogmaIndex).mockReturnValue({} as never);
    const logDebug = vi.fn();

    const { unmount } = render(<Harness logDebug={logDebug} />);
    unmount();

    pending.resolve({
      manifest: { activeVersion: "late-version" },
      pack: { typeCount: 1 }
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(buildDogmaIndex).not.toHaveBeenCalled();
    expect(logDebug).not.toHaveBeenCalled();
  });
});
