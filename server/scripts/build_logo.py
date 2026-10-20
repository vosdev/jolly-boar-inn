"""Build the owner's logo: Broav's head, traced from the wiki's render, in every theme's colours.

The owner's tool, not the app's: a selfhoster brings their own logo through ``branding/``. The
sources are game art that ``make fetch-assets ONLY=logo`` puts in ``client/src/assets/logo/``,
and what this draws from them is game art too, so it goes to ``branding/boar/``, which git
ignores.

The render is a low-poly model with smooth shading. Each material (hide, tusks, eyes) is cut
into bands of lightness and traced as stacked polygons, band k covering every pixel at least
that light, so no hairline gap opens between two bands. Each band is painted in the material's
light colour at the opacity that leaves it at its share of the way from the dark one, which is
what lets a theme repaint the whole head with two colours per material.

Writes, under ``branding/boar/``:

* ``boar-logo.svg`` (for 32 to 64px) and ``boar-logo-large.svg`` (detailed), which follow the
  page's theme through ``--boar-*`` custom properties, and ``boar.css`` with every theme's;
* ``<theme>/``: the same pair with that theme's colours fixed, and PNGs from 32 to 1024px;
* ``logo.svg``, ``logo-<theme>.svg``, ``hero.svg``, ``hero-<theme>.svg``,
  ``apple-touch-icon.png`` and ``og-card.png``, what the app takes from
  ``PUBLIC_SITE_LOGO=branding/boar/logo.svg``: the sign and tab icon per theme, who stands on
  Home's stage per theme, a phone's home-screen icon, and the card a shared link shows;
* ``preview.html``: every theme on its own panel and floor.

Adding a theme is one entry in ``THEMES``; a theme ``app.css`` paints without one is reported.

Usage (from ``server/``)::

    uv run --group logo python scripts/build_logo.py
"""

import base64
import re
import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import resvg_py
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCES = REPO_ROOT / "client" / "src" / "assets" / "logo"
RENDER = SOURCES / "broav_detail.png"
SKULL = SOURCES / "skull.png"
ASSETS = REPO_ROOT / "client" / "src" / "assets"
APP_CSS = REPO_ROOT / "client" / "src" / "app.css"
QUILL = ASSETS / "fonts" / "RuneScape-Quill-8.ttf"
RUG = ASSETS / "textures" / "inn-rug.svg"
NPCS = ASSETS / "npcs"
OUT = REPO_ROOT / "branding" / "boar"

PNG_SIZES = (32, 64, 128, 256, 512, 1024)
# Phones round a home-screen icon's corners and fill what is transparent with black, so it is
# the board's green to the edge with the boar inset from the corners.
TOUCH_ICON_SIZE = 180
TOUCH_ICON_INSET = 0.9

# The hosts along the share card, in the order they stand: a few of the faces a room meets.
CARD_HOSTS = (
    "examiner",
    "gnome_child",
    "nieve",
    "postie_pete",
    "dunce",
    "ali_morrisane",
    "death",
    "cracked_jennys_tea_cup",
)
# The small logo's thicker outline and fewer bands are what survive at a few pixels; the
# large one's detail only shows from 128px.
SMALL_UP_TO = 64

