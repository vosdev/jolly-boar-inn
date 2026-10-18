"""The parts that live in the stage's stylesheet rather than its behaviour.

The component tests (``Splash.test.ts``, ``Question.test.ts``, ``Room.test.ts``) cover what
goes on the sheet and what under the line, and the pin. This reads the source for the
rest: no inline colour, knobs that cannot stretch, the written animation budget, and the
reduced-motion branch.

What a browser confirmed, and a test cannot: each theme's sheet stands off its own floor;
under 448px the screen's edges cut the rolls in half and nothing scrolls sideways, 320px
included; the sheet is at least four prompt lines tall; at 375x812 six gems at 56px and a
two-line prompt fit in 650px.
"""

import re

from tests.client_source import read

SCROLL = read("components/stage/ClueScroll.svelte")
STAGE = read("components/stage/StageView.svelte")
CONFETTI = read("components/stage/Confetti.svelte")


def _reduced_motion(source: str) -> str:
    match = re.search(r"@media \(prefers-reduced-motion: reduce\) \{(.*?)\n  \}", source, re.S)
    assert match is not None, "no reduced-motion branch"
    return match.group(1)


def test_no_style_attribute_or_directive_on_the_stage() -> None:
    """Layer 8 is read from the stylesheet; the CSP forbids inline styles anyway."""
    for source in (SCROLL, STAGE):
        assert re.search(r"(?<![\w-])style\s*=", source) is None
        assert re.search(r"(?<![\w-])style:", source) is None


def test_only_what_runs_lengthwise_stretches() -> None:
    """The knobs, lashings and corners keep their aspect ratio at every size; only what has
    no ends to distort stretches: a roll's body, the facets, a bamboo pole along its bands
    and the earth under the gravestone."""
    svgs = re.findall(r"<svg\s[^>]*>", SCROLL)
    stretched = [
        re.search(r'class="([^"\s]+)', tag).group(1)  # type: ignore[union-attr]
        for tag in svgs
        if 'preserveAspectRatio="none"' in tag
    ]
    assert stretched == ["body", "pole", "mound", "facets"]
    assert re.search(r'<svg class="finial[^>]*preserveAspectRatio', SCROLL) is None


def test_a_host_leaves_and_arrives_in_200ms_and_the_confetti_lasts_900ms() -> None:
    """The scroll never opens: it is up from the lobby on, and only its host changes."""
    npc = r":is\(\.host, \.guest\) \{\s*animation:"
    assert re.search(rf"\.presence-leaving {npc} leave 200ms", STAGE)
    assert re.search(rf"\.presence-arriving {npc} fade-in 200ms", STAGE)
    assert re.search(r"animation: confetti 900ms", CONFETTI)
    assert re.search(r"animation: pin 200ms", SCROLL)


def test_the_pin_hangs_65_percent_across() -> None:
    award = re.search(r"\.award \{(.*?)\}", SCROLL, re.S)
    assert award is not None
    assert "left: 65%;" in award.group(1)


def test_reduced_motion_stills_the_scroll_and_drops_the_confetti() -> None:
    """The scroll simply appears and the pin comes without confetti."""
    branch = _reduced_motion(SCROLL)
    assert re.search(r"\.pin \{\s*animation: none", branch)
    assert re.search(r"\.confetti \{\s*display: none;", _reduced_motion(CONFETTI))


def test_under_448px_the_screen_cuts_the_rolls_in_half() -> None:
    edge = re.search(r"@media \(max-width: 447\.98px\) \{(.*?)\n  \}", SCROLL, re.S)
    assert edge is not None
    assert "left: calc(-0.5 * var(--roll-w));" in edge.group(1)
    assert "right: calc(-0.5 * var(--roll-w));" in edge.group(1)
    row = re.search(r"@media \(max-width: 447\.98px\) \{(.*?)\n  \}", STAGE, re.S)
    assert row is not None
    assert "margin-inline: -1rem;" in row.group(1)
    assert "overflow-x: clip;" in row.group(1)
