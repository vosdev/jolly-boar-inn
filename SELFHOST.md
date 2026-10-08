# Self host instructions


## Requirements

- Linux system
- Docker
- `make`
- `git`
- A reverse proxy
- Knowledge about how to selfhost software.

## README

This repository only includes the game itself. It needs local preparation before it is playable.

Assets like NPC/Pet chatheads, sounds and other art is downloaded through `make fetch-assets`.

This can take up to 15 minutes. The `fetch-assets` script adheres to the OSRS Wiki guidelines for automated script usage, which is:

- 1 api call per second
- A mandatory User Agent describing what you are using the api for + a way to contact you

Besides assets, some questions are dynamically generated based on Grand Exchange prices. They will have to be refreshed every so often.


## Instructions

1. Make sure you have all the requirements present.

2. Clone the git repository && cd

3. `cp .env.example .env`

4. Modify `.env` accordingly to your personal setup.

5. `make fetch-assets`

6. `docker compose build`

7. `docker compose up -d`

8. Set up a reverse proxy for port 8000


## Update instructions

1. git pull
2. `make fetch-assets`
3. `make gen-price-questions`
4. `docker compose build`
5. `docker compose up -d`


## Branding

Three variables in `.env` give your instance its own name, logo and default theme:
`PUBLIC_SITE_NAME`, `PUBLIC_SITE_LOGO` and `PUBLIC_DEFAULT_THEME`, described in
[`.env.example`](.env.example). They are baked into the client, so run `docker compose build`
after changing them.