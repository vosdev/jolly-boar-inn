# Design

The frontend design task list. The architecture it sits on lives in
`ideas/architecture.md`; the modes it has to draw live in `ideas/games.md` and
`ideas/phase2.md`. This file does not repeat any of them — it says what the app should look
like, why, and in what order to build it.

Tasks are numbered **D1–D11** rather than continuing the T-numbers, because design work and
mode work touch almost disjoint sets of files and can land in either order. D1 is the only
task everything else waits on.

## What this document decides

1. **One inn, several rooms.** The Jolly Boar Inn palette is the identity and the default.
   Themes are a picker, not a coin flip.
2. **Tokens in layers, with a contract.** A theme may repaint the furniture. It may not
   repaint what "you got it wrong" looks like.
3. **Nobody types a name unless they want to.** A random name is filled in, not suggested.
4. **A head is not a preference.** It has to be visible to everyone else, so it cannot live
   in localStorage the way the theme does.
5. **Two sound switches, not one**, because one of them can make a round unplayable.
6. **A quiet footer**, carrying the trademark line, the GitHub link and the licence.

Open questions are collected at the end rather than scattered through, and none of them
block D1.

---

## 1. One theme or many?

You asked whether to go with one Jolly Boar Inn look or a set of themes. Three ways to
answer it:

**A. One theme, light and dark.** A single warm-tavern palette in two brightnesses. Cheapest
to build, cheapest to keep good, and it makes the app recognisable in a screenshot — every
screenshot looks like the same product. The cost is that a quiz night is a *long* sitting
and one palette for two hours is the visual equivalent of one song on repeat.

**B. A named theme picker.** Four or five palettes with OSRS place names, one of them the
default. Costs roughly one extra day over option A once the tokens exist, because a theme
becomes a block of thirty custom properties and nothing else. It is also the single best
feature for the selfhosting audience: "The Dancing Donkey Inn" wants to look different from
your instance, and a theme file is how they do that without forking CSS.

**C. A random theme per round.** Rejected, and worth saying why properly: you picked
per-player themes, so a random per-round theme is not even a shared moment — everyone's
screen changes to a *different* thing at the same time, which is the cost of the idea
without the payoff. Worse, the one thing a quiz UI must do reliably is make "which one did I
press" and "was I right" legible in half a second, and it can only do that if green means
right on every screen in the game. Moving the palette every ninety seconds moves that
anchor.

**Recommended: B, with the variety per round coming from art rather than colour.** The
theme stays where the player put it. What changes between rounds is the splash artwork and
one decorative accent used *only* on the splash card and the round chrome — never on an
answer button, never on a verdict. You get "oh, a new round, and it looks like a new place"
without the palette shifting under a question.

### The themes

| id | Name | Mood | Base | Accent |
|---|---|---|---|---|
| `jolly` | Jolly Boar Inn | Default. Oak, candlelight, spilled ale. | Warm mid-brown, cream panels | Ale amber / hearth orange |
| `polnivneach` | Pollnivneach | Bright desert noon. Bleached, high-contrast, dusty. | Sandstone, off-white panels | Terracotta, indigo shade |
| `wilderness` | Wilderness | Dark. Cold ash and ember, nothing cosy. | Near-black slate | Ember red, bone white |
| `party_room` | Party Room | Loud. Balloons, partyhats, a drop party. | Deep purple | Gold, partyhat cyan/pink |
| `auto` | Follow my device | Not a palette. Maps `prefers-color-scheme` to `jolly` / `wilderness`. | | |

`auto` is the default for a browser that has never chosen, which preserves today's
behaviour for anyone who has their phone in dark mode at a pub table.

Two warnings on `party_room`: it is the theme people will pick first and the theme most
likely to fail contrast, and it is the one theme whose accent wants to be used on everything
— which is exactly what the token contract below forbids. Build it last, after the contract
has teeth.

---

## 2. Colour: the token contract

`client/src/app.css` already has the right instinct in it. The comment on `--more` / `--less`
— that "more" and "less" are not "right" and "wrong", and must not borrow their colours —
is the whole design system in miniature. D1 generalises it.

Tokens split into seven layers. A theme may freely override layers 1, 2, 5, 6 and 7. Layers
3 and 4 are a **contract**: a theme sets them, but the values must pass a contrast check
that runs in CI.

