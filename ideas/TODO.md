# Splash screen

Instead of a splash countdown (default 8 seconds), have every player click ready. When every player is ready, count down from 3. Then the round begins.


# Rounds and global options
Instead of a global Rounds and Questions per round option, the amount of rounds should equal the amount of game modes chosen.

so 1 game mode = 1 round, and 6 game modes = 6 rounds

Amount of questions per round can be configured for each game mode type. Seconds per question can also be configured per game mode. We will configure sane defaults for each.

The quick more_less gamemode will have a bit more questions and a short time to answer. A Quest release date gamemode will have fewer questions with more time to answer.

# Leaderboard

Only show the standing on the leaderboard after a round is complete. Not after every question.

# Game creation

Game modes are currently only either enabled or disabled, and then injected at a random order.

Lets add the possibility to create our own order (default) with the option to make it random.

List the enabled game modes in the lobby (In alphabetical order)

# Design

Let's make a cool OSRS themed design. Perhaps multiple (As a lightmode/darkmode kind of thing) we could have region specific themes? Desert (The white with brown buildings or the luxurious pyramid regions) for light or the Wilderness for a dark theme.

Even more awesome would be to grab inspiration from the House styles: https://oldschool.runescape.wiki/w/House_styles. They have Polnivneach and Wilderness.

For generic multiple-choice questions, buttons could be in the color of OSRS Gems ( Sapphire, Emerald, Ruby, Diamond, Dragonstone)

RuneScape font works well on a dark theme in yellow, perhaps in black for the light theme.

Give players a random NPC chat head?

Let players configure their name on the homescreen (optional) and save it in storage. No need to enter your name again when it is already configured.
When players join a game and none is configured, we could put them in the lobby anyways with a random NPC name. They could then change it via a pop-up? Or a small menu on the right top?

# Bugs

When no option is chosen (at least on the more_less gametype), it states I have chosen the correct option on the (green outlined) button, with the text underneath saying `No answer from you this round, so no points.`