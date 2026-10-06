/** The band under every screen: the notices a visitor is owed. */

import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import Footer from "./Footer.svelte";

describe("Footer", () => {
  it("says what is counted and that no cookies are used", () => {
    render(Footer);
    expect(
      screen.getByText("We count games and rounds per day. No cookies, no personal data."),
    ).toBeTruthy();
  });
});
