"""D5 Accept: three themes, each one block a selfhoster can copy, and a picker that offers
exactly those.

Like ``test_check_contrast.py`` and ``test_app_shell.py``, this reads the stylesheet and the
components rather than rendering them. The contract itself — all three themes passing the
D1 check — is ``test_check_contrast.py``'s ``test_every_shipped_theme_passes``.

What a browser confirmed, and a test here cannot: with no ``jbi:theme`` the picker shows
jolly ticked; picking a theme repaints at once and survives a reload; the arrow keys walk
the list; switching through all three mid-question leaves every button, panel and top bar
control at the same position and size to the pixel, the question's elements are the same
DOM nodes afterwards, and the timer counts on without a jump; at 320px the popover fits
the screen and nothing scrolls sideways; every piece of visible text on Home (picker open),
Create, a live question and its reveal reaches 4.5:1 against the colour actually behind it,
in all three themes.
"""

import re
import sys
from pathlib import Path

from app.config import REPO_ROOT

CLIENT_SRC = REPO_ROOT / "client" / "src"
APP_CSS = CLIENT_SRC / "app.css"
THEME_TS = CLIENT_SRC / "lib" / "theme.ts"
PICKER = CLIENT_SRC / "components" / "ThemePicker.svelte"
APP_SVELTE = CLIENT_SRC / "App.svelte"
sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import check_contrast as check  # noqa: E402

THEME_BLOCK = re.compile(r"([^{}]*\[data-theme=['\"]?([\w-]+)['\"]?\][^{}]*)\{([^{}]*)\}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


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


# --- the three themes ----------------------------------------------------------------


def test_the_three_themes_and_not_party_room() -> None:
    """party_room is D12, built against the contract on its own and cut if it cannot pass."""
    assert listed_themes() == ["jolly", "pollnivneach", "wilderness"]


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


# --- the picker ----------------------------------------------------------------------


def test_the_picker_is_in_the_theme_slot() -> None:
    app = read(APP_SVELTE)
    slot = re.search(r"\{#snippet theme\(\)\}(.*?)\{/snippet\}", app, re.DOTALL)
    assert slot is not None
    assert "<ThemePicker" in slot.group(1)


def test_the_picker_offers_exactly_the_stylesheets_themes() -> None:
    """One entry per THEMES id, which test_check_contrast holds to app.css, and nothing more."""
    picker = read(PICKER)
    assert re.search(r"\{#each THEMES as theme", picker)
    assert picker.count('type="radio"') == 1, "an entry the THEMES loop does not draw"
    assert set(listed_themes()) == set(check.parse_themes(read(APP_CSS)))
    labels = re.search(r"THEME_LABELS[^=]*=\s*\{(.*?)\n\}", read(THEME_TS), re.DOTALL)
    assert labels is not None
    assert re.findall(r"^\s*(\w+):", labels.group(1), re.MULTILINE) == listed_themes()


def test_there_is_no_follow_my_device_entry() -> None:
    for source in (read(PICKER), read(THEME_TS)):
        code = re.sub(r"/\*.*?\*/|<!--.*?-->|//[^\n]*", "", source, flags=re.DOTALL)
        assert "prefers-color-scheme" not in code
        assert "matchMedia" not in code
        assert "'auto'" not in code


def test_a_browser_that_never_chose_sees_jolly_selected() -> None:
    """The picker starts from getTheme(), which answers jolly when nothing is stored."""
    picker = read(PICKER)
    assert re.search(r"let current = \$state<Theme>\(getTheme\(\)\)", picker)
    assert "checked={theme === current}" in picker
    assert re.search(r"return isTheme\(stored\) \? stored : DEFAULT_THEME", read(THEME_TS))


def test_each_swatch_is_drawn_in_its_own_theme() -> None:
    assert re.search(r'class="swatch" data-theme=\{theme\}', read(PICKER))
