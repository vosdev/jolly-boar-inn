"""The themes, each one block a selfhoster can copy.

This reads the stylesheet. The contract itself — all three themes passing the token contract —
is ``test_check_contrast.py``'s ``test_every_shipped_theme_passes``, and the picker is
``SettingsMenu.test.ts``'s.

What a browser confirmed, and a test cannot: the arrow keys walk the list; switching
through all three mid-question leaves every button, panel and top bar control at the same
position and size to the pixel, the question's elements are the same DOM nodes
afterwards, and the timer counts on without a jump; at 320px the popover fits the screen
and nothing scrolls sideways; every piece of visible text on Home (picker open), Create, a
live question and its reveal reaches 4.5:1 against the colour actually behind it, in all
three themes.
"""

import re
import sys

from app.config import REPO_ROOT
from tests.client_source import CLIENT_SRC, read

APP_CSS = CLIENT_SRC / "app.css"
THEME_TS = CLIENT_SRC / "lib" / "theme.ts"
sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import check_contrast as check  # noqa: E402

THEME_BLOCK = re.compile(r"([^{}]*\[data-theme=['\"]?([\w-]+)['\"]?\][^{}]*)\{([^{}]*)\}")


def theme_blocks() -> list[tuple[str, dict[str, str]]]:
    """Every rule that names a theme, in stylesheet order, with its own declarations only."""
    rules = check.strip_comments(read(APP_CSS))
    return [
        (name, dict(re.findall(r"(--[\w-]+)\s*:\s*([^;]+)", body)))
        for _, name, body in THEME_BLOCK.findall(rules)
    ]


def listed_themes() -> list[str]:
    listed = re.search(r"THEMES = \[(.*?)\]", read(THEME_TS), re.DOTALL)
    assert listed is not None
    return re.findall(r"'([\w-]+)'", listed.group(1))


# --- the themes ----------------------------------------------------------------------


def test_the_eight_themes_in_menu_order() -> None:
    """Each theme after the first three was built against the contract on its own, and is
    cut if it ever fails; the newest come last."""
    assert listed_themes() == [
        "jolly",
        "pollnivneach",
        "wilderness",
        "party_room",
        "tzhaar",
        "jungle",
        "gauntlet",
        "morytania",
    ]


def test_each_theme_is_one_contiguous_block() -> None:
    """A selfhoster copies one block, not a block and the three rules that patch it."""
    names = [name for name, _ in theme_blocks()]
    assert sorted(names) == sorted(set(names)), f"a theme is split across rules: {names}"


def test_each_theme_block_stands_on_its_own() -> None:
    """Every token, in the block itself, with nothing inherited from :root or a neighbour.

    That is what makes a copied block complete, and it is what the picker's live swatches
    need: a swatch is an element carrying ``data-theme``, and anything its block leaves
    out would be drawn in the page's theme instead of the swatch's.
    """
    for name, tokens in theme_blocks():
        missing = [token for token in check.REQUIRED_TOKENS if token not in tokens]
        assert missing == [], f"{name} leans on another block for {missing}"


def test_each_theme_says_whether_it_is_light_or_dark() -> None:
    """So the browser paints the right canvas in the frame before main.ts runs."""
    rules = check.strip_comments(read(APP_CSS))
    for _, name, body in THEME_BLOCK.findall(rules):
        assert re.search(r"color-scheme:\s*(light|dark)", body), f"{name} has no color-scheme"


def test_layers_five_to_seven_differ_between_themes() -> None:
    """Section 2: shape does more to make a theme a different place than colour does."""
    blocks = dict(theme_blocks())
    for token in ("--radius", "--shadow", "--texture-bg"):
        values = {blocks[name][token].strip() for name in blocks}
        assert len(values) == len(blocks), f"{token} is the same in two themes"
    assert blocks["wilderness"]["--border-width"].strip() == "2px"
    assert blocks["wilderness"]["--radius"].strip() == "2px"


