# A list of potential Game Modes

Ordered by build cost.

# Cheap
Possibly from the same data set, so cheap to create

## Higher or lower
GE price, High Alch price or NPC Shop price

## Guess the examine
show the examine text, name the item or NPC

Display Item/NPC with picture afterwards

## The price is right
estimate the GE price
4 options given.
Can we automate this? Rounded GE price and then alternative options with either 1 lower and 2 higher, 3 higher, 3 lower, 2 lower and 1 higher.


# Medium
(renders from MOID or structured data from Bucket):

## Zoom quiz
item render at 800 percent, zooming out in steps, guessing earlier scores more.
People can use a typebox with autocomplete of all items in our database. Only autocompleted options can be submitted.

## Who is this Pokémon?
show the render or a shadow of the render for the obvious like Jad/Elvarg, four names as answers.

## Which boss drops this
item render plus four bosses

## Odd one out
four items or NPCs where three share an infobox property.

## Timeline sort
four/five quests by release date, points per correct location.

## NPC questions
year of introduction, quest, location, combat level, weakness

# Iconic Quest Dialogue
Popular NPC quotes, like:
Are you mentally deficient?
Thugo wanting Redberry Pie
Seriously, you'll be a monkey's uncle before you'll ever hold a dragon scimitar.
Tell me... a story...

# Expensive
(Out of scope for now, maybe later):

- Name that spell or spec: Play a short audio clip and have players guess the action (Ice barrage, teleblock, AGS spec, DDS spec etc)
- Minimap geoguessr: a random crop of the world map, drop a pin. Coordinates are known by definition, so no manual work. Build this version first.
- Screenshot geoguessr: your own in-game images, higher difficulty. Automate the metadata by renaming screenshots straight to `x_y_plane.png`.
- Music round: name the track, or guess where it plays on the map
- Clue scroll cryptics and anagrams: existing in-game content, answers are on the wiki.