# Splash screen

Instead of a splash countdown (default 8 seconds), have every player click ready. When every player is ready, count down from 3. Then the round begins.


# Leaderboard

Only show the standing on the leaderboard after a round is complete. Not after every question.

# Bugs

When no option is chosen (at least on the more_less gametype), it states I have chosen the correct option on the (green outlined) button, with the text underneath saying `No answer from you this round, so no points.`


ROOMS_PER_IP_PER_HOUR seems to be for the whole deployment and not by ip? unless FORWARDED_ALLOW_IPS is set. ROOMS_PER_IP_PER_HOUR might be too strict regardless. We should limit the rooms per client at least client side, add a delete button to existing rooms (that are not active?) to free up room names in the database.

HEAD /api/modes 404s while GET 200s;