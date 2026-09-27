"""D13 Accept, the parts that live in the stage's stylesheet rather than its behaviour.

The component tests (``Splash.test.ts``, ``Question.test.ts``, ``Room.test.ts``) cover what
goes on the scroll and what under the line, and the ribbon. This reads the source for the
rest: no inline colour, knobs that cannot stretch, the written animation budget, and the
reduced-motion branch.

What a browser confirmed, and a test cannot: the scroll reads as parchment in all three
themes; under 448px the screen's edges cut the rolls in half and nothing scrolls sideways,
320px included; the sheet is at least four prompt lines tall; at 375x812 six gems at 56px
and a two-line prompt fit in 650px.
"""

import re

from tests.client_source import read

SCROLL = read("components/stage/ClueScroll.svelte")
STAGE = read("components/stage/Stage.svelte")


def _reduced_motion(source: str) -> str:
    match = re.search(r"@media \(prefers-reduced-motion: reduce\) \{(.*?)\n  \}", source, re.S)
    assert match is not None, "no reduced-motion branch"
    return match.group(1)


def test_no_style_attribute_or_directive_on_the_stage() -> None:
    """Layer 8 is read from the stylesheet; the CSP forbids inline styles anyway."""
    for source in (SCROLL, STAGE):
        assert re.search(r"(?<![\w-])style\s*=", source) is None
        assert re.search(r"(?<![\w-])style:", source) is None


def test_only_the_roll_body_stretches() -> None:
    """The knobs keep their aspect ratio at every height; the body stretches lengthwise."""
    stretched = re.findall(r'<svg class="([^"]+)"[^>]*preserveAspectRatio="none"', SCROLL)
    assert stretched == ["body", "facets"]
    assert re.search(r'<svg class="finial[^>]*preserveAspectRatio', SCROLL) is None


def test_the_scroll_opens_in_300ms_and_the_confetti_lasts_900ms() -> None:
    assert (
        re.findall(r"animation: (?:roll-left|roll-right|uncover) (\d+ms)", SCROLL) == ["300ms"] * 3
    )
    assert re.search(r"animation: confetti 900ms", SCROLL)
    assert re.search(r"animation: pin 200ms", SCROLL)


def test_the_ribbon_hangs_65_percent_across() -> None:
    award = re.search(r"\.award \{(.*?)\}", SCROLL, re.S)
    assert award is not None
    assert "left: 65%;" in award.group(1)


def test_reduced_motion_stills_the_scroll_and_drops_the_confetti() -> None:
    """The scroll simply appears and the ribbon comes without confetti."""
    branch = _reduced_motion(SCROLL)
    assert re.search(r"\.roll,\s*\.reveal,\s*\.ribbon \{\s*animation: none", branch)
    assert re.search(r"\.confetti \{\s*display: none;", branch)


def test_under_448px_the_screen_cuts_the_rolls_in_half() -> None:
    edge = re.search(r"@media \(max-width: 447\.98px\) \{(.*?)\n  \}", SCROLL, re.S)
    assert edge is not None
    assert "left: calc(-0.5 * var(--roll-w));" in edge.group(1)
    assert "right: calc(-0.5 * var(--roll-w));" in edge.group(1)
    row = re.search(r"@media \(max-width: 447\.98px\) \{(.*?)\n  \}", STAGE, re.S)
    assert row is not None
    assert "margin-inline: -1rem;" in row.group(1)
    assert "overflow-x: clip;" in row.group(1)
