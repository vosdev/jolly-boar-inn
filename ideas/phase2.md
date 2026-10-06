# Phase 2

What is left of Phase 2 is the [Phase 2 milestone](https://github.com/vosdev/jolly-boar-inn/milestone/1):
one issue per task, with its spec, accept criteria and dependencies, and the
[project board](https://github.com/users/vosdev/projects/3) for their order. The design they build on is
`ideas/architecture.md` and `ideas/design.md`; the mode sketches are `ideas/games.md`. Each task is one
session and leaves the app playable. Each accept criterion is a test unless it says "manual".

- **Every new mode brings its host**: its art as an entry in `data/assets.json` (#101) and the host's
  lines in `lib/modes.ts`, the way it already brings its blurb.
- **Pack sizes are roster-bound, not targets.** `data/popular-items.json` holds 176 items, and every
  item-derived mode scales off it. So a generator reports what it used and what it rejected rather
  than chasing a number. Growing the roster improves six modes at once and needs no code.
- **Images of items wait for the Images milestone.** Every mode here plays on text alone; #101 only fetches the
  hosts' art and the trophies.

## Not in Phase 2

- **Images, and the modes that need them.** Who's That NPC? and Pixel Hunt are the Images milestone, behind the
  asset pipeline and architecture's two open decisions. `pick_from_list`, its combobox and the vocab
  endpoint already exist, so Images is a pipeline and two components.
- **Events that need a picture.** A Certer asking what an item's outline is waits for images; in
  Phase 2 a Certer asks in words.
- **A separate room lock.** Rotating the invite key (#91) does the same job with no second control.
- **Pet icons as heads.** Swapping the art behind the fifty head ids, and a licensing call on game
  assets. The owner's, and it needs no task.
- **The display font and the logo.** The owner's (design §4 and §14). The slots and fallbacks exist.
