# Pet art

The pets from the OSRS Wiki's Pet page, their metamorphoses, and the cats and dogs.
`data/pets.json` lists them, in order, as `{id, name}`. Each has up to two files here, from the wiki
files `data/assets.json` names:

| File | Wiki file | Shown |
|---|---|---|
| `<id>_chathead.png` | The chathead | Large, by default |
| `<id>.png` | The inventory icon | Small, or where the chathead is missing |

The wiki files are game assets and not committed (`.gitignore`): `make fetch-assets ONLY=pets`
fetches them. A pet with neither file is drawn as the player's head.
