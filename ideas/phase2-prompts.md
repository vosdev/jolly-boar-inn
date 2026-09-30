# Phase 2 prompts

One prompt per session, pasted into a fresh session at the repo root. CLAUDE.md applies to every
session and is the only standing instruction. A prompt names its task in `ideas/phase2.md`, which
holds the spec and the accept criteria, and adds only what the spec does not say: traps, where to
stop and ask, and what to report.

Run the sessions in the order below; each assumes the ones before it landed. A grouped session does
its tasks in the order given, one at a time, each on its own branch and PR. If it runs long, it stops
after a whole task, never halfway, and reports per task.

## T31 + T32 + T34. Loose ends, six options, and the wiki's rules

done

## T33. Limits that mean one client, and IPv6

```text
Task T33 in ideas/phase2.md. The server half has landed; read server/app/http/ratelimit.py and
forwarded.py to see it, and change neither unless the task needs it. Do not start trusting
X-Forwarded-For yourself: that is a bypass, not a fix. For the manual IPv6 check, say exactly
what you ran.
```

## T23. The facts importer

```text
Task T23 in ideas/phase2.md. If server/scripts/wiki.py does not exist, T34 has not landed:
stop and say so.

Read ideas/plan.md "Wiki data" and ideas/architecture.md §12, then
server/scripts/gen_price_questions.py: this script should feel like its sibling (offline file
flags, deterministic output, never at startup or in CI).

The field set per file is yours to decide. State it in the module docstring, and name fields for
what they are, not for the endpoint they came from: T25–T28 read them. Nothing in app/ imports
this script.
```

## T24. `make gen-packs`, and the reproducibility gate

```text
Task T24 in ideas/phase2.md. The gate is the point of the task; the refactor is incidental.

- Keep data/examines.json hand-written. Nothing may regenerate it from facts.
- Dropping the gen-*-questions make targets or keeping them as aliases is your call; say which.
  If gen-examine-questions goes, update CLAUDE.md's command for it in the same PR.
- Show CHECK=1 failing on a one-line generator change, and name the pack it reported.
```

## T25. Bestiary and Drop Table

```text
Task T25 in ideas/phase2.md. Read ideas/games.md on "Which boss drops this" first: it names the
trap the task is about.

- The optional subject on multiple_choice is a schema change. Propose its shape and wait for my
  answer before building on it.
- Assert the distractor band in a test; do not eyeball it.
- Both modes need their MODES entries, lib/modes.ts copy, stems, and hosts per design D14. If
  a host is not yet chosen in design.md's "Needs decision", ask.
```

## T26. Odd One Out

```text
Task T26 in ideas/phase2.md. Which properties are in scope decides what players are asked, so
propose the list, with the words the reveal would use for each, and wait for my answer before
generating. Then record it in the generator's docstring.

Check every property in the facts file before emitting a question, not only the one it is
about. Report the candidate and surviving quartet counts; do not chase a fixed number.
```

## T27. Ordering, and Release Order

```text
Task T27 in ideas/phase2.md. Read ideas/architecture.md §4 on ordering first: getting rank
against answer wrong makes the mode unfair, not merely wrong.

- Ordering.svelte needs a non-drag path (up/down controls or tap-to-swap), because half the
  players are on a phone. Say how you checked one-thumb use at 375px.
- The reveal's "3 of 5" comes from PlayerResult.credit, not from recomputing on the client.
- Respect T32's shared choice cap.
```

## T28. Sort It Out

```text
Task T28 in ideas/phase2.md. Read ideas/games.md "Knowledge sort" for where the mode came from.
Give data/facts/sequences.json a schema of its own and validate it in CI. Verify the last
accept criterion by playing, and say what each splash and prompt said.
```

## T29. Who Said That? and Clipped

```text
Task T29 in ideas/phase2.md. The Gnome Child hosts Clipped (design.md "Needs decision"); ask
for Who Said That?'s host. Check every entry by hand for a quote two of its options could have
said, and say you did. Then follow AUTHORING.md yourself from a blank file, and fix whatever
was unclear.
```

## T30. The custom-question editor

