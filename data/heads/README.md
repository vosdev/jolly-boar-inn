# Chat heads

Fifty heads, one per seat in a full room (section 5.2 of `ideas/design.md`).

**These are placeholders**, generated for D4 so the feature ships before the real picks
exist. Replace them file for file:

- Keep the id. `heads.json` is an array whose index is the id, and `players.avatar`
  stores that id, so a file may be redrawn in place and the list may grow, but an
  existing id is never pointed at a different face.
- Save each head as a **16×16** PNG, 8-bit, not interlaced, transparent background. 16
  divides both sizes a head is drawn at (32px and 48px), which is what keeps it crisp;
  `server/tests/test_heads.py` checks all of that.
- Rename the file and the entry's `name` together: `NNN-<slug>.png`, where `NNN` is the id.

The client build packs them into one sprite sheet (`client/heads-sprite.ts`), so nothing
else needs to change when they do.
