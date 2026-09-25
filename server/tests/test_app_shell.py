"""D2 Accept: the shell is above every screen, and no screen is titled twice.

There is no browser in this suite, so what a test can hold is the shape the criteria are
made of: one ``<TopBar>`` outside the router rather than one per screen, no room code in
the bar, the 56px sticky measurement in one place, and a single breakpoint that hides the
wordmark and nothing else. The same approach as
``test_check_contrast.py``, which reads the stylesheet rather than rendering it.

What a browser confirmed, and a test here cannot: at 320px the bar is exactly 56px and
leaves ``scrollWidth == clientWidth`` on Home, Create, Join, the lobby, a question, a
reveal and the final standings; an input sitting under the bar scrolls clear of it; a
24-character name ellipsises beside sound and theme without running over the sign.
"""

import re

from tests.client_source import CLIENT_SRC, read

APP_CSS = CLIENT_SRC / "app.css"
APP_SVELTE = CLIENT_SRC / "App.svelte"
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


# --- one bar, above everything -------------------------------------------------------


def test_the_bar_is_rendered_once_and_outside_the_router() -> None:
    """A bar per screen is four bars to keep in step; this one is the shell."""
    app = read(APP_SVELTE)
    assert app.count("<TopBar") == 1
    assert app.index("<TopBar") < app.index("<main")
    # Every route is drawn inside <main>, so a bar before it is a bar on Home, Create,
    # Join and Room without any of them knowing about it.
    assert app.index("<TopBar") < app.index("{#if route.name")


def test_the_bar_carries_no_room_code() -> None:
    """Section 4: a code here is a word, and a word does not fit 56px beside four controls.

    The bar takes no code at all rather than taking one and hiding it, so there is no
    width a `ThermonuclearSmokeDevil` can arrive at and break.
    """
    bar = read(TOP_BAR)
    assert "code" not in re.search(r"let \{(.*?)\}: \{", bar, re.DOTALL).group(1)
    assert not re.search(r"<TopBar[^>]*code=", read(APP_SVELTE))
    markup = bar[bar.index("<header") : bar.index("</header>")]
    assert "code" not in markup, "the bar draws something it calls a code"


def test_join_still_says_which_room_it_is() -> None:
    """Nothing else on that screen does, now that the bar does not."""
    join = read(CLIENT_SRC / "routes" / "Join.svelte")
    assert any(
        "Room {code}" in heading for heading in re.findall(r"<h1>(.*?)</h1>", join, re.DOTALL)
    )


def test_a_room_you_are_in_does_not_title_itself_with_its_code() -> None:
    """Room's connecting and disconnected states: the code said nothing the screen did not."""
    offenders = [
        match.strip()
        for match in re.findall(r"<h1>(.*?)</h1>", read(CLIENT_SRC / "routes" / "Room.svelte"))
        if "Room {" in match
    ]
    assert offenders == [], "the lobby and the host carry the code: " + "; ".join(offenders)


def test_the_front_page_does_not_repeat_the_wordmark() -> None:
    """The inn's name is in the bar on every screen, Home included."""
    home = re.findall(r"<h1>(.*?)</h1>", read(CLIENT_SRC / "routes" / "Home.svelte"))
    assert home, "Home has no heading at all"
    assert not any("Jolly Boar Inn" in heading for heading in home)


def test_the_version_sits_beside_the_wordmark_not_inside_it() -> None:
    """D10 makes the name a selfhoster's to change; the version must survive that."""
    bar = read(TOP_BAR)
    assert "__APP_VERSION__" in bar
    assert "__APP_VERSION__" not in re.search(r"const SITE_NAME = .*", bar).group(0)
    wordmark = re.search(r'<p class="wordmark"[^>]*>(.*?)</p>', bar, re.S).group(1)
    assert re.search(r'<span class="version">\{VERSION\}</span>', wordmark)


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


def test_the_bar_has_one_breakpoint_and_it_is_stylesheet_only() -> None:
    """Nothing is rendered differently on a phone, so the script needs no media query."""
    bar = read(TOP_BAR)
    assert "matchMedia" not in bar
    assert f"@media (max-width: {BREAKPOINT})" in bar
    widths = set(re.findall(r"\(max-width:\s*([\w.]+)\)", bar))
    assert widths == {BREAKPOINT}, f"more than one breakpoint in the bar: {widths}"


def test_the_wordmark_gives_way_and_nothing_else_does() -> None:
    """Section 4: under 26rem the wordmark hides; sign, name, sound and theme all stay."""
    narrow = block_after(read(TOP_BAR), f"@media (max-width: {BREAKPOINT})")
    hidden = [selector.strip() for selector in re.findall(r"([^{}]+)\{[^{}]*display: none", narrow)]
    assert hidden == [".wordmark"], f"hidden under {BREAKPOINT}: {hidden}"


def test_the_sign_links_home() -> None:
    """A real href, so a modified click still opens a tab; the router handles the rest."""
    bar = read(TOP_BAR)
    link = re.search(r'<a class="home"[^>]*>(.*?)</a>', bar, re.DOTALL)
    assert link is not None, "the sign is not a link"
    assert 'href="/"' in link.group(0)
    assert 'class="sign"' in link.group(1)
    assert "navigate('/')" in bar
    assert "<TopBar {navigate}>" in read(APP_SVELTE)


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


def test_identity_comes_first_then_sound_then_theme() -> None:
    """Section 4: the name leads the right-hand group; sound and theme sit outermost."""
    bar = read(TOP_BAR)
    controls = bar[bar.index('<div class="controls">') : bar.index("</header>")]
    order = [
        controls.index(f"({slot} ?? {slot}Placeholder)") for slot in ("identity", "sound", "theme")
    ]
    assert order == sorted(order), "the right-hand group is out of order"


def test_the_name_is_shown_at_every_width() -> None:
    """Section 4: the name ellipsises on a phone; it never drops to just the head."""
    chip = read(CLIENT_SRC / "components" / "IdentityChip.svelte")
    assert "narrow" not in chip, "the chip still changes shape with the bar's width"
    assert '<span class="chip-name">' in chip
    # And the bar tells the slot nothing about its width.
    assert re.search(r"^\s*identity\?: Snippet$", read(TOP_BAR), re.MULTILINE)


def test_the_placeholder_controls_cannot_be_pressed() -> None:
    """A placeholder that looks live is a bug report from the first player to tap it."""
    bar = read(TOP_BAR)
    for snippet in ("soundPlaceholder", "themePlaceholder"):
        opening = f"{{#snippet {snippet}()}}"
        body = bar[bar.index(opening) : bar.index("{/snippet}", bar.index(opening))]
        assert "disabled" in body, f"{snippet} can be pressed"