# Per theme, every colour of its boar and the one ornament it wears, if any. The first theme
# is also what a file falls back to on a page that sets no `--boar-*` at all.
THEMES: dict[str, dict[str, str]] = {
    "jolly": {
        "ornament": "board",
        "rim": "#2a2012",
        "hide-lo": "#18150d",
        "hide-hi": "#8f7960",
        "tusk-lo": "#3a372c",
        "tusk-hi": "#cfc8a6",
        "eye-lo": "#968c8b",
        "eye-hi": "#fdfcfc",
        "board-fill": "#2f6e25",
        "board-edge": "#1f4d18",
    },
    "pollnivneach": {
        "ornament": "fez",
        "rim": "#2b2319",
        "hide-lo": "#2a1a0c",
        "hide-hi": "#c38c55",
        "tusk-lo": "#5a4a30",
        "tusk-hi": "#f6edd2",
        "eye-lo": "#a89c8a",
        "eye-hi": "#fffaf2",
    },
    "wilderness": {
        "ornament": "skull",
        "rim": "#060504",
        "hide-lo": "#0f0c0b",
        "hide-hi": "#86776a",
        "tusk-lo": "#4a4234",
        "tusk-hi": "#e2d6b4",
        "eye-lo": "#c4241a",
        "eye-hi": "#ff6a3c",
        "eye-glow": "#ff3b1f",
    },
    "party_room": {
        "ornament": "partyhat",
        "rim": "#23263a",
        "hide-lo": "#1f1712",
        "hide-hi": "#a3846a",
        "tusk-lo": "#4a4a40",
        "tusk-hi": "#f4f1e0",
        "eye-lo": "#9aa2b6",
        "eye-hi": "#ffffff",
        "hat-lo": "#1d3a9c",
        "hat-hi": "#4c78e8",
    },
    # A TzHaar-Mej's red, the obsidian of its weapons for tusks, the eyes lit by the lava.
    "tzhaar": {
        "ornament": "",
        "rim": "#1a0604",
        "hide-lo": "#3a0a06",
        "hide-hi": "#d42c18",
        "tusk-lo": "#0e0b0b",
        "tusk-hi": "#5c5450",
        "eye-lo": "#ff7a1e",
        "eye-hi": "#ffe08a",
        "eye-glow": "#ff9a2e",
    },
    "jungle": {
        "ornament": "leaves",
        "rim": "#1d2a12",
        "hide-lo": "#16110a",
        "hide-hi": "#9a7a52",
        "tusk-lo": "#4a4a2c",
        "tusk-hi": "#f3ecc6",
        "eye-lo": "#9a9a7a",
        "eye-hi": "#fffbe6",
    },
    "gauntlet": {
        "ornament": "crystals",
        "rim": "#123c40",
        "hide-lo": "#0e1416",
        "hide-hi": "#a69a8c",
        "tusk-lo": "#2f7c80",
        "tusk-hi": "#e9ffff",
        "eye-lo": "#5fc9cf",
        "eye-hi": "#f0ffff",
        "eye-glow": "#5fe6ea",
        "tusk-glow": "#8fe3e6",
    },
    # A Ghast, the swamp's near-invisible ghost: the body half gone, the eyes still lit.
    "morytania": {
        "ornament": "",
        "rim": "#8fb0a0",
        "hide-lo": "#2f4a40",
        "hide-hi": "#c4d8cc",
        "tusk-lo": "#7a9a8a",
        "tusk-hi": "#eef6ee",
        "eye-lo": "#2f9a3a",
        "eye-hi": "#b8ff8a",
        "eye-glow": "#7dff6a",
        "ghost": "0.5",
        "ghost-tusk": "0.65",
    },
}
# The Corrupted Gauntlet keeps the crystal boar until it has one of its own.
THEMES["corrupted_gauntlet"] = THEMES["gauntlet"]
ORNAMENTS = ("board", "fez", "skull", "partyhat", "leaves", "crystals")
DEFAULT = THEMES["jolly"]

# What Broav_detail.png looks like, in its own pixels. A new upload of the file would need
# these measured again.
CROWN_PEAK_X = 645

Geometry = dict[str, Any]


# ---- Tracing -----------------------------------------------------------------------------


def _mask_u8(mask: np.ndarray, kernel: int) -> np.ndarray:
    """``mask`` as 0/255, closed then opened so a stray pixel neither makes nor breaks a shape."""
    m = mask.astype(np.uint8) * 255
    if kernel > 1:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel, kernel))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k)
    return m


def _path(mask: np.ndarray, eps: float, min_area: float) -> str:
    """The outlines of ``mask`` as one path; holes come out right under the nonzero rule."""
    contours, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in contours:
        if cv2.contourArea(c) < min_area:
            continue
        points = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        if len(points) >= 3:
            out.append("M" + " ".join(f"{x} {y}" for x, y in points) + "Z")
    return "".join(out)