def test_every_texture_is_a_file_that_exists() -> None:
    for name, tokens in theme_blocks():
        for token in check.TEXTURE:
            value = tokens[token].strip()
            if value == "none":
                continue
            url = re.fullmatch(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", value)
            assert url is not None, f"{name}: {token} is {value!r}"
            assert (APP_CSS.parent / url.group(1)).is_file(), f"{name}: {url.group(1)} is missing"


def test_a_thicker_edge_never_moves_the_layout() -> None:
    """Wilderness draws 2px edges and the others 1px, and a player can switch mid-question.

    Every themed border in the shared rules takes the difference off its padding, so a
    switch never shifts a button under somebody's thumb.
    """
    rules = check.strip_comments(read(APP_CSS))
    assert "--border-give: calc(var(--border-width) - 1px)" in rules
    for selector in (".panel", "button", ".banner"):
        body = re.search(rf"(?m)^{re.escape(selector)} \{{([^}}]*)\}}", rules)
        assert body is not None, selector
        assert "var(--border-width)" in body.group(1)
        assert "var(--border-give)" in body.group(1), f"{selector} grows with its border"


def test_a_focused_button_draws_a_ring_in_every_theme() -> None:
    """Every button is operable by keyboard with a visible focus ring. The reach is
    ``GemChoices.test.ts``'s; the ring is this rule, in the theme's own accent."""
    rules = check.strip_comments(read(APP_CSS))
    body = re.search(r"button:focus-visible\s*\{([^}]*)\}", rules)
    assert body is not None
    assert re.search(r"outline:\s*[1-9]\d*px solid var\(--accent\)", body.group(1))


def test_page_text_and_panel_text_take_different_inks() -> None:
    """Jolly puts cream panels on a dark floor, and no one ink reads on both.

    ``main`` swaps to the page inks; every surface inside it takes the panel inks back.
    """
    rules = check.strip_comments(read(APP_CSS))
    assert "--surface-ink: var(--ink)" in rules
    main = re.search(r"(?m)^main \{([^}]*)\}", rules)
    assert main is not None
    assert "--ink: var(--bg-ink)" in main.group(1)
    assert "--muted: var(--bg-muted)" in main.group(1)
    surfaces = re.search(r"(?m)^\.panel,\n\.surface,\n\.banner,\ndialog \{([^}]*)\}", rules)
    assert surfaces is not None, "the surfaces no longer take the panel inks back"
    assert "--ink: var(--surface-ink)" in surfaces.group(1)
    controls = re.search(r"(?m)^main button,\nmain input,\nmain select \{([^}]*)\}", rules)
    assert controls is not None
    assert "--ink: var(--surface-ink)" in controls.group(1)
    # A field is always on a panel, and --bg may be the dark floor.
    field = re.search(r"(?m)^input\[type='text'\],\n[^{]*\{([^}]*)\}", rules)
    assert field is not None
    assert "background: var(--panel-raised)" in field.group(1)


def test_the_panel_texture_is_a_band_along_the_top() -> None:
    rules = check.strip_comments(read(APP_CSS))
    panel = re.search(r"(?m)^\.panel \{([^}]*)\}", rules)
    assert panel is not None
    assert "background-repeat: repeat-x" in panel.group(1)


# --- tzhaar --------------------------------------------------------------------------

# Machado, Oliveira and Fernandes (2009) at full severity, applied to linear RGB.
DICHROMACY = {
    "protanopia": (
        (0.152286, 1.052583, -0.204868),
        (0.114503, 0.786281, 0.099216),
        (-0.003882, -0.048116, 1.051998),
    ),
    "deuteranopia": (
        (0.367322, 0.860646, -0.227968),
        (0.280085, 0.672501, 0.047413),
        (-0.011820, 0.042940, 0.968881),
    ),
    "tritanopia": (
        (1.255528, -0.076749, -0.178779),
        (-0.078411, 0.930809, 0.147602),
        (0.004733, 0.691367, 0.303900),
    ),
}


def simulate(
    rgb: tuple[int, int, int], matrix: tuple[tuple[float, ...], ...]
) -> tuple[int, int, int]:
    """``rgb`` as a dichromat sees it."""
    linear = [check._channel(value) for value in rgb]
    seen = [
        min(max(sum(m * v for m, v in zip(row, linear, strict=True)), 0.0), 1.0) for row in matrix
    ]
    encoded = [12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055 for v in seen]
    r, g, b = (round(255 * v) for v in encoded)
    return (r, g, b)


def colour(theme: str, token: str) -> tuple[int, int, int]:
    rgb = check._rgb(dict(theme_blocks())[theme][token].strip())
    assert rgb is not None, f"{theme} {token}"
    return rgb


def test_tzhaar_keeps_wrong_apart_from_lava_with_colour_blindness_simulated() -> None:
    """Red means wrong, and the lava accent is the colour most likely to blur into it."""
    bad, accent = colour("tzhaar", "--bad"), colour("tzhaar", "--accent")
    for name, matrix in DICHROMACY.items():
        gap = check.delta_e(simulate(bad, matrix), simulate(accent, matrix))
        assert gap >= check.MIN_FADE_DELTA_E, f"{name}: --bad and --accent only {gap:.1f} apart"


def test_tzhaar_is_not_the_wilderness_twice() -> None:
    """Both are near-black, so the floor alone barely differs: the lava accent and the
    cracks under it tell them apart, and the edge only has to stay warm rock, not grey."""
    floors = {
        token: check.delta_e(colour("tzhaar", token), colour("wilderness", token))
        for token in ("--bg", "--panel", "--line", "--accent")
    }
    assert floors["--bg"] >= 5
    assert floors["--panel"] >= 12
    assert floors["--line"] >= 15
    assert floors["--accent"] >= 15


# --- jungle, gauntlet, morytania ------------------------------------------------------


def test_the_gauntlet_is_not_toktz_or_morytania_again() -> None:
    """All three are dark; the Gauntlet's floor is a cold navy and its accent the crystal's
    cyan, where Toktz is warm and Morytania green."""
    assert check.luminance(colour("gauntlet", "--bg")) < check.luminance(
        colour("gauntlet", "--bg-ink")
    )
    assert 190 <= check.hue(colour("gauntlet", "--bg")) <= 230
    for other in ("tzhaar", "morytania"):
        gaps = {
            token: check.delta_e(colour("gauntlet", token), colour(other, token))
            for token in ("--bg", "--panel", "--accent")
        }
        assert gaps["--bg"] >= 10, (other, gaps)
        assert gaps["--accent"] >= 30, (other, gaps)


def test_the_jungle_is_the_light_one() -> None:
    """Sunlit grass, unlike the swamp's dark water: the floor is lighter than its own ink."""
    assert check.luminance(colour("jungle", "--bg")) > check.luminance(colour("jungle", "--bg-ink"))
    assert check.luminance(colour("morytania", "--bg")) < check.luminance(
        colour("morytania", "--bg-ink")
    )


def test_morytania_is_not_the_wilderness_twice() -> None:
    """Both are dark; the swamp's teal water and its moonlit accent tell them apart."""
    gaps = {
        token: check.delta_e(colour("morytania", token), colour("wilderness", token))
        for token in ("--bg", "--panel", "--accent")
    }
    assert gaps["--bg"] >= 15
    assert gaps["--panel"] >= 8
    assert gaps["--accent"] >= 30


def test_the_crack_texture_tiles_on_all_four_edges() -> None:
    """A crack that leaves the tile on one side comes back in on the other."""
    svg = read(APP_CSS.parent / "assets" / "textures" / "tzhaar-cracks.svg")
    size = int(re.search(r'viewBox="0 0 (\d+) \1"', svg).group(1))  # type: ignore[union-attr]
    for d in re.findall(r' d="([^"]+)"', svg):
        paths = {
            tuple(tuple(int(n) for n in point.split()) for point in sub.split("L"))
            for sub in d.split("M")
            if sub
        }
        for path in paths:
            xs = [x for x, _ in path]
            ys = [y for _, y in path]
            for dx, dy, out in (
                (size, 0, min(xs) < 0),
                (-size, 0, max(xs) > size),
                (0, size, min(ys) < 0),
                (0, -size, max(ys) > size),
            ):
                if out:
                    twin = tuple((x + dx, y + dy) for x, y in path)
                    assert twin in paths, f"a crack leaves the tile and never comes back: {path[0]}"
