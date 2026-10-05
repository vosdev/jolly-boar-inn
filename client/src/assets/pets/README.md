# Pet icons

The pets from the OSRS Wiki's Pet page and its Metamorphosis list, as inventory icons, plus the
cats and dogs. `data/pets.json` lists them, in order, as `{id, name}`; each is `<id>.png` here, from
the wiki file `data/assets.json` names for it. The wiki files are game assets and not committed
(`.gitignore`): `make fetch-assets ONLY=pets` fetches them. A pet with no file is drawn as the
player's head.
