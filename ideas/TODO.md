# Splash screen

Instead of a splash countdown (default 8 seconds), have every player click ready. When every player is ready, count down from 3. Then the round begins.


# Leaderboard

Only show the standing on the leaderboard after a round is complete. Not after every question.

# Bugs

When no option is chosen (at least on the more_less gametype), it states I have chosen the correct option on the (green outlined) button, with the text underneath saying `No answer from you this round, so no points.`


ROOMS_PER_IP_PER_HOUR seems to be for the whole deployment and not by ip? unless FORWARDED_ALLOW_IPS is set. ROOMS_PER_IP_PER_HOUR might be too strict regardless. We should limit the rooms per client at least client side, add a delete button to existing rooms (that are not active?) to free up room names in the database.

HEAD /api/modes 404s while GET 200s;

# Custom Questions

Custom questions can be displayed as random events. They can be shown at a random time during any game mode, as an additional question. With a special popup/splash type page which will show the NPC. We can create a bunch of random events and have them ask the question that is configured as custom.

Additionally, we could introduce random events anyways. Also when no custom questions are configured. It's very in line with OSRS.

Random events will never be in the first round, and never the first question of a round.

We should probably keep to a max of 1 random event/custom question per round. If people want 5 custom questions, they will have to enable at least 6 game modes. That also prevents people from abusing the custom question system to host their own non-osrs trivia game via our application.

Similar to a splash page, we can have an NPC show up and ask the question. With the buttons showing up 2 seconds later.

Ideally, the question that is asked is a different type and/or gamemode. To make it truly a random event.