def trace(path: Path) -> tuple[int, dict[str, Geometry]]:
    """The render's width, and its outline and bands at the small and the large logo's detail."""
    rgba = np.array(Image.open(path).convert("RGBA"))
    rgb = rgba[..., :3].astype(np.float32) / 255
    alpha = rgba[..., 3] > 0
    hls = cv2.cvtColor(rgb, cv2.COLOR_RGB2HLS)
    hue, light, sat = hls[..., 0], hls[..., 1], hls[..., 2]

    # The eyes are near-white with a pink cast, the tusks a pale olive, the rest is hide.
    eye = alpha & (((sat < 0.1) & ((hue < 10) | (hue > 300)) & (light > 0.5)) | (light > 0.95))
    tusk = alpha & ~eye & (hue >= 45) & (hue <= 61) & (light >= 0.12)
    hide = alpha & ~eye & ~tusk

    # Mean shift flattens the shading inside a facet but keeps the edge between two facets,
    # so the bands follow the model's polygons rather than its gradients.
    bgr = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    bgr[~alpha] = 0
    shifted = cv2.pyrMeanShiftFiltering(bgr, 14, 10, maxLevel=1)
    smooth = cv2.cvtColor(shifted.astype(np.float32) / 255, cv2.COLOR_BGR2HLS)[..., 1]

    grow = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

    def under(mask: np.ndarray) -> np.ndarray:
        # A little past its edge, so the hide never shows through between it and the next part.
        return cv2.dilate(mask.astype(np.uint8), grow).astype(bool) & alpha

    def bands(material, base, levels, eps, min_area, kernel) -> list[dict[str, Any]]:
        values = light[material]
        lo, hi = values.min(), np.percentile(values, 99)
        level = np.clip(((smooth - lo) / (hi - lo) * levels).astype(int), 0, levels - 1)
        out = []
        for i in range(levels):
            d = _path(_mask_u8(base if i == 0 else material & (level >= i), kernel), eps, min_area)
            if d:
                out.append({"t": i / max(levels - 1, 1), "d": d})
        return out

    def geometry(hide_levels, tusk_levels, eye_levels, eps, min_area, kernel) -> Geometry:
        return {
            "silhouette": _path(_mask_u8(alpha, kernel), eps, min_area),
            "hide": bands(hide, alpha, hide_levels, eps, min_area, kernel),
            "tusk": bands(tusk, under(tusk), tusk_levels, eps, min_area, kernel),
            "eye": bands(eye, under(eye), eye_levels, eps, min_area, kernel),
        }

    return rgba.shape[1], {
        "large": geometry(12, 5, 3, 2.5, 120, 5),
        "small": geometry(4, 2, 1, 5.0, 900, 11),
    }


def pixel_skull(path: Path) -> tuple[int, str]:
    """The PK skull's width and its pixels as paths, one per colour, kept square at any size."""
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    runs: dict[str, list[str]] = {}
    for y in range(height):
        x = 0
        while x < width:
            colour = image.getpixel((x, y))
            n = 1
            while x + n < width and image.getpixel((x + n, y)) == colour:
                n += 1
            if colour[3]:
                hexed = "#{:02x}{:02x}{:02x}".format(*colour[:3])
                runs.setdefault(hexed, []).append(f"M{x} {y}h{n}v1h-{n}z")
            x += n
    return width, "".join(f'<path fill="{c}" d="{"".join(d)}"/>' for c, d in runs.items())


# ---- Drawing -----------------------------------------------------------------------------


def _var(name: str, fallback: str | None = None) -> str:
    return f"var(--boar-{name}, {fallback or DEFAULT.get(name, 'transparent')})"


def _shows(ornament: str) -> str:
    return f"display: {_var(ornament, 'inline' if DEFAULT['ornament'] == ornament else 'none')};"


