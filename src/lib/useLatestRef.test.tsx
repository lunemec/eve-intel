/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLatestRef } from "./useLatestRef";

describe("useLatestRef", () => {
  it("keeps ref identity stable while updating current value", () => {
    const first = () => "first";
    const second = () => "second";

    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: first }
    });

    const firstRef = result.current;
    expect(firstRef.current).toBe(first);

    rerender({ value: second });

    expect(result.current).toBe(firstRef);
    expect(result.current.current).toBe(second);
  });
});