| Layer | Tokens | Theme may change? |
|---|---|---|
| 1. Surface | `--bg` `--panel` `--panel-raised` `--line` `--ink` `--muted` | Freely |
| 2. Brand | `--accent` `--accent-ink` `--accent-hover` | Freely |
| 3. Verdict | `--ok` `--ok-ink` `--bad` `--bad-ink` `--warn` `--warn-ink` | Must pass contrast + hue check |
| 4. Semantic | `--more` `--less` | Must pass; must differ from layer 3 by hue or shape cue |
| 5. Gems | `--gem-sapphire` `--gem-emerald` `--gem-ruby` `--gem-diamond` `--gem-dragonstone` `--gem-ink` | Freely |
| 6. Shape | `--radius` `--border-width` `--shadow` `--font-display` `--font-body` `--font-numeric` | Freely |
| 7. Texture | `--texture-panel` `--texture-bg` (a local `url()` or `none`) | Freely |

Layer 6 is what makes themes feel like different places rather than different hues.
`wilderness` wants `--radius: 2px` and a hard 2px border; `jolly` wants `10px` and a soft
inner shadow like a worn tabletop; `party_room` wants a wide radius and no border at all.
That does more work than colour does.

**The check.** A script in CI parses `app.css`, walks every `[data-theme]` block, and
asserts for each: `--ok` and `--bad` reach 4.5:1 against `--panel`; `--ink` reaches 7:1
against both `--bg` and `--panel`; `--muted` reaches 4.5:1 against `--panel`; and `--ok`
and `--bad` are at least 60° apart in hue so they stay distinguishable to the ~8% of players
who will not see them as green and red. That last one is why "wrong" is drawn with a border
and a glyph as well as a colour, everywhere, without exception.

### The gem buttons and the reveal problem

Sapphire / emerald / ruby / diamond / dragonstone for multiple-choice answers is a good
idea and it has one sharp edge: **a ruby button that turns out to be the correct answer, and
an emerald button that turns out to be wrong.** If the verdict is painted as a green or red
fill, the emerald button quietly lies for the half-second before anyone reads it.

The rule that fixes it: on reveal, gem colour stops being a fill and becomes a 4px left
edge. The button's fill goes to `--panel`, the verdict goes on as a full border plus a
leading glyph (✓ / ✗) plus the points. The gem stays as identity — "I pressed the red one"
— and never competes with the verdict. Four states per button, all of which need drawing in
D8: idle, pressed-by-you-and-waiting, revealed-correct, revealed-wrong.

Gems are also ordering, not decoration: sapphire, emerald, ruby, diamond, dragonstone is
the in-game value order, so option 1 is always sapphire. Players learn the position, which
is worth more than variety.

---

## 3. Typography

Two faces, one job each.

- **Display** (`--font-display`): the OSRS-style pixel face. Headings, the logo wordmark,
  the splash mode name, the room code, the timer, and points. Nowhere else.
- **Body** (`--font-body`): what is there today — `system-ui` and friends. Every sentence a
  player actually has to read: blurbs, question prompts, answer text, settings, errors.

Pixel faces at 16px with real line-wrapping are genuinely hard to read, and the people who
struggle most are the ones already struggling. The rule "display for things you glance at,
body for things you read" gets 90% of the flavour for none of the cost.

- **Numbers** (`--font-numeric`): whatever the theme's display face is, plus
  `font-variant-numeric: tabular-nums`. Points and the countdown must not jitter as digits
  change. This is one line of CSS and it is the difference between a timer that feels solid
  and one that twitches.

Fonts must be **self-hosted** — `font-src 'self'`, no Google Fonts, see §8.

---

## 4. The top bar

Today `App.svelte` renders `<main>` and nothing else. D2 adds a shell:

```
┌──────────────────────────────────────────────────────────────┐
│ [sign] The Jolly Boar Inn      [⌥] [🔊] [🎨]  [head] Name ▾  │  56px, sticky
└──────────────────────────────────────────────────────────────┘
```

- **Left: logo + wordmark.** Both configurable (§9.4) so a selfhoster's instance is theirs.
  The wordmark hides under 26rem; the sign never does.
- **Right, in order: GitHub, sound, theme, identity.** Identity sits outermost because it is
  the one a thumb reaches for, and because it is the widest. GitHub sits innermost and at
  `--muted` — it is the only control in the bar that is not about the game, so it should
  read that way (§9.3).
- **Height 56px, `position: sticky`, `top: 0`**, with the room code appended to the wordmark
  while you are in a room — `The Jolly Boar Inn · DRAGON`. That kills the `<h1>Room {code}</h1>`
  that currently costs a whole line on every screen, and it means the code is on screen for
  a latecomer to read off someone's phone at any moment.
- **Under 26rem** GitHub collapses first, then theme and sound, into one `⋯` popover; the
  identity chip drops to just the head.

**A subtlety worth writing down:** identity in this app is per-room. A player exists because
they joined a room; there is no account. So the chip means two different things in two
places, and both are correct:

- **Outside a room** (Home, Create, Join) it shows the *local profile* — the name and head
  stored in this browser, which is what will be filled in the next time you join something.
  Clicking it edits that stored profile.
