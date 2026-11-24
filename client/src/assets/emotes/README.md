# Emote icons

The emote tab's icons (#771): the wiki's `<Name>_emote_icon.png` for each of the eight emotes,
as `wave.png`, `cheer.png`, `clap.png`, `laugh.png`, `think.png`, `panic.png`, `cry.png` and
`angry.png`. Until one is here, the tab shows that emote's name alone.

These are game assets, fetched rather than committed: `make fetch-assets ONLY=emotes` puts the
ones `data/assets.json` names here. Drop a file in and it is used on the next build.
