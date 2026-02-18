/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../types";
import { usePersistedSettings } from "./usePersistedSettings";
import { persistDebugEnabled, persistSettings } from "./settings";

vi.mock("./settings", async () => {
  const actual = await vi.importActual<typeof import("./settings")>("./settings");
  return {
    ...actual,
    persistSettings: vi.fn(),
    persistDebugEnabled: vi.fn()
  };
});

function Harness(props: { settings: Settings; debugEnabled: boolean }) {
  usePersistedSettings({ settings: props.settings, debugEnabled: props.debugEnabled });
  return null;
}

describe("usePersistedSettings", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("persists settings and debug flag on mount", () => {
    render(<Harness settings={{ lookbackDays: 7 }} debugEnabled={false} />);

    expect(persistSettings).toHaveBeenCalledWith(localStorage, { lookbackDays: 7 });
    expect(persistDebugEnabled).toHaveBeenCalledWith(localStorage, false);
  });

  it("persists updates when settings/debug values change", () => {
    const { rerender } = render(<Harness settings={{ lookbackDays: 7 }} debugEnabled={false} />);

    rerender(<Harness settings={{ lookbackDays: 3 }} debugEnabled={true} />);

    expect(persistSettings).toHaveBeenLastCalledWith(localStorage, { lookbackDays: 3 });
    expect(persistDebugEnabled).toHaveBeenLastCalledWith(localStorage, true);
  });
});