- **Inside a room** it shows the real `PlayerView` from the server. Clicking it edits the
  live player, which sends a message and updates for everyone.

The popover is the same component with two different save paths.

---

## 5. Who you are: names and heads

### 5.1 The name

**The flow.** Identity is per-room on the server, but the *profile* — the name and head
this browser will use next time — is local and permanent. That split is what lets a
returning player skip the question entirely.

```
first visit ──▶ profile empty, top bar reads "Set your name"
                     │
      ┌──────────────┴───────────────┐
      ▼                              ▼
  Create Game                    Join a room
      │                              │
  profile empty?                 profile empty?
      │ yes                          │ yes
      ▼                              ▼
  popup, blocking            (§5.1.1 — two answers, and they differ)
  — the host's name is
    read aloud and                   │ no
    anchors the room                 ▼
      │                          join straight through
      ▼
  create the room
```

The blocking popup on **Create** is right and it is free: no room exists yet, so there is
no server involved, no uniqueness check, and nothing to undo. The host's name is the one
that gets read out loud and sits at the top of the standings, so a beat to choose it is
time well spent.

#### 5.1.1 Join: gate first, or join first and rename?

You asked whether a player can land in the room as `Cow31337Killer42` and change it
afterwards. **Yes — but not with today's protocol.** `display_name` is set at join and there
is no message that changes it; `POST /api/rooms/{code}/join` is the only place a name is
ever written. So join-first needs a new websocket message.

The good news is that **D4 needs exactly the same message anyway.** Re-rolling a head has
the identical shape: a field on `players`, validated, checked, broadcast as `room_updated`.
Build one `set_profile {display_name?, avatar?}` rather than a `set_name` and a `set_avatar`,
and join-first costs nothing beyond what heads already cost.

So the two options are really "before or after `set_profile` exists":

**A. Gate the join too** (no protocol change). Same blocking popup as Create. Costs one
modal between a tapped link and the room, which is the exact moment a distracted person at a
party puts their phone down. Ships in D3 with zero server work.

**B. Join first, nudge after** (needs `set_profile`). The player is in the room in one tap,
sees the player list, sees other people arriving — and the top bar chip pulses once with
*"You're Cow31337Killer42 — tap to change."* Non-blocking, dismissible, and still there in
the lobby for as long as the lobby lasts.

**Recommended: A in D3, B in D4**, because that ordering means the join flow is never broken
and B is a strict improvement dropped on top rather than a rewrite. B is the better end
state and it is worth getting to.

One caveat for B: a player who never taps the nudge stays `Cow31337Killer42` on the
standings forever, and some fraction of a party will do that. That is fine — it is a party
game and a table of joke names is funnier than a table of real ones — but it does mean the
names in `player-names.json` have to be names you are happy to see win.

#### 5.1.2 The generator, and why it does not touch `room-words.json`

`data/room-words.json` (room codes) and `data/player-names.json` (player names) are
different corpora doing different jobs, and **neither needs revising because of the other.**

- **Room codes** want short, recognisable, shoutable nouns that survive being read across a
  noisy table — `DRAGON`, `CABBAGE`, `TINDERBOX`. A mix of items and NPCs is exactly right
  and `ideas/room-names.md` should stay as it is.
- **Player names** want *usernames* — the register of a 2007 friends list, not the register
  of an NPC roster.

That distinction also dissolves the head-mismatch problem you spotted: **it only exists if
the name list contains NPC names.** Keep the list to invented usernames and nobody is ever
called Hans while wearing a goblin's face. My earlier examples broke this rule — `Zezima`
and `Woox` are real players, `BurntLobster` is an item and belongs in the room-code list.
The right register is invented:

```
Cow31337Killer   ScapeRune77      AlchAddict      xX_Lumby_Xx      NoobSlayer
FreeArmorPlz     RangedTank       PurePkr2006     TeleportedAway   AFKFisher
DDSandPray       LostMyTrimmed    WillyTheWizard  OneHpPure        BankStander
```

Three constraints the server already imposes, which the generator has to respect:

- **1–24 characters** (`rooms/settings.py` normalisation). Base names must be ≤ 21 so the
  numeric suffix always fits.
- **No `<` or `>`**, no control characters.
- **Unique per room, case-insensitively.** Two players rolling the same base name in one
  room is a `409`, and it will happen. The client must catch it and re-roll the suffix
  automatically — up to three times — before showing an error. Without this, the
  random-name feature produces a confusing failure at exactly the moment it was supposed to
  remove friction.

One cheap nicety: when generating, skip a name that matches the room code. `CABBAGE` joining
room `CABBAGE` is not a bug, but it reads like one.

If you later want name-and-head coherence rather than mere non-contradiction, the move is to
**roll the head first and let it pick the name's register** — a goblin head draws from a
scruffier sub-list than a wizard head. That is a nice-to-have, not a requirement, and it
doubles the curation work.

