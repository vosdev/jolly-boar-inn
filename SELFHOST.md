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

4. Modify `.env` accordingly to your personal setup. At minimum:
    - `PUBLIC_BASE_URL`
    - `POSTGRES_PASSWORD`
    - `WIKI_USER_AGENT`
    - `FORWARDED_ALLOW_IPS` if you use a reverse proxy

5. `make all`: fetches the assets, generates the price questions and builds the images

6. `docker compose up -d`

7. Set up a reverse proxy for port 8000

## Update instructions

1. git pull
2. `make all`
3. `docker compose up -d` once no games are running: it restarts the app

## Branding

Four variables in `.env` give your instance its own name, logo, host and default theme:
`PUBLIC_SITE_NAME`, `PUBLIC_SITE_LOGO`, `PUBLIC_HERO_NAME` and `PUBLIC_DEFAULT_THEME`, described in
[`.env.example`](.env.example). They are baked into the client, so run `docker compose build`
after changing them.


## Profiling

Set `PYROSCOPE_SERVER_ADDRESS` in `.env` to send CPU profiles to Pyroscope or Grafana Cloud
Profiles, so a lag spike traces to the code behind it. Unset, nothing runs. Basic auth and a
tenant id are optional, see [`.env.example`](.env.example). Profiles carry the app version only,
no room, name or address.
