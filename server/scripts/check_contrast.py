"""CI check: every theme in ``client/src/app.css`` keeps the D1 token contract.

Section 2 of ``ideas/design.md`` splits the custom properties into seven layers and makes
layers 3 and 4 a contract: a theme sets them, but the values have to survive a check. This
is that check. It parses the stylesheet rather than running a browser, so it stays a plain
stdlib script that anyone can run in a second.

Per theme (``:root`` is the default theme, every ``[data-theme='...']`` block is another),
with the theme's declarations resolved on top of the ones ``:root`` shares:

* every token of every layer is defined, so a theme cannot half-exist;
* ``--ok`` and ``--bad`` reach 4.5:1 against ``--panel``;
* ``--ink`` reaches 7:1 against ``--panel`` and ``--panel-raised``, and ``--bg-ink`` 7:1
  against ``--bg`` — two inks, because a theme may put light panels on a dark page (D5);
* ``--muted`` reaches 4.5:1 against ``--panel``, and ``--bg-muted`` 4.5:1 against ``--bg``;
* ``--more`` and ``--less`` reach 4.5:1 against ``--panel``;
* ``--ok`` and ``--bad`` are at least 60 degrees apart in hue, and so are ``--more`` and
  ``--less``, so neither pair collapses for a player who does not see red and green;
* ``--ok`` reaches 3:1 — the non-text threshold for a UI boundary — against every
  ``--gem-*``, because the reveal rings the winning gem in ``--ok`` and an ``--ok`` green
  ringing an emerald button is a ring nobody can see;
* ``--gem-ink`` reaches 4.5:1 against every ``--gem-*``, and against every gem as the
  reveal fades it (D8): the fill mixed ``FADED_GEM_SHARE`` gem to the rest ``--panel``,
  exactly as ``GemButton.svelte``'s ``color-mix(in srgb, ...)`` does. The other options
  recede, but people want to read what they said;
* each ``--texture-*`` is ``none`` or a local ``url()`` (D5): the CSP would block a remote
  one anyway, and this says so at build time rather than as a blank page background.

Layer 4 is allowed to reuse layer 3's colours: ``--more`` is not "right" and ``--less`` is
not "wrong", and what keeps them apart on screen is a shape cue rather than a hue. The
check therefore holds them to the contrast and hue rules without asking them to differ
from ``--ok`` and ``--bad``.

Usage (from ``server/``)::

    uv run python scripts/check_contrast.py [APP_CSS]
"""

import re
import sys
from pathlib import Path

DEFAULT_CSS = Path(__file__).resolve().parents[2] / "client" / "src" / "app.css"

# The seven layers of section 2. Everything here has to resolve for every theme; the
# colour tokens additionally have to parse as a colour.
SURFACE = (
    "--bg",
    "--panel",
    "--panel-raised",
    "--line",
    "--ink",
    "--muted",
    "--bg-ink",
    "--bg-muted",
)
BRAND = ("--accent", "--accent-ink", "--accent-hover")
VERDICT = ("--ok", "--ok-ink", "--bad", "--bad-ink", "--warn", "--warn-ink")
SEMANTIC = ("--more", "--less")
GEMS = (
    "--gem-sapphire",
    "--gem-emerald",
    "--gem-ruby",
    "--gem-diamond",
    "--gem-dragonstone",
    "--gem-onyx",
    "--gem-zenyte",
)
GEM_INK = ("--gem-ink",)
SHAPE = (
    "--radius",
    "--border-width",
    "--shadow",
    "--font-display",
    "--font-body",
    "--font-numeric",
)
TEXTURE = ("--texture-panel", "--texture-bg")

COLOUR_TOKENS = SURFACE + BRAND + VERDICT + SEMANTIC + GEMS + GEM_INK
REQUIRED_TOKENS = COLOUR_TOKENS + SHAPE + TEXTURE

