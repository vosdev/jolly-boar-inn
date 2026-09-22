"""Free-text answers: what two strings have to have in common to be the same answer.

Only ``free_text`` uses this, and only for the host's own questions. Every pack mode that
once wanted a text box -- Guess the Examine above all -- moved to a list the player picks
from (``pick_from_list``), because an item id is right or it is not and a typed name has to
be argued with. A host's question has no list: the answer is a clan member, a boss's kill
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


def distance(a: str, b: str) -> int:
    """Levenshtein: the fewest single-character inserts, deletes and substitutions."""
    if len(a) < len(b):
        a, b = b, a
    previous = list(range(len(b) + 1))
    for i, left in enumerate(a, start=1):
        current = [i]
        for j, right in enumerate(b, start=1):
            current.append(
                min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (left != right))
            )
        previous = current
    return previous[-1]


def accepts(answer: str, accepted: Iterable[str], max_distance: int) -> bool:
    """Whether ``answer`` is one of ``accepted``, give or take ``max_distance`` typos."""
    given = normalize(answer)
    if not given:
        return False
    for candidate in accepted:
        target = normalize(candidate)
        allowed = 0 if len(target) < SHORT else max_distance
        if distance(given, target) <= allowed:
            return True
    return False