Store the chosen name and head in `localStorage["jbi:profile"]`, following the existing
`jbi:` prefix and the throws-tolerant accessor pattern in `lib/session.ts`.

### 5.2 The head

This is the one that has a hidden cost, and it is worth being explicit about it: **a chat
head is not like a theme.** The theme is yours alone and lives in localStorage forever for
free. A head has to appear next to your name in *other people's* lobbies and on *their*
standings screen — so it has to travel over the wire, which means the server has to know it.

Three ways:

**A. Derived from the player id.** `PlayerView.id` is a uuid the client already has, and
`Standing.player_id` is the same uuid on the standings screen. Hash it, mod the number of
heads, done. **Zero protocol change, zero migration, zero server code**, and every client in
the room independently computes the same head for the same player. The cost is absolute: it
can never be re-rolled, because there is nothing to change.

**B. A stored field.** `0006_player_avatar.sql` adds `players.avatar smallint not null
default 0`; `display_name` gains a companion in the join and create payloads; `PlayerView`
gains `avatar`; a `set_profile` ws message updates it and broadcasts `room_updated` (the
same message that carries a rename, §5.1.1). Roughly
the size of T7. Re-rollable, which is the whole point of the feature as you described it.

**C. No heads.** A coloured tile with the first letter, tinted from the id hash. Free,
legible, and about as charming as a spreadsheet.

**Recommended: B, and design the client so A is the fallback.** `avatar` is read as
`player.avatar ?? derivedFrom(player.id)`, so the client works against a server that has not
shipped the column yet, and an old room rehydrated after the migration still has heads. That
lets D4 ship the visuals against derived heads on day one and add the column in the same
task or a later one without a second design pass.

Practical notes: **40–60 heads is the right number** — enough that a table of eight rarely
collides, few enough to curate so none of them are ugly at 32px. Render at 32px in the top
bar and lobby list, 48px on standings, and ship them as a single sprite sheet or an SVG
symbol sprite rather than 60 requests. Heads in-game are drawn at low resolution, so
`image-rendering: pixelated` and integer scaling, or they turn to mush.

---

## 6. Sound

Two independent switches, because they mean different things and one of them is
load-bearing.

| Switch | Covers | Safe to mute? |
|---|---|---|
| **Music & effects** | Splash stings, the countdown tick, the reveal chime, lobby music | Yes. Purely decorative. |
| **Question audio** | Audio that *is* the question — `ideas/games.md` has a "name that spell or spec" mode, and a music round | **No.** Muting it makes those rounds unplayable. |

The bar's speaker icon shows three states (all on / partial / all off) and opens a popover
with both switches plus a volume slider. When a player mutes **question audio**, the popover
says so plainly — *"Some rounds are audio-only. You will not be able to answer those."* —
rather than letting them find out mid-round. That is the whole reason for splitting the
switches; a single mute button cannot say this.

Three implementation facts that need to be in the task, not discovered during it:

1. **The CSP blocks audio today.** `server/app/http/headers.py` is `default-src 'none'` with
   no `media-src` directive, so every `<audio>` load fails. D6 adds `media-src 'self'` and
   nothing else.
2. **Browsers block autoplay until a user gesture.** A phone that has joined and not been
   touched since cannot play the round-start sting. The fix is free: `ideas/TODO.md` already
   wants the splash countdown replaced with a per-player **ready check**, and that tap is
   the audio unlock. Build them in the same task and the problem never exists.
3. **`prefers-reduced-motion` is the sibling setting.** Anything that pulses, counts, or
   slides gets a static fallback. It is also the honest answer to "no super splashy
   animations": pick animations that are *removable*, and the reduced-motion version is
   proof they were decoration.

---

## 7. Screens

### 7.1 The splash

Today it is a bordered box with a heading and a timer, and it already carries the comment
`<!-- Artwork for the mode goes here -->`. That is the whole task.

```
┌────────────────────────────────────────┐
│                                        │
│     [ full-bleed tavern artwork ]      │  16:9, fades at the bottom edge
│                                        │
├────────────────────────────────────────┤
│  ROUND 2 OF 5                          │  display face, --muted, 0.12em tracking
│  Drop Table                            │  display face, 2.2rem, --accent
│  Which boss drops this?                │  body face
│                                        │
│  8 questions · 15 seconds each         │  --muted
│                                        │
│  [ ✓ I'm ready ]   ●●●○●●○               │  heads, lit as people tap
└────────────────────────────────────────┘
```