RULES = "\n".join(
    [
        f".boar-rim {{ fill: {_var('rim')}; stroke: {_var('rim')}; stroke-linejoin: round; }}",
        f".boar-outline, .boar-hide {{ opacity: {_var('ghost', '1')}; }}",
        f".boar-tusk {{ opacity: {_var('ghost-tusk', '1')}; }}",
        *(
            f".boar-{part} > * {{ fill: {_var(f'{part}-hi')}; }}\n"
            f".boar-{part} > .boar-lo {{ fill: {_var(f'{part}-lo')}; }}"
            for part in ("hide", "tusk", "eye")
        ),
        f".boar-eye-glow {{ flood-color: {_var('eye-glow')}; }}",
        f".boar-tusk-glow {{ flood-color: {_var('tusk-glow')}; }}",
        f".boar-board {{ {_shows('board')} fill: {_var('board-fill')}; "
        f"stroke: {_var('board-edge')}; }}",
        f".boar-fez {{ {_shows('fez')} }}",
        f".boar-skull {{ {_shows('skull')} }}",
        f".boar-partyhat {{ {_shows('partyhat')} }}",
        f".boar-hat-lo {{ fill: {_var('hat-lo', '#1d3a9c')}; }}",
        f".boar-hat-hi {{ fill: {_var('hat-hi', '#4c78e8')}; }}",
        f".boar-leaves {{ {_shows('leaves')} }}",
        f".boar-crystals {{ {_shows('crystals')} }}",
    ]
)


def custom_properties(selector: str, theme: dict[str, str]) -> str:
    """``theme`` as ``--boar-*`` declarations on ``selector``, its ornament switched on."""
    values = {k: v for k, v in theme.items() if k != "ornament"}
    shown = {o: ("inline" if o == theme.get("ornament") else "none") for o in ORNAMENTS}
    lines = [f"  --boar-{k}: {v};" for k, v in {**shown, **values}.items()]
    return f"{selector} {{\n" + "\n".join(lines) + "\n}"


def _bands(bands: list[dict[str, Any]]) -> str:
    """Band k's opacity over the ones under it leaves it ``t`` of the way from dark to light."""
    out, below = [], 0.0
    for i, band in enumerate(bands):
        if i == 0:
            out.append(f'<path class="boar-lo" d="{band["d"]}"/>')
        else:
            opacity = 1 - (1 - band["t"]) / (1 - below) if below < 1 else 1
            out.append(f'<path d="{band["d"]}" fill-opacity="{opacity:.3f}"/>')
        below = band["t"]
    return "".join(out)


def _glow(fid: str, cls: str, blur: int) -> str:
    return (
        f'<filter id="{fid}" x="-50%" y="-50%" width="200%" height="200%">'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="b"/>'
        f'<feFlood class="{cls}"/><feComposite in2="b" operator="in"/>'
        '<feMerge><feMergeNode/><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>'
        "</filter>"
    )


def _head(geometry: Geometry, uid: str, rim: int) -> str:
    return (
        f"<defs>{_glow(uid + '-eg', 'boar-eye-glow', 30)}"
        f"{_glow(uid + '-tg', 'boar-tusk-glow', 30)}</defs>"
        f'<path class="boar-rim boar-outline" stroke-width="{rim}" d="{geometry["silhouette"]}"/>'
        f'<g class="boar-hide">{_bands(geometry["hide"])}</g>'
        f'<g class="boar-tusk" filter="url(#{uid}-tg)">{_bands(geometry["tusk"])}</g>'
        f'<g class="boar-eye" filter="url(#{uid}-eg)">{_bands(geometry["eye"])}</g>'
    )


# The headgear is drawn in the render's own pixels, over its crown.
_HAT = (
    "M440 150 L455 -70 L505 -260 L575 -60 L640 -280 L705 -55 L775 -270 L830 -60 "
    "L895 -245 L905 130 Z"
)
_FEZ = "M500 140 L545 -150 L765 -150 L815 135 Z"


def _partyhat(rim: int) -> str:
    return (
        '<g class="boar-partyhat" transform="rotate(-8 660 60)">'
        f'<path class="boar-rim" stroke-width="{rim}" d="{_HAT}"/>'
        f'<path class="boar-hat-lo" d="{_HAT}"/>'
        '<path class="boar-hat-hi" d="M455 -70 L505 -260 L530 -65 Z M575 -60 L640 -280 '
        'L660 -58 Z M705 -55 L775 -270 L790 -58 Z M830 -60 L895 -245 L870 -50 Z"/>'
        '<path class="boar-hat-hi" fill-opacity="0.55" d="M440 150 L455 -70 L905 -40 '
        'L905 130 Z"/>'
        "</g>"
    )


