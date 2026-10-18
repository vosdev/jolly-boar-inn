"""The token contract holds, and the script that enforces it has teeth.

The palette itself is not a matter of taste the tests can judge, so what is asserted here
is the contract from section 2 of ideas/design.md: every shipped theme passes, a deliberately
broken ``--bad`` fails, a gem that looks the same lit as faded fails, washed-out scroll ink
fails, and the stylesheet stays the only place a colour is set.
"""

import re
import subprocess
import sys
from pathlib import Path

import pytest

from app.config import REPO_ROOT

SERVER_DIR = REPO_ROOT / "server"
CLIENT_SRC = REPO_ROOT / "client" / "src"
APP_CSS = CLIENT_SRC / "app.css"
sys.path.insert(0, str(SERVER_DIR / "scripts"))

import check_contrast as check  # noqa: E402


@pytest.fixture
def css() -> str:
    return APP_CSS.read_text(encoding="utf-8")


def _swap(css: str, theme: str, token: str, value: str) -> str:
    """Rewrite one token inside one theme block, leaving the other theme alone."""
    start = css.index(f"[data-theme='{theme}']")
    end = css.index("\n}", start)
    block = re.sub(rf"({re.escape(token)}:\s*)[^;]+", rf"\g<1>{value}", css[start:end])
    assert value in block, f"{token} not found in the {theme} block"
    return css[:start] + block + css[end:]


# --- the palette we ship -------------------------------------------------------------


def test_every_shipped_theme_passes(css: str) -> None:
    assert check.check(css) == []


def test_every_theme_defines_every_token(css: str) -> None:
    themes = check.parse_themes(css)
    assert set(themes) == {
        "jolly",
        "pollnivneach",
        "wilderness",
        "party_room",
        "tzhaar",
        "jungle",
        "prifddinas",
        "morytania",
    }
    for name, tokens in themes.items():
        missing = [token for token in check.REQUIRED_TOKENS if token not in tokens]
        assert missing == [], f"{name} is missing {missing}"


def test_jolly_is_the_default_and_nothing_follows_the_os(css: str) -> None:
    """A browser with no ``jbi:theme`` gets the inn, whatever its OS is set to."""
    rules = check.strip_comments(css)
    assert "prefers-color-scheme" not in rules
    jolly = rules.index("[data-theme='jolly']")
    assert ":root," in rules[:jolly], "jolly does not sit on :root, so it is not the default"


def test_theme_ids_match_the_stylesheet() -> None:
    """A picker may not offer a theme that has no block to paint."""
    theme_ts = (CLIENT_SRC / "lib" / "theme.ts").read_text(encoding="utf-8")
    listed = re.search(r"THEMES = \[(.*?)\]", theme_ts, re.DOTALL)
    assert listed is not None
    ids = re.findall(r"'([\w-]+)'", listed.group(1))
    assert ids, "THEMES is empty"
    assert set(ids) == set(check.parse_themes(APP_CSS.read_text(encoding="utf-8")))
    # A selfhoster may set another default, but anything unknown falls back to :root's.
    assert re.search(r"return isTheme\(configured\) \? configured : 'jolly'", theme_ts)


# --- the script has teeth ------------------------------------------------------------


def test_a_broken_bad_fails(css: str) -> None:
    """--bad the colour of the panel it sits on: invisible, and caught."""
    broken = _swap(css, "wilderness", "--bad", "#221e18")
    problems = check.check(broken)
    assert any("--bad" in line and "--panel" in line for line in problems)


def test_a_gem_that_looks_the_same_faded_fails(css: str) -> None:
    """Lit against faded is the reveal. Diamond on jolly's cream panel is why."""
    broken = _swap(css, "pollnivneach", "--gem-red-topaz", "#e4f0f5")
    problems = check.check(broken)
    assert any("--gem-red-topaz" in line and "look alike" in line for line in problems)


def test_gem_ink_that_cannot_be_read_on_a_faded_gem_fails(css: str) -> None:
    """A faded option still has to be read. Dark ink on a dark panel's fade does not."""
    broken = _swap(css, "wilderness", "--gem-ink", "#3a3330")
    problems = check.check(broken)
    assert any("--gem-ink" in line and "faded" in line for line in problems)


def test_washed_out_scroll_ink_fails(css: str) -> None:
    """A prompt on the scroll is read against the clock, so it gets the body 7:1."""
    broken = _swap(css, "pollnivneach", "--scroll-ink", "#9c8a66")
    problems = check.check(broken)
    assert any("--scroll-ink" in line and "--scroll-paper" in line for line in problems)


def test_scroll_muted_that_cannot_be_read_fails(css: str) -> None:
    broken = _swap(css, "wilderness", "--scroll-muted", "#b09c6c")
    problems = check.check(broken)
    assert any("--scroll-muted" in line and "--scroll-paper" in line for line in problems)


def test_a_scroll_the_colour_of_the_panel_fails(css: str) -> None:
    """Paper that matches the panel is just another panel, not a scroll laid on it."""
    broken = _swap(css, "pollnivneach", "--scroll-paper", "#f4f1e6")
    problems = check.check(broken)
    assert any("--scroll-paper" in line and "--panel" in line for line in problems)


