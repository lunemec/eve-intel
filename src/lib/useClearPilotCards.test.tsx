/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PilotCard } from "./pilotDomain";
import { useClearPilotCards } from "./useClearPilotCards";

describe("useClearPilotCards", () => {
  it("clears pilot cards by dispatching an empty array", () => {
    const setPilotCards = vi.fn() as React.Dispatch<React.SetStateAction<PilotCard[]>>;
    const { result } = renderHook(() => useClearPilotCards({ setPilotCards }));

    act(() => {
      result.current();
    });

    expect(setPilotCards).toHaveBeenCalledTimes(1);
    expect(setPilotCards).toHaveBeenCalledWith([]);
  });
});
