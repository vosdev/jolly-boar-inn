"""CI check: every theme in ``client/src/app.css`` keeps the token contract.

Section 2 of ``ideas/design.md`` splits the custom properties into eight layers and makes
layers 3, 4 and 8 a contract: a theme sets them, but the values have to survive a check. This
is that check. It parses the stylesheet rather than running a browser, so it stays a plain
stdlib script that anyone can run in a second.

Per theme (``:root`` is the default theme, every ``[data-theme='...']`` block is another),
with the theme's declarations resolved on top of the ones ``:root`` shares:

* every token of every layer is defined, so a theme cannot half-exist;
* ``--ok`` and ``--bad`` reach 4.5:1 against ``--panel``;
* ``--ink`` reaches 7:1 against ``--panel`` and ``--panel-raised``, and ``--bg-ink`` 7:1
  against ``--bg`` — two inks, because a theme may put light panels on a dark page;
* ``--muted`` reaches 4.5:1 against ``--panel``, and ``--bg-muted`` 4.5:1 against ``--bg``;
* ``--speaker``, the name over the dialogue box, reaches 4.5:1 against ``--panel-raised``;
* ``--more`` and ``--less`` reach 4.5:1 against ``--panel``;
* ``--ok`` and ``--bad`` are at least 60 degrees apart in hue, and so are ``--more`` and
  ``--less``, so neither pair collapses for a player who does not see red and green;
* ``--gem-ink`` reaches 4.5:1 against every ``--gem-*``, and against every gem as the
  reveal fades it: the fill mixed ``FADED_GEM_SHARE`` gem to the rest ``--panel``,
  exactly as ``GemButton.svelte``'s ``color-mix(in srgb, ...)`` does. The other options
  recede, but people want to read what they said;
* every ``--gem-*`` stands a colour difference (CIE76 delta E) of at least
  ``MIN_FADE_DELTA_E`` from its own faded self. Lit against faded is the whole of the
  pick and of the wait for everyone else, so a gem too close to its panel shows nothing.
  Diamond on a cream panel is why red topaz replaced it, and black onyx on a near-black
  one is why the gems are six;
* ``--scroll-ink`` reaches 7:1 and ``--scroll-muted`` 4.5:1 against ``--scroll-paper``, and
  the paper stands a colour difference of ``MIN_SCROLL_DELTA_E`` from ``--bg`` and
  ``--panel``, so the clue scroll reads as a sheet laid on the page, not a panel;
* ``--silhouette`` reaches 3:1 against ``--scroll-paper``, as a shape that carries
  meaning must: the shadow's outline is the question;
* each ``--texture-*`` is ``none`` or a local ``url()``: the CSP would block a remote
  one anyway, and this says so at build time rather than as a blank page background.

Per team (every ``[data-team='...']`` block), the frame a team game paints over any theme:
``--frame-ink`` reaches 4.5:1 against ``--frame``, the top bar and the timer's tabs, and the
timer's ``--frame-light`` fill 3:1 against its ``--frame-dark`` track.

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

# The eight layers of section 2. Everything here has to resolve for every theme; the
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
    "--speaker",
)
BRAND = ("--accent", "--accent-ink", "--accent-hover")
VERDICT = ("--ok", "--ok-ink", "--bad", "--bad-ink", "--warn", "--warn-ink")
SEMANTIC = ("--more", "--less")
GEMS = (
    "--gem-sapphire",
    "--gem-emerald",
    "--gem-ruby",
    "--gem-red-topaz",
    "--gem-dragonstone",
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
TEXTURE = ("--texture-panel", "--texture-bg", "--bar-texture")
# The top bar, which a theme may paint apart from its panels.
BAR = ("--bar", "--bar-ink", "--bar-muted", "--bar-edge")
# A panel's border colour, which may be transparent, and the image up its sides, or none.
PANEL_EDGE = ("--panel-edge", "--panel-sides")
SCROLL = ("--scroll-paper", "--scroll-edge", "--scroll-ink", "--scroll-muted", "--silhouette")
TILE = ("--tile-dark", "--tile-seam")
ROSETTE = tuple(
    f"--rosette-{part}{shade}"
    for part in ("petal", "tail", "tip", "heart")
    for shade in ("", "-dark")
)

COLOUR_TOKENS = (
    SURFACE + BRAND + VERDICT + SEMANTIC + GEMS + GEM_INK + SCROLL + TILE + ROSETTE + BAR
)
REQUIRED_TOKENS = COLOUR_TOKENS + SHAPE + TEXTURE + PANEL_EDGE + ("--scroll-facet-light",)

TEXT_RATIO = 4.5
# WCAG's floor for a shape that carries meaning.
SHAPE_RATIO = 3.0
BODY_TEXT_RATIO = 7.0
MIN_HUE_GAP = 60.0
# How much gem is left in a faded gem button's fill, the rest being --panel. The same
# number is in ``client/src/components/questions/GemButton.svelte``; change both.
FADED_GEM_SHARE = 0.25
# How far a lit gem must be from its faded self. Diamond at 18 looked the same both
# ways on jolly's cream panel; everything that reads well is above 20.
MIN_FADE_DELTA_E = 20.0
# How far the scroll's paper must be from the page and the panels around it.
MIN_SCROLL_DELTA_E = 10.0

_COMMENTS = re.compile(r"/\*.*?\*/", re.DOTALL)
_RULES = re.compile(r"([^{}]+)\{([^{}]*)\}", re.DOTALL)
_DECLARATION = re.compile(r"(--[\w-]+)\s*:\s*([^;]+)")
_THEME_SELECTOR = re.compile(r"\[data-theme=['\"]?([\w-]+)['\"]?\]")
_TEAM_SELECTOR = re.compile(r"^\[data-team=['\"]?([\w-]+)['\"]?\]$")
FRAME = ("--frame", "--frame-ink", "--frame-edge", "--frame-dark", "--frame-light")
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


def _lab(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    """CIELAB under D65, from sRGB."""
    r, g, b = (_channel(c) for c in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))


def delta_e(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    """CIE76 colour difference: straight-line distance in CIELAB. About 2 is just visible."""
    return sum((p - q) ** 2 for p, q in zip(_lab(a), _lab(b), strict=True)) ** 0.5


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
    ratio("--speaker", "--panel-raised", TEXT_RATIO)
    ratio("--more", "--panel", TEXT_RATIO)
    ratio("--less", "--panel", TEXT_RATIO)
    ratio("--scroll-ink", "--scroll-paper", BODY_TEXT_RATIO)
    ratio("--bar-ink", "--bar", BODY_TEXT_RATIO)
    ratio("--bar-muted", "--bar", TEXT_RATIO)
    ratio("--scroll-muted", "--scroll-paper", TEXT_RATIO)
    apart("--ok", "--bad")
    apart("--more", "--less")
    ratio("--silhouette", "--scroll-paper", SHAPE_RATIO)
    for ground in ("--bg", "--panel"):
        if "--scroll-paper" in colours and ground in colours:
            difference = delta_e(colours["--scroll-paper"], colours[ground])
            if difference < MIN_SCROLL_DELTA_E:
                problems.append(
                    f"{name}: --scroll-paper is only {difference:.1f} from {ground}, "
                    f"needs {MIN_SCROLL_DELTA_E:.0f}: the scroll would not stand off it"
                )
    # The reveal: the answer stays lit and the rest fade into the panel.
    for gem in GEMS:
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
            difference = delta_e(colours[gem], faded)
            if difference < MIN_FADE_DELTA_E:
                problems.append(
                    f"{name}: {gem} is only {difference:.1f} from itself faded into --panel, "
                    f"needs {MIN_FADE_DELTA_E:.0f}: lit and faded would look alike"
                )
    return problems


def parse_teams(css: str) -> dict[str, dict[str, str]]:
    """Every team's own block: the gods' colours, the same in every theme."""
    teams: dict[str, dict[str, str]] = {}
    for selector, body in _RULES.findall(strip_comments(css)):
        named = _TEAM_SELECTOR.match(selector.strip())
        if named:
            declarations = {name: value.strip() for name, value in _DECLARATION.findall(body)}
            teams.setdefault(named.group(1), {}).update(declarations)
    return teams


def check_team(name: str, tokens: dict[str, str]) -> list[str]:
    """Every way this team's frame fails to read, one line each."""
    problems: list[str] = []
    colours: dict[str, tuple[int, int, int]] = {}
    for token in FRAME:
        value = tokens.get(token)
        rgb = None if value is None else _rgb(value)
        if value is None:
            problems.append(f"{name}: {token} is not defined")
        elif rgb is None:
            problems.append(f"{name}: {token} is {value!r}, which is not a hex colour")
        else:
            colours[token] = rgb
    for token, against, minimum in (
        ("--frame-ink", "--frame", TEXT_RATIO),
        ("--frame-light", "--frame-dark", SHAPE_RATIO),
    ):
        if token in colours and against in colours:
            measured = contrast(colours[token], colours[against])
            if measured < minimum:
                problems.append(
                    f"{name}: {token} reaches only {measured:.2f}:1 against {against}, "
                    f"needs {minimum}:1"
                )
    return problems


def check(css: str) -> list[str]:
    themes = parse_themes(css)
    teams = parse_teams(css)
    return [line for name in sorted(themes) for line in check_theme(name, themes[name])] + [
        line for name in sorted(teams) for line in check_team(name, teams[name])
    ]


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
    teams = parse_teams(css)
    problems = check(css)
    if problems:
        for line in problems:
            print(line, file=sys.stderr)
        print(f"FAILED: {len(problems)} problem(s) in {path}", file=sys.stderr)
        return 1
    for name in sorted(themes):
        print(f"{name}: {len(REQUIRED_TOKENS)} token(s) ok")
    print(f"OK: {len(themes)} theme(s) and {len(teams)} team frame(s) in {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