def test_ok_and_bad_of_the_same_hue_fail(css: str) -> None:
    """Green and red is not the cue; the 60 degrees between them is."""
    broken = _swap(css, "wilderness", "--bad", "#5fae6f")
    problems = check.check(broken)
    assert any("degrees apart" in line for line in problems)


def test_a_missing_token_fails(css: str) -> None:
    """Dropping it from the default theme drops it from every theme that inherits it."""
    broken = css.replace("  --gem-zenyte: #f4bc6e;\n", "")
    assert any("jolly: --gem-zenyte is not defined" in line for line in check.check(broken))
    assert not any("wilderness: --gem-zenyte" in line for line in check.check(broken))


def test_a_token_that_is_not_a_colour_fails(css: str) -> None:
    broken = _swap(css, "wilderness", "--ok", "rebeccapurple")
    assert any("not a hex colour" in line for line in check.check(broken))


def test_page_ink_that_cannot_be_read_on_the_page_fails(css: str) -> None:
    """The panel ink passing says nothing about the page: jolly's page is a dark floor."""
    broken = _swap(css, "wilderness", "--bg-ink", "#3a3534")
    assert any("--bg-ink" in line and "--bg" in line for line in check.check(broken))


def test_a_remote_texture_fails(css: str) -> None:
    """The CSP would refuse it; the check refuses it first."""
    broken = _swap(css, "wilderness", "--texture-bg", "url('https://example.com/ash.png')")
    assert any("--texture-bg points off this server" in line for line in check.check(broken))


def test_a_texture_that_is_not_a_url_fails(css: str) -> None:
    broken = _swap(css, "wilderness", "--texture-bg", "linear-gradient(red, blue)")
    assert any("neither none nor a url()" in line for line in check.check(broken))


def test_a_stylesheet_with_no_theme_is_an_error() -> None:
    with pytest.raises(check.CssError):
        check.parse_themes(":root { --ok: #2f6b3a; }")


def test_the_script_runs_from_the_command_line(tmp_path: Path, css: str) -> None:
    ok = subprocess.run(
        [sys.executable, "scripts/check_contrast.py"], cwd=SERVER_DIR, capture_output=True
    )
    assert ok.returncode == 0, ok.stderr.decode()

    broken_css = tmp_path / "app.css"
    broken_css.write_text(_swap(css, "wilderness", "--bad", "#221e18"), encoding="utf-8")
    failed = subprocess.run(
        [sys.executable, "scripts/check_contrast.py", str(broken_css)],
        cwd=SERVER_DIR,
        capture_output=True,
    )
    assert failed.returncode == 1
    assert b"FAILED" in failed.stderr


# --- colour lives in app.css, nowhere else -------------------------------------------

# `style-src 'self'` blocks a style attribute outright, and a theme that can be overridden
# from a component is not a theme. Layout in a `style:` directive is fine — the timer bar's
# width is not a colour — so what is banned is the property, not the directive.
COLOUR_PROPERTIES = frozenset(
    {
        "color",
        "background",
        "background-color",
        "background-image",
        "border",
        "border-color",
        "border-top-color",
        "border-right-color",
        "border-bottom-color",
        "border-left-color",
        "outline",
        "outline-color",
        "box-shadow",
        "text-shadow",
        "text-decoration-color",
        "caret-color",
        "accent-color",
        "fill",
        "stroke",
    }
)
INLINE_STYLE = re.compile(r"""(?<![\w-])style\s*=\s*["']([^"']*)["']""")
STYLE_DIRECTIVE = re.compile(r"(?<![\w-])style:([\w-]+)")
HEX_COLOUR = re.compile(r"#[0-9a-fA-F]{3,8}\b")


def test_no_colour_is_set_outside_the_stylesheet() -> None:
    offenders: list[str] = []
    for path in sorted(CLIENT_SRC.rglob("*")):
        if not path.is_file() or path.suffix not in {".svelte", ".ts", ".js", ".html"}:
            continue
        source = path.read_text(encoding="utf-8")
        where = path.relative_to(REPO_ROOT)
        for declarations in INLINE_STYLE.findall(source):
            properties = {
                part.split(":", 1)[0].strip().lower()
                for part in declarations.split(";")
                if ":" in part
            }
            if properties & COLOUR_PROPERTIES or HEX_COLOUR.search(declarations):
                offenders.append(f'{where}: style="{declarations}"')
        for prop in STYLE_DIRECTIVE.findall(source):
            if prop.lower() in COLOUR_PROPERTIES:
                offenders.append(f"{where}: style:{prop}")
    assert offenders == [], "colour belongs in app.css: " + "; ".join(offenders)


def test_components_do_not_hardcode_hex_colours() -> None:
    """A hex colour in a component is a token that was never added."""
    offenders = [
        f"{path.relative_to(REPO_ROOT)}: {match}"
        for path in sorted(CLIENT_SRC.rglob("*.svelte"))
        for match in HEX_COLOUR.findall(path.read_text(encoding="utf-8"))
    ]
    assert offenders == [], "use a token: " + "; ".join(offenders)