**Artwork, and how much of it to commission.** Thirteen modes by the end of Phase 2 means
thirteen images if each mode gets its own, which is a lot to draw and a lot to keep
consistent. Cheaper and, I think, better: **six tavern scenes and a per-mode silhouette.**
The scenes are NPCs drinking in six different pubs — the Blue Moon, the Rusty Anchor, the
Dead Man's Chest, the Jolly Boar itself — and each mode is assigned one plus a small
foreground element that says what the round is (a coin stack for The Price is Right, a
scroll for Guess the Examine). Modes can share a scene without looking lazy, a new mode
costs one small silhouette instead of one full illustration, and the pub-crawl theme lands
harder with six pubs than with thirteen unrelated pictures.

This is also where the per-round variety from §1 goes: the scene changes, the palette does
not.

#### The ready check: two different widgets, not one

You are right to be suspicious of the full ready list on the splash. **The lobby and the
splash are asking different questions and deserve different answers.**

**In the lobby — the full list, by name.** This happens once, everyone is looking at their
phone, and the host genuinely needs to know *who* is missing before pressing Start, because
the answer is usually "Dave, who is at the bar". A name with a dim head next to it is
actionable; a number is not. This is the version worth building, and it is the one your
instinct pointed at.

There is no timer here — the host still presses Start. The list is information for a human
decision, not a mechanism.

**On the splash — heads only, no names, no list.** A round splash happens up to thirteen
times in a game. A named checklist at each one turns an eight-second beat into a social
negotiation, thirteen times, and the thing it is nagging about is smaller each time. The
light version keeps everything the mechanism is actually for:

- A row of heads, dim, lighting up as people tap. Seven heads is one line and no vertical
  space.
- It still gives the **audio unlock gesture** (§6), which is the unglamorous reason the
  ready check earns its place at all.
- "We are waiting on two people" is legible at a glance without anyone being named and
  shamed between every round.

**The 80% rule, specified.** Your instinct is right and it needs floors, or it misbehaves in
small rooms:

- **Eligible** = connected players who can answer. A disconnected player never holds up a
  round, which matters because a locked phone is the common case, not an edge case.
- **Threshold** = `ceil(0.8 × eligible)`, with a floor of `eligible - 1` for rooms of four
  or fewer. In a room of three, 80% rounds to three, and one person in the kitchen stalls
  the game; `eligible - 1` means two of three is enough.
- **Everyone ready → 3 seconds.** Enough to register that it is about to start.
- **Threshold reached → `min(10s, time left on splash_seconds)`.**

The invariant that keeps this sane: **the ready check can only ever shorten the splash,
never lengthen it.** `splash_seconds` stays the host's hard ceiling and the server stays the
single source of timing via `next_at`, exactly as §4 of `ideas/architecture.md` already has
it. Nothing about the room state machine changes — only what `next_at` gets set to.

**Motion budget: one transition.** A 200ms cross-fade into the splash, and heads lighting up
as people tap. Nothing else. The countdown is the animation.

### 7.2 The question screen

Mostly a matter of removing chrome. Today a question is a `.panel` inside a `<main>` capped
at 42rem, with an `<h1>` and a round counter above it. In play, the question should be the
only thing with any visual weight:

- The timer moves to a thin bar **under the top bar**, full width, draining left to right.
  It is glanceable without being a thing you stare at, and it frees the vertical space the
  current `Timer` block costs on a phone.
- The prompt gets `--font-body` at 1.4rem and room to breathe. Answer buttons get a minimum
  height of 56px and full width on mobile — thumb targets at a pub table, not mouse targets.
- `more_less`'s two buttons keep `--more` / `--less` and the existing reasoning.
- Answered-and-waiting is a state that lasts up to 15 seconds and currently shows one line
  of `.note`. It should show your answer held, dimmed, with a quiet "waiting for the room"
  and the count of who has answered — it is dead time and it is where people look up at each
  other, so it should reward the glance rather than punish it.

### 7.3 Standings, styled as the hiscores

The OSRS hiscores are a strong, instantly recognisable table, and the standings are the
screen everyone looks at longest.

```
 RANK          NAME                        POINTS
 ─────────────────────────────────────────────────
  1   [head]  Cow31337Killer42              8,420
  2   [head]  Zezima                        7,115
  3   [head]  BurntLobster                  6,980
```

Tabular numerals, right-aligned points, gold/silver/bronze on the top three rank numbers
only — never on the row background, which makes the rest of the table look like an error
state. `ideas/TODO.md` wants standings shown only between rounds rather than between
questions, which this screen assumes.

---

## 8. What the existing build constrains

Four hard constraints, all from the CSP in `server/app/http/headers.py`. None of them are
problems; all of them are things that will waste an afternoon if they are discovered rather
than planned for.

1. **`style-src 'self'` with no `'unsafe-inline'`.** Inline `style="..."` attributes are
   blocked — so a theme can *never* be applied by writing custom properties onto an element
   from JavaScript. Themes switch by setting `document.documentElement.dataset.theme`, with
   every palette written statically in `app.css` under `[data-theme='wilderness']`. This
   also rules out Svelte's `style:` directive for anything theme-related.
