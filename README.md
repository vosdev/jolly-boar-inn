# jolly-boar-inn
Quiz night at the Jolly Boar Inn!

The version is in [`VERSION`](VERSION). Each release is a `v<version>` git tag, created by
CI on main, and `make image` builds `jolly-boar-inn:<version>` locally.

The NPC and trophy art is fetched, not committed. Set `WIKI_USER_AGENT` in `.env` and run
`make fetch-assets` before `make image` or `docker compose build`, which bundle what is on disk.
It runs in a container, like every script that writes data, so it needs only git, docker and make.

## Branding

Three variables in `.env` give your instance its own name, logo and default theme:
`PUBLIC_SITE_NAME`, `PUBLIC_SITE_LOGO` and `PUBLIC_DEFAULT_THEME`, described in
[`.env.example`](.env.example). They are baked into the client, so run `docker compose build`
after changing them. The footer's GitHub link always points here.

## License

The code is licensed under the [GNU AGPL v3](LICENSE). You can host it for your clan as is; if you
run a modified version for other people, you must offer them its source.

Old School RuneScape and its content (item names, examine texts, NPCs and other game material in
`data/`) are © Jagex Ltd and are not covered by this license. They are used under Jagex's fan
content policy. Material fetched from the [OSRS Wiki](https://oldschool.runescape.wiki) is under
CC BY-NC-SA 3.0. This project is not affiliated with or endorsed by Jagex.