def _fez(rim: int) -> str:
    return (
        '<g class="boar-fez" transform="rotate(-6 650 40) translate(657 137) scale(1.3) '
        'translate(-657 -137)">'
        f'<path class="boar-rim" stroke-width="{rim}" d="{_FEZ}"/>'
        f'<path fill="#9e1b1b" d="{_FEZ}"/>'
        '<path fill="#c8332a" d="M500 140 L545 -150 L640 -150 L630 138 Z"/>'
        '<path fill="#6e1010" d="M545 -150 L765 -150 L740 -120 L560 -120 Z"/>'
        f'<path class="boar-rim" stroke-width="{rim * 0.4:.0f}" fill="none" '
        'd="M655 -150 Q700 -60 735 40"/>'
        '<path fill="#1a1a1a" d="M720 30 L752 30 L760 110 L712 110 Z"/>'
        "</g>"
    )


# Three palm fronds and a banana for the jungle, three crystal shards for the Gauntlet: drawn,
# like the fez, in the render's pixels over the crown, and as large as the fez stands.
_FRONDS = (
    (
        "M655 140 Q520 -40 300 -120 Q520 -120 655 60 Z",
        "#3f7a26",
        "M655 100 Q520 -60 300 -120 Q520 -100 655 60 Z",
        "#5f9e34",
    ),
    (
        "M660 140 Q630 -80 700 -220 Q750 -80 700 140 Z",
        "#4f8f2c",
        "M680 140 Q655 -80 700 -220 Q700 -60 700 140 Z",
        "#78b444",
    ),
    (
        "M700 140 Q820 -60 1040 -110 Q840 -110 690 60 Z",
        "#3f7a26",
        "M700 110 Q820 -80 1040 -110 Q840 -90 690 60 Z",
        "#5f9e34",
    ),
    (
        "M770 120 Q880 40 900 -60 Q930 -40 925 0 Q900 110 790 150 Z",
        "#e8cf3a",
        "M780 120 Q880 40 900 -60 Q905 40 800 135 Z",
        "#f7e77a",
    ),
)
_SHARDS = (
    ("M520 140 L470 -20 L520 -110 L570 -20 L575 140 Z", "M520 140 L470 -20 L520 -110 L520 140 Z"),
    (
        "M610 140 L580 -100 L660 -300 L740 -100 L710 140 Z",
        "M610 140 L580 -100 L660 -300 L660 140 Z",
    ),
    ("M750 140 L760 -30 L820 -130 L860 -20 L810 140 Z", "M750 140 L760 -30 L820 -130 L790 140 Z"),
)


def _crown(cls: str, scale: float, parts: str) -> str:
    return (
        f'<g class="{cls}" transform="rotate(-6 650 40) translate(657 140) scale({scale}) '
        f'translate(-657 -140)">{parts}</g>'
    )


def _leaves(rim: int) -> str:
    parts = "".join(
        f'<path class="boar-rim" stroke-width="{rim}" d="{shape}"/>'
        f'<path fill="{base}" d="{shape}"/><path fill="{light}" d="{lit}"/>'
        for shape, base, lit, light in _FRONDS
    )
    return _crown("boar-leaves", 1.3, parts)


def _crystals(rim: int) -> str:
    parts = "".join(
        f'<path class="boar-rim" stroke-width="{rim}" d="{shape}"/>'
        f'<path fill="#bff3f3" d="{shape}"/><path fill="#e9ffff" d="{lit}"/>'
        for shape, lit in _SHARDS
    )
    return _crown(
        "boar-crystals", 1.15, parts + '<path fill="#8fe3e6" d="M660 -300 L740 -100 L660 -60 Z"/>'
    )