```text
Task T30 in ideas/phase2.md. Client only; the server does not change. Read every limit from
schema/question.schema.json instead of retyping it. Show each limit's message next to its
field. Manual: create a room with two custom questions, one naming its NPC, play it, and say
who asked what.
```

## T35 + T37. Invite links, and "someone is picking a name…"

Both touch Join, the lobby and `room_updated`, so one session reads that code once.

```text
Tasks T35 and T37 in ideas/phase2.md, in that order.

T35:
- The key is a column, not a setting: settings reach every player.
- Join replaceStates the fragment away once joined. Compare keys in constant time.
- Add the key to ideas/architecture.md §6, "What the server withholds".
- Say in the Lobby component's docstring that rotating the key is the room lock, so nobody adds
  a separate one.

T37: read how ready works first (server/app/rooms/ready.py, PlayerView, the ready message) and
copy its shape. A popover held open longer than 60 seconds re-sends on a timer.
```

## T38 + T36. Hidden rounds, then public lobbies

T38 first, so the public listing hides round names from its first commit. Needs T35.

```text
Tasks T38 and T36 in ideas/phase2.md, in that order.

T38: settings.hide_rounds reads with a default, so stored rooms still load. Check what
OpenQuestion carries for a random event inside a hidden round: it must not leak the round's
mode.

T36: an empty public list shows nothing, not an empty box. Document PUBLIC_ROOMS in
.env.example, including that a public instance keeps it off until Phase 4.
```

## T39. Finished rooms go home with the players

```text
Task T39 in ideas/phase2.md. Every jbi:history accessor tolerates localStorage throwing, as
lib/session.ts does. The FINISHED_ROOM_GRACE_MINUTES docstring says what the grace is for, so
nobody sets it to zero thinking it is free.
```

## T40. One menu in the top bar

```text
Task T40 in ideas/phase2.md. Read ideas/design.md §5 (the bar), §6 (identity) and §7 (sound)
first. The profile popover keeps both save paths: the local profile outside a room,
set_profile inside. No inline styles and no style: directive (design.md §13). Prove the emblem
swap by dropping in one file.
```

## T41. The TzHaar theme

```text
Task T41 in ideas/phase2.md. Needs T40. Read ideas/design.md §1 and §2 first, and add the theme
to §1's table. If a screenshot of tzhaar and one of wilderness cannot be told apart, the task
has failed even with every check green. Say which colour-blindness simulation you used, and put
the ΔE figures and both screenshots side by side in your summary.
```

## T44 + T45. Metrics, and the admin view

```text
Tasks T44 and T45 in ideas/phase2.md, in that order.

T44: one module, app/stats.py, owns the metric names as constants; no string literals at the
call sites. The column-set test's docstring says why no IP, name, code or player id may be
added.

T45: nothing links to /admin. Read ideas/architecture.md §10 first: the token rides in a
fragment for the reason that section keeps tokens out of URLs.
```

## T43. README

```text
Task T43 in ideas/phase2.md, written after T33, T34, T44 and T45. Match this repo's prose:
plain, specific, and explaining why where a reader would ask. Write a test that every make
target and env var the README names exists. Then follow it from a fresh clone in a scratch
directory, and list what tripped you up and how you fixed the README for it.
```

## T46. `make fetch-assets`

```text
Task T46 in ideas/phase2.md. Read server/scripts/wiki.py, client/src/lib/npcs.ts, trophies.ts and
the two READMEs under client/src/assets/ first: the file names they expect are the contract.

I have not checked the wiki titles. Look each one up (the wiki's File: pages) before it goes in
data/assets.json, and say which host or event NPC has more than one chathead so I can pick. Never
run the script against the live wiki without WIKI_USER_AGENT, and never commit a fetched file.
```

## After T45

- **Phase 3** is the asset pipeline, then Who's That NPC? and Pixel Hunt: two stems and a
  generator each, since `pick_from_list`, its combobox and `/api/vocab` exist. Settle
  architecture.md's two open decisions first. The random-event NPCs want the same pipeline.
- **Design:** whatever of D6 and D10–D16 has not landed.
- **Phase 4** starts its abuse measures and monitoring from T33's limits, T36's `PUBLIC_ROOMS`
  switch and T45's admin view.