TEXT_RATIO = 4.5
BODY_TEXT_RATIO = 7.0
UI_RATIO = 3.0
MIN_HUE_GAP = 60.0
# D8: how much gem is left in a faded gem button's fill, the rest being --panel. The same
# number is in ``client/src/components/questions/GemButton.svelte``; change both.
FADED_GEM_SHARE = 0.25

_COMMENTS = re.compile(r"/\*.*?\*/", re.DOTALL)
_RULES = re.compile(r"([^{}]+)\{([^{}]*)\}", re.DOTALL)
_DECLARATION = re.compile(r"(--[\w-]+)\s*:\s*([^;]+)")
_THEME_SELECTOR = re.compile(r"\[data-theme=['\"]?([\w-]+)['\"]?\]")
_HEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_URL = re.compile(r"^url\(\s*(['\"]?)([^'\")]+)\1\s*\)$")


class CssError(Exception):
    """The stylesheet is not shaped the way the check can read."""


def strip_comments(css: str) -> str:
    """The stylesheet without its comments, which is what everything here reads."""
    return _COMMENTS.sub("", css)


def _rgb(value: str) -> tuple[int, int, int] | None:
    """A hex colour as 0-255 channels, or None if this is not a colour we can measure."""
    text = value.strip()
    if not _HEX.match(text):
        return None
    digits = text[1:]
    if len(digits) == 3:
        digits = "".join(c * 2 for c in digits)
    return int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16)