class Logo:
    """Draws the logo in a 32-unit square, the size the top bar shows it at.

    The head takes the same place in every theme, so switching theme never moves it, and
    leaves the top of the square to the ornaments. It is mirrored: the sign sits top left,
    and a boar facing into the page looks at what it is the sign of.
    """

    def __init__(self, width: int, geometry: dict[str, Geometry], skull: tuple[int, str]):
        self.width = width
        self.geometry = geometry
        self.scale = 30 / width
        self.left, self.top = 1, 7
        self.skull_width, self.skull_paths = skull

    def _skull(self) -> str:
        pixel = 0.32
        peak = self.left + (self.width - CROWN_PEAK_X) * self.scale
        x = peak - self.skull_width * pixel / 2
        return (
            '<g class="boar-skull" shape-rendering="crispEdges" '
            f'transform="translate({x:.3f} 0) scale({pixel})">{self.skull_paths}</g>'
        )

    def svg(self, size: str, uid: str, preamble: str | None = "") -> str:
        """The ``small`` or ``large`` logo; ``preamble`` goes before the rules, None drops them."""
        rim, hat_rim = (70, 60) if size == "small" else (28, 28)
        s = self.scale
        mirrored = (
            f'<g transform="translate({self.left + self.width * s:.4f} {self.top}) '
            f'scale({-s:.6f} {s:.6f})">'
            f"{_head(self.geometry[size], uid, rim)}{_fez(hat_rim)}"
            f"{_partyhat(hat_rim)}{_leaves(hat_rim)}{_crystals(hat_rim)}</g>"
        )
        board = (
            '<rect class="boar-board" stroke-width="1.5" x="2" y="2" width="28" height="28" '
            'rx="3"/>'
        )
        style = "" if preamble is None else f"<style>{preamble}{RULES}</style>"
        return (
            '<svg xmlns="http://www.w3.org/2000/svg" class="boar" viewBox="0 0 32 32" '
            f'role="img" aria-label="Broav, the Jolly Boar">{style}{board}{mirrored}'
            f"{self._skull()}</svg>"
        )


def resolved(svg: str, theme: dict[str, str]) -> str:
    """``svg`` with ``theme``'s values in place of every ``var()``: resvg has none of its own."""
    values = re.search(r"\{(.*?)\}", custom_properties("svg", theme), re.S)
    found = dict(re.findall(r"--boar-([\w-]+): ([^;]+);", values.group(1) if values else ""))
    return re.sub(r"var\(--boar-([\w-]+), ([^()]+?)\)", lambda m: found.get(m[1], m[2]), svg)


def touch_icon(logo: Logo) -> bytes:
    """The default theme's boar on its board's colour to every edge, as a PNG."""
    # The board itself would draw its edge as a frame inside the icon's own.
    bare = {**DEFAULT, "ornament": ""}
    inner = resolved(logo.svg("large", "touch", custom_properties("svg", bare) + "\n"), bare)
    side = 32 * TOUCH_ICON_INSET
    offset = (32 - side) / 2
    inner = inner.replace(
        'viewBox="0 0 32 32"',
        f'x="{offset}" y="{offset}" width="{side}" height="{side}" viewBox="0 0 32 32"',
        1,
    )
    page = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        f'<rect width="32" height="32" fill="{DEFAULT["board-fill"]}"/>{inner}</svg>'
    )
    size = TOUCH_ICON_SIZE
    return bytes(resvg_py.svg_to_bytes(svg_string=page, width=size, height=size))


def _overhead(text: str, x: float, y: float, size: int, fill: str) -> str:
    """Text as the game says it over a head: flat, with a hard shadow one font pixel down-right.

    Quill 8 is drawn for 16px, so ``size`` is a whole multiple of it or the pixels smear.
    The family is quoted: a CSS name that ends in a number is not one unquoted.
    """
    shadow = size / 16
    font = f'font-family="\'RuneScape Quill 8\'" font-size="{size}"'
    return (
        f'<text x="{x + shadow}" y="{y + shadow}" {font} fill="#000">{text}</text>'
        f'<text x="{x}" y="{y}" {font} fill="{fill}">{text}</text>'
    )


def _data_uri(png: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png).decode()