2. **`font-src 'self'`.** Self-hosted font files only. No Google Fonts, no CDN.
3. **No `media-src` at all**, so `default-src 'none'` applies and audio is blocked. §6.
4. **`img-src 'self' data:`** is fine as-is for local art and Vite's inlined assets.

And one that is not the CSP: **the theme must be set before first paint.** `main.ts` is a
module script, so it is deferred, and a naive implementation flashes the default palette
before switching. `script-src 'self'` forbids the usual inline-script fix. Mitigations, in
order of preference: set `data-theme` as the literal first statement of `main.ts` before any
import with a side effect; keep `color-scheme` on `:root` so the browser paints the right
canvas colour during the gap; and accept that the gap is one frame on a local server. Worth
one line in the D1 accept criteria so nobody ships a flash.

---

## 9. Assets, branding and the footer

### 9.1 Where the art comes from

| | Source | Committed? |
|---|---|---|
| Item and NPC renders | Game assets. Phase 3's importer fetches these anyway. | Fetched |
| NPC chat heads | Game assets, 40–60 curated. | Fetched |
| Fonts | The OSRS-style face, self-hosted. | Fetched |
| Prices, combat levels, release dates | Facts. | Committed, as `prices.json` already is |
| Logo, splash art, palettes, icons | **Original.** | Committed |

**Fetched, not committed** is an engineering call, not a legal one: `make fetch-assets`
matches the `make gen-price-questions` pattern the repo already uses, keeps the checkout
small, and Phase 3's importer needs a fetch step regardless. It also answers the open
`ideas/architecture.md` question about where assets live under a read-only container — one
mount, one decision.

**The logo and splash art are original** because that is what makes this the Jolly Boar Inn
rather than a RuneScape skin. A sign somebody drew for this app is a better mark than a game
asset with the text swapped, and it is what gives the selfhoster branding below something to
swap.

Download scripts would need to enforce a custom User Agent env variable before they can continue, according to the Wiki Terms of Use.

### 9.2 The footer

One line, small, `--muted`, on every screen:

> RuneScape and RuneScape Old School are the trademarks of Jagex Limited.

Next to it, two links: **GitHub** (`https://github.com/vosdev/jolly-boar-inn`) and the
licence. The AGPL wants a source link reachable from a network service anyway, so the footer
is where that obligation is discharged.

### 9.3 The GitHub link

- **Footer: always.** This is its real home, and it is where anyone looking for it will look.
- **Top bar: a small icon**, leftmost in the right-hand group, at `--muted` rather than
  `--ink`, so it sits behind sound, theme and identity in the visual order. It is the one
  control in the bar that is not about the game, so it should read that way.
- **On mobile** it is the first thing to collapse into the `⋯` popover, ahead of sound and
  theme.

Deliberately *not* phase-dependent. A top bar that shows different controls during a
question than between them is a bug farm for the sake of a few pixels.

The Home screen gets a third, louder mention near the tagline — an open-source party game is
a selling point to the kind of person reading the homepage, and that is the one screen with
room to say so.

### 9.4 Selfhoster branding

Three env vars, read at build time into the client: `PUBLIC_SITE_NAME` (default
`The Jolly Boar Inn`), `PUBLIC_SITE_LOGO` (a path, default the bundled sign), and
`PUBLIC_DEFAULT_THEME`. Someone's instance is *The Dancing Donkey* without a fork — which is
also the honest reason the themes are named after places rather than after this inn.

The GitHub link is **not** configurable: a fork's footer should still point at the upstream
project, and anyone who wants it to point elsewhere is editing one line.

---

## 10. The tasks

```
D1 tokens + theme engine
 ├─▶ D2 app shell / top bar ──┬─▶ D3 names + profile popover ──▶ D4 heads + set_profile
 │                            ├─▶ D5 the four themes + picker
 │                            └─▶ D6 sound switches
 ├─▶ D7 splash + ready check
 ├─▶ D8 question screens + gem buttons
 └─▶ D9 standings
        D10 selfhoster branding   (needs D2)
        D11 motion + reduced-motion pass  (last)
```

Build order for the biggest visible change soonest: **D1, D2, D5, D3.** That is the tokens,
the shell, the themes and the names — after which the app stops looking generic, and D4 and
D6–D9 are refinements on something that already has a face.

### D1. Tokens and the theme engine

The layered token set from §2 in `app.css`, the `[data-theme]` mechanism, and
`lib/theme.ts` (read, set, persist to `jbi:theme`, resolve `auto` against
`prefers-color-scheme`). No new palette: today's colours become `jolly` and today's dark
block becomes `wilderness`, unchanged, so the diff is a rename and a restructure.
`scripts/check_contrast.py` and a CI step.

