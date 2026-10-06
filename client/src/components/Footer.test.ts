/** The band under every screen: the notices a visitor is owed, and the way to the code. */

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Footer from "./Footer.svelte";

const navigate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Footer", () => {
  it("says what is counted and that no cookies are used", () => {
    render(Footer, { navigate });
    expect(
      screen.getByText("We count games and rounds per day. No cookies, no personal data."),
    ).toBeTruthy();
  });

  it("shows the GitHub mark beside the link to the code", () => {
    render(Footer, { navigate });
    const link = screen.getByRole("link", { name: "Source on GitHub" });
    expect(link.querySelector("svg")).not.toBeNull();
  });

  it("offers Admin only to a browser that holds the admin token", async () => {
    render(Footer, { navigate });
    expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
    cleanup();

    localStorage.setItem("jbi:admin", "0123456789abcdef0123456789abcdef");
    render(Footer, { navigate });
    await fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    expect(navigate).toHaveBeenCalledWith("/admin");
  });
});
