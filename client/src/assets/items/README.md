# Item icons

The wiki's inventory icon for each item on the roster, `data/popular-items.json`, or named by a
pack question, as `<id>.png`, from the wiki file `data/assets.json` names. The Price is Right shows one under its question, and
More or Less one on each button. An item with no file shows its name alone.

A question's picture is never one of these files: it is a detail render under a random name
(`build_pictures.py`), so its bytes never match an icon whose bundled name is its item id.

The wiki files are game assets and not committed (`.gitignore`): `make fetch-assets ONLY=items`
fetches them.
