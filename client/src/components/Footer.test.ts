/** The band under every screen: the notices a visitor is owed, and the way to the code. */

import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";

import Footer from "./Footer.svelte";

beforeEach(() => {
  localStorage.clear();
});

describe("Footer", () => {
  it("says what is counted and that no cookies are used", () => {
    render(Footer);
    expect(
      screen.getByText("We count games and rounds per day. No cookies, no personal data."),
    ).toBeTruthy();
  });

  it("shows the GitHub mark beside the link to the code", () => {
    render(Footer);
    const link = screen.getByRole("link", { name: "Source on GitHub" });
    expect(link.querySelector("svg")).not.toBeNull();
  });

  it("links the credits page in a new tab", () => {
    render(Footer);
    const link = screen.getByRole("link", { name: "Credits" });
    expect(link.getAttribute("href")).toBe("/credits");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
