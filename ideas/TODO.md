# Splash screen

Instead of a splash countdown (default 8 seconds), have every player click ready. When every player is ready, count down from 3. Then the round begins.


# Bugs

When no option is chosen (at least on the more_less gametype), it states I have chosen the correct option on the (green outlined) button, with the text underneath saying `No answer from you this round, so no points.`


ROOMS_PER_IP_PER_HOUR seems to be for the whole deployment and not by ip? unless FORWARDED_ALLOW_IPS is set. ROOMS_PER_IP_PER_HOUR might be too strict regardless. We should limit the rooms per client at least client side. (The delete button is done: the front page lists the rooms this browser created and each has a Remove, which deletes the room and frees its code. It does not care whether the room is active -- a room being played is still the host's to remove.)

HEAD /api/modes 404s while GET 200s;

# Custom Questions

Custom questions can be displayed as random events. They can be shown at a random time during any game mode, as an additional question. With a special popup/splash type page which will show the random event NPC. We can create a bunch of random events and have them ask the question that is configured as custom.

Additionally, we could introduce random events anyways. Also when no custom questions are configured. It's very in line with OSRS.

Random events will never be in the first round, and never the first question of a round.

We should probably keep to a max of 1 random event/custom question per round. If people want 5 custom questions, they will have to enable at least 6 game modes. That also prevents people from abusing the custom question system to host their own non-osrs trivia game via our application.

Similar to a splash page, we can have an NPC show up and 1 second later ask the question. With the buttons showing up 2 seconds later.

Ideally, the question that is asked is a different type and/or gamemode. To make it truly a random event.

# Custom font?

If we want a custom font, we should find one.

# Logo

We need to create our own logo/favicon for the website
# Limit answers to 7

We only have 7 gems (Sapphire <-> Zenyte) so we need to limit the amount of answers that any type of question can have to 7.

# Store rooms in LocalStorage when done

When a game is done, the leaderboards of the room can be stored in LocalStorage, the room can then be moved to a list of completed games in every player's localstorage. Afterwards the room can be deleted from the database to immediately clean up and also free up the room name again. Or we can have the hourly task clean up completed games immediately. That's probably better.

# Add password protection option to a room
Doesn't have to be very rigid, just enough to keep people from guessing rooms to enter mid-game.

The new share link could include a randomized token. Only the host would be able to share this with others. Entering an existing room without token should prompt you for the token.

# Add the ability to lock a room to prevent new people from joining

Not sure if we need this if the password option is already there.


# List your game publicly

Display your lobby on the homepage, allowing people to join you. Great option for selfhosters.

# A player is joining...

When a player is joining the game but has not picked a name yet, it would be cool to show that a new player is joining so that everyone knows to wait.

# Player avatars

We could go for pets inventory icons. There's over 70 of those.

# Create README

# Add mandatory custom User Agent for data collectors

The wiki allows scraping, with a custom user agent and at most 1 visit per second. We need to enforce these rules with the scripts and via .env

# Support IPv6

# Tzhaar theme

Black and red is always cool.

# Group all topbar options

The topbar has 3 options right now, for player+avatar, sound and theme. Let's combine them into one, which will also bring more focus to the themes available.

Ideally the theme picker will have custom logos and not a colourscheme logo.

# Hide the rounds
We could make it optional to hide the rounds from everyone that is not an admin. That makes it a surprise as to what rounds the game contains. Could be a simple checkmark at creation.

# Splash screens

Splash screens could be displayed as a Clue Scroll

# Metrics

Let's keep track of some metrics. Could be stored in the database?

Amount of (returning) players. Amount of games created. Amount of games completed. Most used game modes. 

# Admin view

Configure a secure token in .env, minimum of 64 characters. manually create /admin?Token=blabla URL to create the local storage in the browser. This token now authenticates you against the server for admin type of things in the future. Like showing howmany rooms are active and which. Howmany players are connected. 