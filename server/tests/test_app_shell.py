"""The parts of the shell that are stylesheet, not behaviour.

What the bar does is ``App.test.ts`` and ``TopBar.test.ts``. What is left has no layout
in jsdom to measure: the 56px sticky measurement in one place, and a single breakpoint
that hides the wordmark and GitHub and nothing else.

What a browser confirmed, and a test cannot: at 320px the bar is exactly 56px and
leaves ``scrollWidth == clientWidth`` on Home, Create, Join, the lobby, a question, a
reveal and the final standings; an input sitting under the bar scrolls clear of it; a
12-character name ellipsises beside sound and theme without running over the sign.
"""

import re

from tests.client_source import CLIENT_SRC, read

APP_CSS = CLIENT_SRC / "app.css"
TOP_BAR = CLIENT_SRC / "components" / "TopBar.svelte"

# Section 4: the wordmark hides at one width, and it is this one.
BREAKPOINT = "26rem"


def block_after(text: str, opening: str) -> str:
    """The braced block that follows ``opening``, nested braces included."""
    start = text.index(opening) + len(opening)
    brace = text.index("{", start)
    depth = 0
    for index in range(brace, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return text[brace + 1 : index]
    raise AssertionError(f"unclosed block after {opening!r}")


# --- 56px, sticky, and out of the way ------------------------------------------------


def test_the_height_is_a_token_and_the_bar_is_sticky() -> None:
    css, bar = read(APP_CSS), read(TOP_BAR)
    assert re.search(r"--topbar-height:\s*56px", css)
    assert "height: var(--topbar-height)" in bar
    assert "position: sticky" in bar
    assert re.search(r"position: sticky;\s*top: 0;", bar)


def test_a_sticky_bar_does_not_sit_on_what_the_browser_scrolls_to() -> None:
    """The mobile-keyboard case: scrolling to a focused field has to clear the bar."""
    css = read(APP_CSS)
    assert re.search(r"scroll-padding-top:\s*calc\(var\(--topbar-height\)", css)


# --- one breakpoint, and the sign never goes -----------------------------------------


def test_the_bar_has_one_breakpoint_and_it_is_stylesheet_only() -> None:
    """Nothing is rendered differently on a phone, so the script needs no media query."""
    bar = read(TOP_BAR)
    assert "matchMedia" not in bar
    assert f"@media (max-width: {BREAKPOINT})" in bar
    widths = set(re.findall(r"\(max-width:\s*([\w.]+)\)", bar))
    assert widths == {BREAKPOINT}, f"more than one breakpoint in the bar: {widths}"


def test_the_wordmark_and_github_give_way_and_nothing_else_does() -> None:
    """Section 5: under 26rem the wordmark and GitHub hide; sign, name, sound and theme stay."""
    narrow = block_after(read(TOP_BAR), f"@media (max-width: {BREAKPOINT})")
    rules = re.findall(r"([^{}]+)\{[^{}]*display: none", narrow)
    hidden = sorted(selector.strip() for rule in rules for selector in rule.split(","))
    assert hidden == [".controls .github", ".wordmark"], f"hidden under {BREAKPOINT}: {hidden}"


# --- the name, at every width -------------------------------------------------------


def test_the_name_is_shown_at_every_width() -> None:
    """Section 5: the name ellipsises on a phone; it never drops to just the head."""
    chip = read(CLIENT_SRC / "components" / "SettingsMenu.svelte")
    assert "narrow" not in chip, "the control still changes shape with the bar's width"
    assert '<span class="chip-name">' in chip
    # And the bar tells the slot nothing about its width.
    assert re.search(r"^\s*menu\?: Snippet$", read(TOP_BAR), re.MULTILINE)
