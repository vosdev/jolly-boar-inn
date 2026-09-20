# A list of potential Game Modes

Ordered by build cost.

# Cheap
Possibly from the same data set, so cheap to create


## More or less (DONE! Implemented!)
GE price, High Alch price or NPC Shop price

## Guess the examine
show the examine text, name the item or NPC

Display Item/NPC with name and picture afterwards

## The price is right
estimate the GE price
4 options given.
Can we automate this? Rounded GE price (so 1337k becomes 1350k) and then alternative options with either 1 lower and 2 higher, 3 higher, 3 lower, 2 lower and 1 higher. 
We would need money displayed like it is ingame. over 100,000 it becomes 100k. Over 10 million it becomes 10M


# Medium
(renders from MOID or structured data from Bucket):

## Pixel Hunt
item render at 800 percent, zooming out in steps, guessing earlier scores more.
People can use a typebox with autocomplete of all items in our database. Only autocompleted options can be submitted. We would probably need at least 300 items in popular-items.json to make this work.

## Who is that NPC?
show the render or a shadow of the render for the obvious like Jad/Elvarg, four names as answers. Or maybe an open textfield with autocompletion/dropdown type of thing.

## Drop Table
item render plus four bosses. We would need either all fake bosses included in the data, or randomize it from all available bosses. The latter is more fun, but would have the risk of running into second bosses that drop an item. Unless we accept multiple entries for the right answer.

## Odd one out
four items or NPCs where three share an infobox property.

## Release Order
four/five quests by release date, points per correct location.
four/five NPCs by release date

## Sort it out
data probably in the same structure as timeline sort, perhaps we should even combine this gamemode with timeline sort.
give 4-5 random items or NPCs. And then we have to sort them in logical order (sapphire, emerald, ruby, diamond.. or bronze iron steel silver mithril gold etc). Or by combat level. The right order would have to be stored in the data itself. Give the data a tag so that we can accompany them with the right type of question (sort_type: quest, "Put the quests in order of release date", or "Put the quests in order of completion". The latter is fun, but can also have 2 out of 5 quests that could be in spot 3 and 4 because it don't matter. We have to think this through.)


## Bestiary
year of introduction, quest, location, combat level, weakness

# Who said that?
Popular NPC quotes, like:
Are you mentally deficient?
Thugo wanting Redberry Pie
Seriously, you'll be a monkey's uncle before you'll ever hold a dragon scimitar.
Tell me... a story...

# Clipped
Famous streamer quotes
B0aty's 73
C Engineer: Dying on my HCIM: Completed

Fun game mode, but we would need more quotes. A 20 minimum, would need community support for this. The type of data would be 4-5 options and one right answer.


# Expensive
(Out of scope for now, maybe later):

- Name that spell or spec: Play a short audio clip and have players guess the action (Ice barrage, teleblock, AGS spec, DDS spec etc)
- Minimap geoguessr: a random crop of the world map, drop a pin. Coordinates are known by definition, so no manual work. Build this version first.
- Screenshot geoguessr: your own in-game images, higher difficulty. Automate the metadata by renaming screenshots straight to `x_y_plane.png`.
- Music round: name the track, or guess where it plays on the map
- Clue scroll cryptics and anagrams: existing in-game content, answers are on the wiki.