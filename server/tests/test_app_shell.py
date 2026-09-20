"""D2 Accept: the shell is above every screen, and no screen is titled twice.

There is no browser in this suite, so what a test can hold is the shape the criteria are
made of: one ``<TopBar>`` outside the router rather than one per screen, the room code in
the bar and nowhere else, the 56px sticky measurement in one place, and a single
breakpoint that the script and the stylesheet agree on. The same approach as
``test_check_contrast.py``, which reads the stylesheet rather than rendering it.

What a browser confirmed, and a test here cannot: at 320px the bar is exactly 56px, holds
a full ``ABYSSALDEMON``, and leaves ``scrollWidth == clientWidth`` on Home, Join, the
lobby, a question and a reveal; an input sitting under the bar scrolls clear of it.
"""

import re
from pathlib import Path

from app.config import REPO_ROOT

CLIENT_SRC = REPO_ROOT / "client" / "src"
APP_CSS = CLIENT_SRC / "app.css"
APP_SVELTE = CLIENT_SRC / "App.svelte"
TOP_BAR = CLIENT_SRC / "components" / "TopBar.svelte"

# Section 4: the bar collapses at one width, and it is this one.
BREAKPOINT = "26rem"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


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


# --- one bar, above everything -------------------------------------------------------


def test_the_bar_is_rendered_once_and_outside_the_router() -> None:
    """A bar per screen is four bars to keep in step; this one is the shell."""
    app = read(APP_SVELTE)
    assert app.count("<TopBar") == 1
    assert app.index("<TopBar") < app.index("<main")
    # Every route is drawn inside <main>, so a bar before it is a bar on Home, Create,
    # Join and Room without any of them knowing about it.
    assert app.index("<TopBar") < app.index("{#if route.name")


def test_the_room_code_reaches_the_bar() -> None:
    """Join as well as Room: the screen no longer says which room this is."""
    app = read(APP_SVELTE)
    assert re.search(r"<TopBar code=\{roomCode\}", app)
    assert re.search(
        r"roomCode = \$derived\(\s*route\.name === 'join' \|\| route\.name === 'room'", app
    )


def test_no_screen_still_titles_itself_with_the_room_code() -> None:
    """The `<h1>Room {code}</h1>` section 4 retires, in any of its spellings."""
    offenders = [
        f"{path.relative_to(REPO_ROOT)}: {match.strip()}"
        for path in sorted((CLIENT_SRC / "routes").rglob("*.svelte"))
        for match in re.findall(r"<h1>(.*?)</h1>", read(path), re.DOTALL)
        if "Room {" in match
    ]
    assert offenders == [], "the code lives in the top bar now: " + "; ".join(offenders)


def test_the_front_page_does_not_repeat_the_wordmark() -> None:
    """The inn's name is in the bar on every screen, Home included."""
    home = re.findall(r"<h1>(.*?)</h1>", read(CLIENT_SRC / "routes" / "Home.svelte"))
    assert home, "Home has no heading at all"
    assert not any("Jolly Boar Inn" in heading for heading in home)


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


def test_the_bar_cannot_be_tabbed_through_on_every_screen() -> None:
    """Three or four controls in front of every screen, so there is a way past them."""
    assert 'href="#content"' in read(TOP_BAR)
    assert 'id="content"' in read(APP_SVELTE)


# --- one breakpoint, and the sign never goes -----------------------------------------


def test_the_script_and_the_stylesheet_collapse_at_the_same_width() -> None:
    bar = read(TOP_BAR)
    assert f"const NARROW = '(max-width: {BREAKPOINT})'" in bar
    assert f"@media (max-width: {BREAKPOINT})" in bar
    widths = set(re.findall(r"\(max-width:\s*([\w.]+)\)", bar))
    assert widths == {BREAKPOINT}, f"more than one breakpoint in the bar: {widths}"


def test_the_wordmark_gives_way_and_the_sign_does_not() -> None:
    narrow = block_after(read(TOP_BAR), f"@media (max-width: {BREAKPOINT})")
    assert re.search(r"\.site,\s*\n\s*\.sep\s*\{\s*display: none;", narrow)
    assert ".sign" not in narrow, "the sign is the one thing that never hides"


def test_a_long_room_code_is_not_the_thing_that_shrinks() -> None:
    """Room codes are words — AbyssalBludgeon, not DRAGON — and half of one is useless."""
    bar = read(TOP_BAR)
    assert "flex-shrink: 999" in block_after(bar, ".site")
    assert "font-size: 0.85rem" in block_after(
        block_after(bar, f"@media (max-width: {BREAKPOINT})"), ".code"
    )


# --- three slots, and a placeholder in each until its task lands ----------------------


def test_the_three_named_slots_are_declared_and_filled() -> None:
    """Sound is D6's, theme is D5's, identity is D3's. GitHub is D10's, with the footer."""
    bar = read(TOP_BAR)
    declared = re.search(r"let \{(.*?)\}: \{", bar, re.DOTALL)
    assert declared is not None, "the bar takes no props at all"
    for slot in ("sound", "theme", "identity"):
        assert re.search(rf"\b{slot}\?: Snippet", bar), f"{slot} is not a slot"
        assert slot in declared.group(1), f"{slot} is not destructured out of $props"
        assert re.search(rf"\(\s*{slot} \?\? {slot}Placeholder\s*\)", bar), (
            f"{slot} has no placeholder to fall back to"
        )


def test_the_identity_slot_is_told_how_wide_the_bar_is() -> None:
    """Section 4: under 26rem the chip drops to the head, which only the chip can do."""
    bar = read(TOP_BAR)
    assert "identity?: Snippet<[{ narrow: boolean }]>" in bar
    assert re.search(r"identity \?\? identityPlaceholder\)\(\{ narrow \}\)", bar)


def test_the_placeholder_controls_cannot_be_pressed() -> None:
    """A placeholder that looks live is a bug report from the first player to tap it."""
    bar = read(TOP_BAR)
    for snippet in ("soundPlaceholder", "themePlaceholder"):
        opening = f"{{#snippet {snippet}()}}"
        body = bar[bar.index(opening) : bar.index("{/snippet}", bar.index(opening))]
        assert "disabled" in body, f"{snippet} can be pressed"
