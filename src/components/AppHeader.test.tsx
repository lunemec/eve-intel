/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppHeader } from "./AppHeader";

describe("AppHeader", () => {
  it("renders app title and donation link", () => {
    render(<AppHeader />);

    expect(screen.getByText("EVE Intel Browser")).toBeTruthy();
    const donateLink = screen.getByRole("link", { name: "Lukas Nemec" });
    expect(donateLink.getAttribute("href")).toBe("https://zkillboard.com/character/93227004/");
  });
});