**Accept:** `jolly` and `wilderness` render byte-identically to today's light and dark;
setting `data-theme` on `<html>` from DevTools repaints everything with no reload; nothing
in `client/src` sets a colour through an inline style or a `style:` directive (grep is in
the test); the contrast script fails a deliberately broken `--bad` and passes both themes;
first paint is not a flash of the wrong palette.

### D2. The app shell

`App.svelte` grows a `<TopBar>` above `<main>`: logo, wordmark, and three named slots.
Sticky, 56px, responsive collapse at 26rem. The room code moves into the wordmark and the
per-screen `<h1>Room {code}</h1>` comes out. Controls are placeholders in this task.

**Accept:** every existing screen renders under the bar with nothing clipped or double-titled;
the bar is present on Home, Create, Join and Room; at 320px wide the wordmark is hidden, the
sign is not, and there is no horizontal scroll; the sticky bar does not cover a focused input
when a mobile keyboard opens.

### D3. Names and the profile popover

`data/player-names.json` (invented usernames only, §5.1.2), `lib/names.ts` (generate,
respecting 21 chars + suffix, skipping the room code), the identity chip and popover from §4,
`jbi:profile` in localStorage, the blocking popup on Create and Join for an empty profile
(§5.1 option A), pre-filled and re-rollable name fields, and automatic suffix re-roll on a
`409` duplicate.

Client only. No server change, no migration, no protocol change.

**Accept:** a first-time browser cannot reach Create or Join without setting a name, and the
popup is pre-filled so that takes one tap; a returning browser goes Home → lobby in two taps
and is never asked again; the re-roll button changes the name without losing focus; a name
longer than 24 characters cannot be submitted; two browsers forced to the same generated
name both join successfully and end up with different names; no generated name is an NPC
name; localStorage throwing leaves the app usable for that session.

### D4. Heads, and changing your mind

`0006_player_avatar.sql`; `avatar` through create/join and `PlayerView`; one
`set_profile {display_name?, avatar?}` websocket message covering **both** the head re-roll
and the rename, validated and uniqueness-checked exactly like join, broadcast as
`room_updated`; the sprite sheet; `player.avatar ?? derivedFrom(player.id)` on the client.
Heads in the top bar, the lobby list and the standings.

With `set_profile` in place, Join switches from the blocking popup to **join-first**
(§5.1.1 option B): the player lands in the lobby as a random name and the top bar chip
nudges once, non-blocking and dismissible.

**Accept:** two browsers see each other's heads identically; re-rolling or renaming in one
updates the other within a frame of `room_updated`; a rename to a name already taken in the
room is rejected and the old name survives unchanged; a rename mid-game does not disturb
standings or an open answer; a room created before the migration shows heads for its
players; a client built before this task still plays against a server that has it; heads are
crisp, not blurred, at 32px and 48px.

### D5. The four themes and the picker

`polnivneach` and `party_room` written; `jolly` and `wilderness` extended into layers 5–7
(radius, borders, texture); the picker popover in the top bar with a live swatch per theme.

**Accept:** all four pass the D1 contrast script, `party_room` included; switching theme
mid-question does not disturb the layout or the timer; `auto` follows the OS and stops as
soon as a theme is chosen explicitly; a theme is a single contiguous block in `app.css` that
a selfhoster can copy and edit.

### D6. Sound

`media-src 'self'` in the CSP; the two switches, the volume slider, the three-state icon; the
unlock gesture wired to the ready-check tap; `lib/audio.ts` with a null implementation so the
switches work before any audio file exists.

**Accept:** with no audio assets present, both switches persist and no console error appears;
muting question audio shows the warning copy; a fresh tab that has not been tapped does not
throw an autoplay error; the CSP change is covered by the existing headers test.

### D7. Splash and the ready check

Artwork slot, the layout from §7.1, the six-scene assignment table in `lib/modes.ts`, and
the two ready widgets: the **named list in the lobby**, and the **heads row on the splash**
with the 80% rule from §7.1.

The threshold maths (`ceil(0.8 × eligible)`, floored at `eligible - 1` for rooms of four or
fewer, eligible = connected players who can answer) lives on the server next to the timer
task, and only ever moves `next_at` earlier.

**Accept:** the splash shows the scene for its mode and falls back to a default scene for a
mode this build has no entry for; the ready check never lengthens a splash beyond
`splash_seconds`; everyone ready gives 3 seconds, threshold-reached gives
`min(10s, remaining)`; a room of three with one player in the kitchen still starts; a
disconnecting player lowers the threshold rather than stalling the round; the host can still
skip; a player who joins mid-splash sees the right ready state; `splash_seconds: 0` still
skips the splash entirely; the lobby list names who is not ready and the splash does not.