def share_card(logo: Logo) -> bytes | None:
    """The 1200x630 card a shared link shows, or None without the hosts' chatheads."""
    heads = [NPCS / f"{npc}_chathead.png" for npc in CARD_HOSTS]
    missing = [p.name for p in heads if not p.is_file()]
    if missing:
        print(
            f"no og-card.png: missing {', '.join(missing)}; run `make fetch-assets ONLY=npcs`",
            file=sys.stderr,
        )
        return None

    boar = resolved(logo.svg("large", "card", custom_properties("svg", DEFAULT) + "\n"), DEFAULT)
    boar_png = bytes(resvg_py.svg_to_bytes(svg_string=boar, width=960, height=960))
    rug = RUG.read_text(encoding="utf-8")
    rug = rug[rug.index(">") + 1 : rug.rindex("</svg>")]

    # Each host fitted to a square and stood on one line, facing the boar as the wiki draws them.
    crowd, size, step, left, top = [], 96, 82, 520, 386
    for i, head in enumerate(heads):
        width, height = Image.open(head).size
        k = size / max(width, height)
        w, h = width * k, height * k
        x, y = left + i * step + (size - w) / 2, top + size - h
        crowd.append(
            f'<image href="{_data_uri(head.read_bytes())}" x="{x:.1f}" y="{y:.1f}" '
            f'width="{w:.1f}" height="{h:.1f}"/>'
        )

    page = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">'
        "<defs>"
        f'<pattern id="rug" width="112" height="112" patternUnits="userSpaceOnUse">'
        f'<g transform="scale(2)">{rug}</g></pattern>'
        '<radialGradient id="lamp" cx="0.27" cy="0.48" r="0.55">'
        '<stop offset="0" stop-color="#f0b450" stop-opacity="0.32"/>'
        '<stop offset="1" stop-color="#f0b450" stop-opacity="0"/></radialGradient>'
        '<radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75">'
        '<stop offset="0.55" stop-color="#000" stop-opacity="0"/>'
        '<stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>'
        "</defs>"
        '<rect width="1200" height="630" fill="#3b321d"/>'
        '<rect width="1200" height="630" fill="url(#rug)"/>'
        '<rect width="1200" height="630" fill="url(#lamp)"/>'
        f'<image href="{_data_uri(boar_png)}" x="20" y="60" width="480" height="480"/>'
        + _overhead("Think you know", 528, 175, 80, "#ffff00")
        + _overhead("Gielinor?", 528, 265, 112, "#ffff00")
        + _overhead("Prove it at the Jolly Boar Inn.", 530, 340, 48, "#f2e5bf")
        + '<rect width="1200" height="630" fill="url(#vignette)"/>'
        + "".join(crowd)
        # The inn's wooden trim along the bottom edge.
        + '<rect y="596" width="1200" height="34" fill="#5a4220"/>'
        '<rect y="596" width="1200" height="4" fill="#8c6a34"/>'
        '<rect y="626" width="1200" height="4" fill="#24190b"/>'
        "</svg>"
    )
    return bytes(
        resvg_py.svg_to_bytes(svg_string=page, font_files=[str(QUILL)], skip_system_fonts=True)
    )


def painted_themes(css: str) -> list[str]:
    """The themes ``app.css`` paints, by their ``[data-theme='…']`` blocks."""
    return re.findall(r"^\[data-theme='([\w-]+)'\]", css, re.MULTILINE)