def _channel(value: int) -> float:
    c = value / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb: tuple[int, int, int]) -> float:
    """WCAG relative luminance."""
    r, g, b = (_channel(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    """WCAG contrast ratio, 1.0 (identical) to 21.0 (black on white)."""
    lighter, darker = sorted((luminance(a), luminance(b)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def mix(a: tuple[int, int, int], b: tuple[int, int, int], share: float) -> tuple[int, int, int]:
    """``color-mix(in srgb, a share, b)``: per channel, on the encoded values."""
    return tuple(round(x * share + y * (1 - share)) for x, y in zip(a, b, strict=True))  # type: ignore[return-value]


def hue(rgb: tuple[int, int, int]) -> float:
    """HSL hue in degrees. Grey has no hue; it gets 0.0 and the gap check below."""
    r, g, b = (c / 255 for c in rgb)
    high, low = max(r, g, b), min(r, g, b)
    span = high - low
    if span == 0:
        return 0.0
    if high == r:
        degrees = 60 * (((g - b) / span) % 6)
    elif high == g:
        degrees = 60 * ((b - r) / span + 2)
    else:
        degrees = 60 * ((r - g) / span + 4)
    return degrees % 360


def hue_gap(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    """The shorter way round the colour wheel between two hues, in degrees."""
    difference = abs(hue(a) - hue(b)) % 360
    return min(difference, 360 - difference)


def parse_themes(css: str) -> dict[str, dict[str, str]]:
    """Every theme in the stylesheet, with ``:root``'s declarations resolved underneath.

    ``:root`` carries the default theme and the tokens the others inherit, so a theme
    block only has to say what it changes. A rule may name both, as the jolly block does.
    """
    text = strip_comments(css)
    base: dict[str, str] = {}
    themes: dict[str, dict[str, str]] = {}
    order: list[tuple[str, dict[str, str]]] = []
    for selector, body in _RULES.findall(text):
        declarations = {name: value.strip() for name, value in _DECLARATION.findall(body)}
        if not declarations:
            continue
        for one in selector.split(","):
            one = one.strip()
            named = _THEME_SELECTOR.search(one)
            if named:
                theme = themes.setdefault(named.group(1), {})
                theme.update(declarations)
                order.append((named.group(1), theme))
            elif one == ":root" or one.startswith(":root:") or one == "html":
                base.update(declarations)
    if not themes:
        raise CssError("no [data-theme] block found")
    # A theme that shares its rule with :root (jolly) resolves to the base alone, which is
    # what a browser with no stored choice paints.
    return {name: {**base, **declarations} for name, declarations in themes.items()}


def check_theme(name: str, tokens: dict[str, str]) -> list[str]:
    """Every way this theme breaks the contract, one line each."""
    problems: list[str] = []
    for token in REQUIRED_TOKENS:
        if token not in tokens:
            problems.append(f"{name}: {token} is not defined")
    colours: dict[str, tuple[int, int, int]] = {}
    for token in COLOUR_TOKENS:
        value = tokens.get(token)
        if value is None:
            continue
        rgb = _rgb(value)
        if rgb is None:
            problems.append(f"{name}: {token} is {value!r}, which is not a hex colour")
        else:
            colours[token] = rgb

    def ratio(token: str, against: str, minimum: float) -> None:
        if token not in colours or against not in colours:
            return
        measured = contrast(colours[token], colours[against])
        if measured < minimum:
            problems.append(
                f"{name}: {token} reaches only {measured:.2f}:1 against {against}, "
                f"needs {minimum}:1"
            )

    def apart(one: str, other: str) -> None:
        if one not in colours or other not in colours:
            return
        gap = hue_gap(colours[one], colours[other])
        if gap < MIN_HUE_GAP:
            problems.append(
                f"{name}: {one} and {other} are {gap:.0f} degrees apart in hue, "
                f"needs {MIN_HUE_GAP:.0f}"
            )

    for token in TEXTURE:
        value = tokens.get(token)
        if value is None or value == "none":
            continue
        url = _URL.match(value)
        if url is None:
            problems.append(f"{name}: {token} is {value!r}, which is neither none nor a url()")
        elif re.match(r"^(?:[a-z][a-z0-9+.-]*:|//)", url.group(2), re.IGNORECASE):
            problems.append(f"{name}: {token} points off this server, at {url.group(2)!r}")

    ratio("--ok", "--panel", TEXT_RATIO)
    ratio("--bad", "--panel", TEXT_RATIO)
    ratio("--ink", "--panel", BODY_TEXT_RATIO)
    ratio("--ink", "--panel-raised", BODY_TEXT_RATIO)
    ratio("--bg-ink", "--bg", BODY_TEXT_RATIO)
    ratio("--muted", "--panel", TEXT_RATIO)
    ratio("--bg-muted", "--bg", TEXT_RATIO)
    ratio("--more", "--panel", TEXT_RATIO)
    ratio("--less", "--panel", TEXT_RATIO)
    apart("--ok", "--bad")
    apart("--more", "--less")
    # The reveal: --ok rings the winning gem, whichever gem that turns out to be.
    for gem in GEMS:
        ratio("--ok", gem, UI_RATIO)
        ratio("--gem-ink", gem, TEXT_RATIO)
        # ...and the losers fade, with their text still there to read.
        if gem in colours and "--panel" in colours and "--gem-ink" in colours:
            faded = mix(colours[gem], colours["--panel"], FADED_GEM_SHARE)
            measured = contrast(colours["--gem-ink"], faded)
            if measured < TEXT_RATIO:
                problems.append(
                    f"{name}: --gem-ink reaches only {measured:.2f}:1 against {gem} faded "
                    f"into --panel, needs {TEXT_RATIO}:1"
                )
    return problems


def check(css: str) -> list[str]:
    themes = parse_themes(css)
    return [line for name in sorted(themes) for line in check_theme(name, themes[name])]


def main(argv: list[str]) -> int:
    path = Path(argv[1]) if len(argv) > 1 else DEFAULT_CSS
    try:
        css = path.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"{exc}", file=sys.stderr)
        return 1
    try:
        themes = parse_themes(css)
    except CssError as exc:
        print(f"{path}: {exc}", file=sys.stderr)
        return 1
    problems = [line for name in sorted(themes) for line in check_theme(name, themes[name])]
    if problems:
        for line in problems:
            print(line, file=sys.stderr)
        print(f"FAILED: {len(problems)} problem(s) in {path}", file=sys.stderr)
        return 1
    for name in sorted(themes):
        print(f"{name}: {len(REQUIRED_TOKENS)} token(s) ok")
    print(f"OK: {len(themes)} theme(s) in {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