### D8. Question screens

Timer as a bar under the top bar; the gem button component with its four states and the
reveal rule from §2; the waiting state; touch targets at 56px. Fixes the `ideas/TODO.md` bug
where an unanswered `more_less` question highlights a button as if it had been pressed.

**Accept:** a colour-blind simulation of the reveal is unambiguous with colour removed
entirely; a ruby button revealed correct and an emerald button revealed wrong are both
read correctly at a glance; no answer submitted shows no button as pressed; the timer bar
is accurate against `ends_at` after a 20-second phone lock; every button is reachable and
operable by keyboard with a visible focus ring.

### D9. Standings

The hiscores table from §7.3, tabular numerals, top-three treatment, heads, and the
between-rounds-only rule from `ideas/TODO.md`.

**Accept:** eight players fit on a 375px screen without truncating a 24-character name;
points do not shift horizontally as they change; ranks tie correctly per the existing
tie-break; the final standings screen and the between-rounds scoreboard share one component.

### D10. Selfhoster branding

`PUBLIC_SITE_NAME`, `PUBLIC_SITE_LOGO`, `PUBLIC_DEFAULT_THEME` through Vite into the client,
documented in `.env.example` and the README. Plus the persistent footer from §9.2 (the
trademark line, the GitHub link, the licence link) and the GitHub icon in the top bar
(§9.3).

**Accept:** an instance with all three set shows its own name, logo and default theme with no
code change; an instance with none set is identical to today; a missing logo file falls back
to the bundled sign rather than a broken image; the footer is present on every screen
including mid-question and never overlaps an answer button on a 375px screen; the GitHub
link works from both the footer and the top bar, and is the first bar item to collapse on a
narrow screen.

### D11. Motion and the reduced-motion pass

Every transition audited, a `prefers-reduced-motion` branch for each, and the animation
budget written down so it stays small.

**Accept:** with reduced motion on, nothing moves except the timer bar and it does so by
changing width without easing; no animation exceeds 250ms; no animation runs while a
question is open except the timer.

---

## Needs decision

[ ] **How many chat heads, and who picks them.** §5.2 says 40–60. Curating them is a
half-day of looking at a wiki category and it is the kind of thing that is more fun than it
sounds. It blocks the sprite sheet in D4, nothing else.

[ ] **Splash artwork: commissioned, or drawn in-house.** §7.1 asks for six scenes plus
thirteen small silhouettes. D7 can ship against placeholder blocks and have the art dropped
in later without another task, so this does not block the build — but the sooner the six
scenes exist, the sooner the modes can be assigned to them deliberately rather than
alphabetically.

[ ] **Whether the host may pin a theme for the room.** §1 chose per-player, which is the
right default. A later, small addition: the host picks a theme at creation that arrives as a
*suggestion* in the welcome frame, applied only to players who have not chosen one
themselves. That is one settings field and one client branch, and it buys back "the
Wilderness round" as a shared thing for a host who wants it. Deliberately not in D1–D11.

[ ] **Whether `party_room` should exist.** It is the most fun idea here and the most likely
to be unreadable in a dark pub. Build it last, behind the contrast check, and be willing to
cut it.

## Decided

[x] **Themes are a per-player preference in localStorage**, not a room setting. No protocol
change, no migration.

[x] **Random theme per round: no.** §1. The variety comes from splash artwork instead.

[x] **The profile is local and permanent; the player is per-room and temporary.** No
accounts. `jbi:profile` holds the name and head; the server never sees a returning player as
the same person, and does not need to. §5.1.

[x] **An empty profile blocks Create, and blocks Join until `set_profile` exists.** Then Join
becomes join-first-and-nudge. §5.1.1.

[x] **One `set_profile` message, not a `set_name` and a `set_avatar`.** Renaming and
re-rolling a head are the same operation on the same row. §5.1.1.

[x] **`player-names.json` holds invented usernames, not NPC names**, which is what stops a
player called Hans wearing a goblin's face. `room-words.json` is a separate corpus and does
not change. §5.1.2.

[x] **Chat heads need a server field**, with a derived-from-id fallback so the client works
either way. §5.2.

[x] **Two ready widgets, not one.** A named list in the lobby, a heads row on the splash. The
ready check can only ever shorten a splash, never lengthen it. §7.1.

[x] **Two sound switches**, because muting question audio can make a round unplayable. §6.

[x] **One-line trademark notice in the footer, next to the GitHub and licence links.** §9.2.

[x] **The logo, splash art, palettes and icons are original work**; game renders and heads
are fetched by `make fetch-assets` rather than committed. §9.1.

[x] **Design work is D1–D11**, independent of the T-numbers, and can interleave with Phase 2.