def preview(logo: Logo, css: str) -> str:
    """Every theme's logo in the top bar and on its panel and floor, in app.css's own colours."""
    blocks, sections = [], []
    for n, theme in enumerate(THEMES):
        found = re.search(r"\[data-theme='" + re.escape(theme) + r"'\] \{(.*?)\n\}", css, re.S)
        # The textures are relative to app.css and would not resolve from here.
        body = "\n".join(ln for ln in (found[1] if found else "").splitlines() if "url(" not in ln)
        blocks.append(f"[data-theme='{theme}'] {{{body}\n}}")
        sections.append(
            f'<section data-theme="{theme}"><h2>{theme}</h2>'
            f'<div class="bar"><span class="s32">{logo.svg("small", f"p{n}a", None)}</span>'
            '<b>The Jolly Boar Inn</b></div><div class="row">'
            f'<div class="tile panel"><div class="s64">{logo.svg("small", f"p{n}b", None)}</div>'
            "<small>64px, small</small></div>"
            f'<div class="tile panel"><div class="s160">{logo.svg("large", f"p{n}c", None)}</div>'
            "<small>160px on panel</small></div>"
            f'<div class="tile floor"><div class="s160">{logo.svg("large", f"p{n}d", None)}</div>'
            "<small>160px on floor</small></div></div></section>"
        )
    themes = "\n".join(custom_properties(f"[data-theme='{t}']", p) for t, p in THEMES.items())
    page = """
body { margin: 0; font-family: system-ui, sans-serif; background: #222; }
section { background: var(--bg); color: var(--bg-ink); padding: 16px 24px 24px; }
h2 { margin: 0 0 12px; font-size: 14px; letter-spacing: .08em; text-transform: uppercase; }
.bar { display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 12px;
  background: var(--panel); color: var(--ink); box-shadow: 0 2px 0 var(--line);
  margin-bottom: 16px; }
svg { display: block; }
.s32 svg { width: 32px; height: 32px; } .s64 svg { width: 64px; height: 64px; }
.s160 svg { width: 160px; height: 160px; }
.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.tile { border-radius: 6px; padding: 12px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px; }
.tile.panel { background: var(--panel); color: var(--muted); border: 2px solid var(--line); }
.tile.floor { background: var(--bg); color: var(--bg-muted); border: 2px dashed var(--line); }
"""
    return (
        '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>Broav logos</title><style>\n{chr(10).join(blocks)}\n{themes}\n{RULES}\n{page}"
        f"</style></head><body>{''.join(sections)}</body></html>\n"
    )


def main() -> int:
    missing = [p for p in (RENDER, SKULL) if not p.is_file()]
    if missing:
        names = ", ".join(str(p.relative_to(REPO_ROOT)) for p in missing)
        print(f"missing {names}: run `make fetch-assets ONLY=logo` first", file=sys.stderr)
        return 1

    css = APP_CSS.read_text(encoding="utf-8")
    width, geometry = trace(RENDER)
    logo = Logo(width, geometry, pixel_skull(SKULL))

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "boar-logo.svg").write_text(logo.svg("small", "boar-logo"))
    (OUT / "boar-logo-large.svg").write_text(logo.svg("large", "boar-logo-large"))
    themes = "\n\n".join(custom_properties(f"[data-theme='{t}']", p) for t, p in THEMES.items())
    (OUT / "boar.css").write_text(f"{themes}\n\n{RULES}\n")
    (OUT / "preview.html").write_text(preview(logo, css))

    for name, theme in THEMES.items():
        folder = OUT / name
        folder.mkdir(exist_ok=True)
        fixed = custom_properties("svg", theme) + "\n"
        svgs = {size: logo.svg(size, f"boar-logo-{size}", fixed) for size in ("small", "large")}
        (folder / "boar-logo.svg").write_text(svgs["small"])
        (folder / "boar-logo-large.svg").write_text(svgs["large"])
        for px in PNG_SIZES:
            svg = resolved(svgs["small" if px <= SMALL_UP_TO else "large"], theme)
            png = resvg_py.svg_to_bytes(svg_string=svg, width=px, height=px)
            (folder / f"boar-{px}.png").write_bytes(bytes(png))

        # The board is the sign's: on Home's stage the boar stands on its own.
        bare = {**theme, "ornament": ""} if theme.get("ornament") == "board" else theme
        hero = logo.svg("large", f"hero-{name}", custom_properties("svg", bare) + "\n")
        suffix = "" if theme is DEFAULT else f"-{name}"
        (OUT / f"logo{suffix}.svg").write_text(svgs["small"])
        (OUT / f"hero{suffix}.svg").write_text(hero)

    (OUT / "apple-touch-icon.png").write_bytes(touch_icon(logo))
    card = share_card(logo)
    if card is not None:
        (OUT / "og-card.png").write_bytes(card)
    print(f"wrote {OUT.relative_to(REPO_ROOT)}/: {', '.join(THEMES)}")
    unpainted = [t for t in painted_themes(css) if t not in THEMES]
    if unpainted:
        print(f"no boar yet for {', '.join(unpainted)}: add it to THEMES", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
