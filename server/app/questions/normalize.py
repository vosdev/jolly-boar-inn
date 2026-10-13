"""Free-text answers: what two strings have to have in common to be the same answer.

Only ``free_text`` uses this, and only for the host's own questions. Every pack mode that
once wanted a text box -- Guess the Examine above all -- moved to buttons or a list the
player picks from, because a picked answer is right or it is not and a typed name has to be
argued with. A host's question has no list: the answer is a clan member, a boss's kill
count, the name of the pet somebody lost in the Wilderness. So it keeps the argument, and
this module settles it the same way every time.

``normalize`` makes two spellings of one answer the same string: NFKC, then lowercase,
then punctuation out, then whitespace trimmed and collapsed. NFKC before anything else,
because it is what turns a decomposed accent into the composed one a keyboard types, and a
full-width letter into the letter, so everything after it sees one spelling of each
character. An accent the player left off is not normalised away: "Zezima" for "Zézima" is
one edit, which the typo allowance below covers. Punctuation is deleted rather than turned
into a space, so "K'ril" and "Kril" agree -- the apostrophes in this game's names are the
ones players leave out.

``accepts`` then allows a typo: a Levenshtein distance up to the question's
``max_distance``. Not for a short answer, though. One edit on "Jad" is a third of the word
and gets you "Jam", which is not a typo of anything, so an accepted answer under
``SHORT`` characters has to be matched exactly.

Grading runs on the one event loop, with the room's lock held, and NFKC can turn one
character into eighteen. So ``accepts`` never compares further than the typo allowance
reaches: a candidate whose length is out of reach is skipped, and the rest are compared
only near the diagonal.
"""

import unicodedata
from collections.abc import Iterable

# Accepted answers shorter than this take no typos: one edit on three letters is a
# different word, not a slip of the finger.
SHORT = 4


def normalize(text: str) -> str:
    """The form two answers are compared in. See the module docstring for the order."""
    folded = unicodedata.normalize("NFKC", text).lower()
    kept = "".join(ch for ch in folded if not unicodedata.category(ch).startswith("P"))
    return " ".join(kept.split())


def distance(a: str, b: str, limit: int | None = None) -> int:
    """Levenshtein: the fewest single-character inserts, deletes and substitutions.

    With ``limit``, any distance over it comes back as ``limit + 1``, in O(len × limit).
    """
    if len(a) < len(b):
        a, b = b, a
    if limit is None:
        limit = len(a)
    over = limit + 1
    if len(a) - len(b) > limit:
        return over
    # Cells more than ``limit`` off the diagonal are over the limit whatever they hold,
    # so they are never computed. Two rows are reused rather than one allocated per
    # character, which would make every comparison quadratic again.
    previous = [j if j <= limit else over for j in range(len(b) + 1)]
    current = [over] * (len(b) + 1)
    for i in range(1, len(a) + 1):
        low, high = max(1, i - limit), min(len(b), i + limit)
        current[low - 1] = i if low == 1 and i <= limit else over
        left = a[i - 1]
        for j in range(low, high + 1):
            current[j] = min(
                previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (left != b[j - 1])
            )
        if min(current[low - 1 : high + 1]) > limit:
            return over
        previous, current = current, previous
    return min(previous[-1], over)


def accepts(answer: str, accepted: Iterable[str], max_distance: int) -> bool:
    """Whether ``answer`` is one of ``accepted``, give or take ``max_distance`` typos."""
    given = normalize(answer)
    if not given:
        return False
    for candidate in accepted:
        target = normalize(candidate)
        allowed = 0 if len(target) < SHORT else max_distance
        if distance(given, target, allowed) <= allowed:
            return True
    return False
