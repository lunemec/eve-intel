/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ControlsPanel } from "./ControlsPanel";

describe("ControlsPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("submits manual entry via form submit and Enter key", () => {
    const onManualEntryChange = vi.fn();
    const onManualEntrySubmit = vi.fn();

    render(
      <ControlsPanel
        manualEntry="Pilot A"
        onManualEntryChange={onManualEntryChange}
        onManualEntrySubmit={onManualEntrySubmit}
        onWipeCache={vi.fn()}
        debugEnabled={false}
        onDebugToggle={vi.fn()}
        isDesktopApp={false}
        updaterState={null}
        onRestartToUpdate={vi.fn()}
      />
    );

    fireEvent.submit(screen.getByRole("button", { name: "Submit" }).closest("form")!);
    fireEvent.keyDown(screen.getByPlaceholderText("Paste or type pilot names here..."), {
      key: "Enter",
      shiftKey: false
    });
    fireEvent.keyDown(screen.getByPlaceholderText("Paste or type pilot names here..."), {
      key: "Enter",
      shiftKey: true
    });

    expect(onManualEntrySubmit).toHaveBeenCalledTimes(2);
  });

  it("handles wipe-cache and debug toggle interactions", () => {
    const onWipeCache = vi.fn();
    const onDebugToggle = vi.fn();

    render(
      <ControlsPanel
        manualEntry=""
        onManualEntryChange={vi.fn()}
        onManualEntrySubmit={vi.fn()}
        onWipeCache={onWipeCache}
        debugEnabled={true}
        onDebugToggle={onDebugToggle}
        isDesktopApp={false}
        updaterState={null}
        onRestartToUpdate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Wipe Cache" }));
    fireEvent.click(screen.getByRole("checkbox"));

    expect(onWipeCache).toHaveBeenCalledTimes(1);
    expect(onDebugToggle).toHaveBeenCalled();
  });

  it("shows restart button only for desktop downloaded state", () => {
    const onRestartToUpdate = vi.fn();
    const { rerender } = render(
      <ControlsPanel
        manualEntry=""
        onManualEntryChange={vi.fn()}
        onManualEntrySubmit={vi.fn()}
        onWipeCache={vi.fn()}
        debugEnabled={false}
        onDebugToggle={vi.fn()}
        isDesktopApp={true}
        updaterState={{
          status: "downloaded",
          version: "1.0.0",
          availableVersion: "1.2.3",
          downloadedVersion: "1.2.3",
          progress: 100,
          error: null,
          errorDetails: null
        }}
        onRestartToUpdate={onRestartToUpdate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Restart to Update" }));
    expect(onRestartToUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Updates:/i)).toBeTruthy();

    rerender(
      <ControlsPanel
        manualEntry=""
        onManualEntryChange={vi.fn()}
        onManualEntrySubmit={vi.fn()}
        onWipeCache={vi.fn()}
        debugEnabled={false}
        onDebugToggle={vi.fn()}
        isDesktopApp={true}
        updaterState={{
          status: "checking",
          version: "1.0.0",
          availableVersion: null,
          downloadedVersion: null,
          progress: 0,
          error: null,
          errorDetails: null
        }}
        onRestartToUpdate={onRestartToUpdate}
      />
    );

    expect(screen.queryByRole("button", { name: "Restart to Update" })).toBeNull();
  });
});
