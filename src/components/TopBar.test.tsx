/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";

describe("TopBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders desktop controls and dispatches callbacks", () => {
    const onMinimize = vi.fn();
    const onToggleMaximize = vi.fn();
    const onClose = vi.fn();

    render(
      <TopBar
        isDesktopApp={true}
        isWindowMaximized={false}
        showGlobalLoad={true}
        globalLoadProgress={0.42}
        onMinimize={onMinimize}
        onToggleMaximize={onToggleMaximize}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Minimize", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "Maximize", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "Close", hidden: true }));

    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".global-load-line.active")).toBeTruthy();
    expect(document.querySelector(".global-load-fill")?.getAttribute("style")).toContain("42%");
  });

  it("hides desktop chrome when not running as desktop app", () => {
    render(
      <TopBar
        isDesktopApp={false}
        isWindowMaximized={false}
        showGlobalLoad={false}
        globalLoadProgress={0}
        onMinimize={vi.fn()}
        onToggleMaximize={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Minimize", hidden: true })).toBeNull();
    expect(document.querySelector(".global-load-line")).toBeNull();
  });
});
