# Writing questions

`make validate-packs` checks every rule here that a machine can. Run it before you commit.

## Guess the Examine (`examine.json`)

Examine lines worth reading out at a quiz night. Items, NPCs and scenery all belong: a line
makes the list because it is funny, not because of what it examines. Adding one is the
easiest way to contribute.

Each line is one question:

- `payload.prompt` is the examine text, exactly as the game shows it. A line may appear only
  once in the file, ignoring case and accents, or it would have two right answers.
- `payload.subject.name` is what the thing is called, as the game writes it. It is the answer,
  so it must differ from every other answer's name, ignoring case and accents.
- `payload.answer_id` is the number that identifies the answer for good: rooms store it. A new
  answer takes one more than the highest id in the file. Never change or reuse an id, even
  after deleting its lines.
- Things that share a name but not an examine, like the eleven Miners of the Motherlode Mine,
  are one answer with a question per line: same `answer_id`, same name.
- `wiki` is the OSRS Wiki page you checked the line on. Players never see it.
- `credit` is the player who suggested it; `make import-suggestions` writes it. With
  `credit_shown: true` the reveal names them.
- `id` is `q_` plus a hash of the type and payload; `validate-packs` prints the expected one.
  Leave `type`, `mode`, `source`, `tags` and `payload.vocab` as the other questions have them.

Add new lines at the end of the file.
