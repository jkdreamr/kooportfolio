export type NpcPicture =
  | "campus"
  | "oar"
  | "go"
  | "river"
  | "booth"
  | "skate"
  | "shuttle"
  | "court"
  | "garden"
  | "letter"
  | "uprights"
  | "pads"
  | "tangram"
  | "picnic";

export type NpcTopic = {
  id: string;
  label: string;
  reply: string;
  picture?: NpcPicture;
};

const ask = (
  id: string,
  label: string,
  reply: string,
  picture?: NpcPicture,
): NpcTopic => ({ id, label, reply, picture });

const topics: Record<string, readonly NpcTopic[]> = {
  mapmaker: [
    {
      id: "campus",
      label: "What's that tower?",
      reply:
        "Hoover Tower. Hard to miss once you get down to campus. Everyone uses it to figure out which way they're going, whether they admit it or not.",
      picture: "campus",
    },
    {
      id: "water",
      label: "Where's the water?",
      reply:
        "Follow the campus walk past the court. The boathouse is beside the pond, where the crew crowd disappears to before most people are awake.",
    },
    {
      id: "mapping",
      label: "How do you map a place?",
      reply:
        "Walk it until the shortcuts show themselves, then draw those. A map made from the paths people actually take beats a neat one every time.",
    },
  ],
  dockhand: [
    {
      id: "stroke",
      label: "How do I steer?",
      reply:
        "A and D steer. Keep between the buoys; the shallows will slow you down.",
      picture: "oar",
    },
    {
      id: "race",
      label: "Can I race?",
      reply:
        "Yep. Head inside and look for the race prompt on the floor. Watch the countdown, then pull like you mean it.",
    },
    {
      id: "cox",
      label: "Who calls the shots?",
      reply:
        "The coxswain. Josh walked on to Stanford rowing as a sophomore, and now he steers the boat and calls the rhythm for the whole crew.",
    },
  ],
  "go-player": [
    {
      id: "capture",
      label: "How do captures work?",
      reply:
        "Fill the empty points next to a stone to capture it. See that last open point?",
      picture: "go",
    },
    {
      id: "start",
      label: "Never played.",
      reply:
        "Try the small board inside. Black goes first. Don't worry about being good at it; nobody here is.",
    },
    {
      id: "losing",
      label: "How do you handle losing?",
      reply:
        "Count what the loss taught you, then ask for a rematch. A bad game you think about beats ten wins you forget.",
    },
  ],
  "bridge-cyclist": [
    {
      id: "river",
      label: "Can I cross the river?",
      reply:
        "Try the bridge. I stop halfway across just to look back at the skyline. It's a three minute delay I've never once regretted.",
      picture: "river",
    },
    {
      id: "break",
      label: "Long ride?",
      reply:
        "Not till I tried to ride into the wind. Turned a twenty minute errand into an hour, and my legs filed a complaint.",
    },
    {
      id: "route",
      label: "Best route around?",
      reply:
        "Along the water, then cut back before the hill. Flat, quiet, and you get the bridge view for free.",
    },
  ],
  photographer: [
    {
      id: "booth",
      label: "How's the booth work?",
      reply:
        "Take four photos, decorate the strip, then save it or post it to the wall.",
      picture: "booth",
    },
    {
      id: "light",
      label: "Best time for a shot?",
      reply:
        "I like it just before dark. The lamps start to come on and the tower goes a little pink. I've taken the same photo on three different evenings.",
    },
    {
      id: "subjects",
      label: "What do you shoot?",
      reply:
        "Mostly people not paying attention. Posed photos are fine, but the good ones are always the frame before everyone settles.",
    },
  ],
  musician: [
    {
      id: "listen",
      label: "Anything to listen to?",
      reply:
        "Look up kelix on SoundCloud. Try ‘back room’ first, then ‘please be’ if you want something quieter.",
    },
    {
      id: "make",
      label: "What's in the beat lab?",
      reply:
        "Four pads. Hit them as the notes come down. Easier if you listen first.",
      picture: "pads",
    },
    {
      id: "kelix",
      label: "Who is kelix?",
      reply:
        "Josh's name on SoundCloud, @atkelix on Instagram. He debuted with the digital single “Fairytale” under Dejavu Group, a Korean hip hop label.",
    },
  ],
  hooper: [
    {
      id: "shoot",
      label: "How do I shoot?",
      reply:
        "Hold to build power, then release. Try a short shot before you move back.",
      picture: "court",
    },
    {
      id: "challenge",
      label: "Want to play?",
      reply: "You go ahead. I'm still catching my breath.",
    },
    {
      id: "goat",
      label: "Josh's favorite player?",
      reply: "LeBron, no debate. Josh is a LeBron fan through and through.",
    },
    ask(
      "greatest",
      "Who's the greatest?",
      "Ask Josh and it's LeBron. Every time. Don't start.",
    ),
  ],
  skater: [
    ask(
      "ramp",
      "Where should I start?",
      "Try the low bank. Get over it clean before you try anything on the big ramp.",
      "skate",
    ),
    ask(
      "ollie",
      "How do I ollie?",
      "Get rolling and tap Space or Ollie. Give yourself room to land. Commit to it; half-hearted ollies are how shins meet concrete.",
    ),
    ask(
      "josh",
      "Does Josh skate?",
      "Since his freshman year at Stanford. He still rides for fun.",
    ),
  ],
  "shuttle-player": [
    ask(
      "shuttle",
      "What's wrong with it?",
      "Lost a feather. Now it keeps veering off to the left.",
      "shuttle",
    ),
    ask(
      "doubles",
      "Any doubles tips?",
      "Call ‘mine’ early. Saves both of you running into the middle. Learned that one the hard way.",
    ),
    ask(
      "singles",
      "Singles or doubles?",
      "Doubles, always. In singles every mistake is yours alone, and I like having someone to blame.",
    ),
    ask(
      "josh",
      "Does Josh play?",
      "Since middle school. Badminton club here his freshman year. Now it's whenever he can.",
    ),
  ],
  "tower-docent": [
    ask(
      "tower",
      "Can I go up?",
      "There's a door at the base. Have you found its key yet?",
      "campus",
    ),
    ask(
      "quad",
      "Which way to the quad?",
      "Follow the paths south. Once you see the arches, you're there.",
    ),
    ask(
      "history",
      "How old is all this?",
      "Older than it looks in some spots, newer in others. The trick is the arches make everything feel like it's been here forever.",
    ),
  ],
  rebounder: [
    ask(
      "shot",
      "Where should I shoot?",
      "Right in front to start. Move back once you can make a few in a row.",
      "court",
    ),
    ask(
      "rebound",
      "Can I get the ball?",
      "All yours. Mine usually bounces farther than I expect.",
    ),
    ask(
      "lebron",
      "Play like LeBron?",
      "Nobody does. Josh would tell you that himself, and he's the biggest LeBron fan I know.",
    ),
  ],
  "gym-walker": [
    ask(
      "lap",
      "Where do you walk?",
      "Past the gym and around to the court. I walk the long side when my legs are sore.",
      "court",
    ),
    ask(
      "reps",
      "What are you training?",
      "Eight clean reps. I keep rushing the last two.",
    ),
    ask(
      "route",
      "Why not the treadmill?",
      "Because the treadmill doesn't have a view. Same miles out here, better company.",
    ),
  ],
  "math-tutor": [
    ask(
      "diagram",
      "How do you get unstuck?",
      "I draw a smaller version. If three pieces don't fit, twelve won't help.",
      "tangram",
    ),
    ask(
      "erase",
      "What was on the board?",
      "Mostly arrows. Come to think of it, that might've been the problem.",
    ),
    ask(
      "josh",
      "Is Josh a math person?",
      "USACO Platinum as a high-school freshman, olympiads, research with Euler Circle, and he helped run the Stanford Math Tournament. So, yes.",
    ),
  ],
  "prep-cook": [
    ask(
      "herbs",
      "Where's the basil?",
      "Try the garden beds. If it smells like pesto, you've got it.",
      "garden",
    ),
    ask(
      "open",
      "Can I come in?",
      "Sure. Just keep the walkway by the stove clear.",
    ),
    ask(
      "prep",
      "What's the prep for?",
      "Whatever's on the board today. Rice always, sides always, and then whatever the garden decided to give us.",
    ),
  ],
  "copy-editor": [
    ask(
      "start",
      "How would you start?",
      "Write it like a note to one person. You can cut ‘Dear’ later.",
      "letter",
    ),
    ask(
      "stuck",
      "What if I'm stuck?",
      "Leave a blank and keep going. It's easier to fix a page with words on it.",
    ),
    ask(
      "cuts",
      "What do you cut first?",
      "The sentence I'm proudest of, usually. If it works harder for me than the reader, it goes.",
    ),
    ask(
      "josh",
      "What does Josh write?",
      "He loves to write: poetry, songwriting, essays. He even built his own songwriting tool, Verses.",
    ),
  ],
  "play-caller": [
    ask(
      "kick",
      "How do I kick in wind?",
      "Check the wind arrow before you aim. Give it a little room to drift back.",
      "uprights",
    ),
    ask(
      "practice",
      "Can I practice first?",
      "Try a shorter kick before you go for forty yards.",
    ),
    ask(
      "niners",
      "Is Josh a football fan?",
      "A huge 49ers fan. Go Niners! He'd want you to make this kick.",
    ),
    ask(
      "stadium",
      "Whose stadium is this?",
      "Josh's team. Go 49ers. He's a huge fan.",
    ),
  ],
  drummer: [
    ask(
      "pads",
      "What's in the lab?",
      "Four pads. I try to hear the beat before I look at the notes.",
      "pads",
    ),
    ask(
      "timing",
      "I keep missing notes.",
      "Tap along on your knee first. No need to chase every note.",
    ),
    ask(
      "beat",
      "What makes a good beat?",
      "Space. Anyone can fill every note; the trick is leaving room for the one that matters.",
    ),
  ],
  "go-regular": [
    ask(
      "corner",
      "How'd you lose it?",
      "I left one way out and then forgot to use it. Last white stone did for me.",
      "go",
    ),
    ask(
      "rematch",
      "One more game?",
      "You take black. I'll try leaving that corner alone this time.",
    ),
    ask(
      "habit",
      "Play here often?",
      "Most afternoons. The board inside is where the real games happen; out here I just replay the ones I lost.",
    ),
  ],
  postie: [
    ask(
      "letter",
      "Can I see the envelope?",
      "Here. No house number, just a little drawing of the porch.",
      "letter",
    ),
    ask(
      "house",
      "Maybe the study?",
      "That was my guess too. If the light's on, I'll knock.",
    ),
    ask(
      "route",
      "Long route today?",
      "Long enough. Every house gets something eventually, even the ones that only ever get flyers.",
    ),
  ],
  "booth-visitor": [
    ask(
      "strip",
      "Can I see the pictures?",
      "Sure. Third one's my favorite. That's where I gave up trying to look serious.",
      "booth",
    ),
    ask(
      "pose",
      "Which pose did you pick?",
      "Wave. It looks like I'm trying to get the camera's attention.",
    ),
    ask(
      "takes",
      "How many takes?",
      "Four, same as everyone. I blinked in two and I'm counting that as a win.",
    ),
  ],
  "park-guide": [
    ask(
      "bridge",
      "What can I see from there?",
      "The skyline across the river. Walk out to the middle if you have time.",
      "river",
    ),
    ask(
      "long-way",
      "What's the long way?",
      "Follow the path along the water first. A bit farther, but there are benches.",
    ),
    ask(
      "when",
      "Best time to visit?",
      "Early evening. The city lights start coming on while the sky's still deciding what color to be.",
    ),
  ],
  "bridge-lookout": [
    ask(
      "view",
      "What are you looking at?",
      "Those buildings across the river. They almost disappear in the rain.",
      "river",
    ),
    ask(
      "late",
      "Where are you headed?",
      "Lunch. I told them I'd be there before the rice got cold.",
    ),
    ask(
      "habit",
      "Stop here every day?",
      "Every single one. Started as a shortcut, became the reason I'm always two minutes late.",
    ),
  ],
  angler: [
    ask(
      "current",
      "Anything in the water?",
      "Mostly ripples today. See the darker patch under the bridge?",
      "river",
    ),
    ask(
      "wait",
      "How long have you waited?",
      "Long enough to finish my tea. I'll give it another cup.",
    ),
    ask(
      "bites",
      "Ever catch anything?",
      "That's not really the point. The point is standing here while the water does all the work.",
    ),
  ],
  "puzzle-solver": [
    ask(
      "pieces",
      "What kind of puzzle?",
      "Shapes. I've been turning this one triangle around for ten minutes.",
      "tangram",
    ),
    ask(
      "break",
      "Did the walk help?",
      "No, but at least now the triangle can wait.",
    ),
    ask(
      "stuck",
      "What do you do when stuck?",
      "Stop looking at it directly. Answers show up out of the corner of your eye, never head on.",
    ),
  ],
  "lunch-vendor": [
    ask(
      "lunch",
      "What's for lunch?",
      "Rice, a few sides, and whatever's left in this basket.",
      "picnic",
    ),
    ask(
      "seat",
      "Is there somewhere to sit?",
      "Try the benches. Take the shady end if it's free.",
    ),
    ask(
      "busy",
      "Busy today?",
      "Steady. The trick is feeding people before they realize how hungry they were.",
    ),
  ],
  cook: [
    ask(
      "menu",
      "What's cooking?",
      "Depends what came up from the garden. I asked for herbs, not another crate of tomatoes.",
      "garden",
    ),
    ask(
      "help",
      "Need a hand?",
      "Take a look inside. There's always something to chop.",
    ),
    ask(
      "favorite",
      "Your favorite dish?",
      "Whatever someone's eating for the first time. Watching them decide it's good is the whole reward.",
    ),
  ],
  gardener: [
    ask(
      "beds",
      "What's in the beds?",
      "Tomatoes in back, herbs at the front. The tomatoes keep getting in the way.",
      "garden",
    ),
    ask(
      "water",
      "Need a watering can?",
      "Thanks. I've done this end; try the row by the path.",
    ),
    ask(
      "season",
      "Best season out here?",
      "This one, every time. The garden changes its answer by the week.",
    ),
  ],
  runner: [
    ask(
      "lap",
      "How far are you going?",
      "Out past the court and back. If someone's shooting, I take the outside path.",
      "court",
    ),
    ask(
      "pace",
      "Can I keep up?",
      "Definitely. That ‘one more lap’ was two laps ago.",
    ),
    ask(
      "why",
      "Why the laps?",
      "Cheapest way to think I know. Legs busy, head quiet, problems smaller by the second lap.",
    ),
  ],
  maker: [
    ask(
      "workshop",
      "What are you working on?",
      "Fitting odd shapes together. Every time I fix one corner, another sticks out.",
      "tangram",
    ),
    ask(
      "break",
      "Why the break?",
      "I was starting to move pieces just to hear them click.",
    ),
    ask(
      "process",
      "How do you build?",
      "Badly, then less badly. The first version is for learning where it breaks; the real one comes after.",
    ),
  ],
  student: [
    ask(
      "problem",
      "Show me the problem?",
      "I drew it as a few shapes. Looked easier until I had to put them back together.",
      "tangram",
    ),
    ask(
      "hint",
      "Want a hint?",
      "Give me another minute. Then yes, desperately.",
    ),
    ask(
      "study",
      "Where do you study?",
      "The math lab mostly, or here when I need to pretend the fresh air is helping.",
    ),
  ],
  reader: [
    ask(
      "page",
      "What's on the page?",
      "An old letter. Whoever wrote it never got around to signing it.",
      "letter",
    ),
    ask(
      "quiet",
      "Can I read in there too?",
      "Sure. The study's the place to go when you want to hear yourself think.",
    ),
    ask(
      "genre",
      "What do you read?",
      "Letters, mostly. Finished books tell you how they end; letters let you wonder.",
    ),
  ],
  visitor: [
    ask(
      "first",
      "What did you see first?",
      "The tower. I kept using it to work out which way I'd come, which apparently is a campus survival skill.",
      "campus",
    ),
    ask(
      "lost",
      "Get lost?",
      "Once. Twice if you count walking right past the place. In my defense, everything here looks deliberate enough to be the right building.",
    ),
    ask(
      "who",
      "Who is Josh?",
      "Josh Koo. He made this whole world as his portfolio. Stanford CS and math, coxswain on the crew team, and he leads Cognition's Korea efforts.",
    ),
    ask(
      "else",
      "What else does he do?",
      "Makes music as kelix on SoundCloud, loves writing poetry and essays, plays Go and badminton, and cheers for LeBron and the 49ers. His code's on GitHub under jkdreamr.",
    ),
    ask(
      "site",
      "Where can I find more?",
      "joshuakoo.xyz has the official version. This place is the unofficial one, same facts, better weather.",
    ),
  ],
  coxswain: [
    ask(
      "crew",
      "Where do you sit?",
      "In the boat with the crew. I steer and call the rhythm; they do the hard part.",
      "oar",
    ),
    ask(
      "race",
      "Any advice for the race?",
      "Find a pace you can hold. Save a burst for the finish.",
    ),
    ask(
      "josh",
      "How'd Josh end up a coxswain?",
      "He walked on to Stanford rowing as a sophomore. Now he steers the boat and calls the race.",
    ),
    ask(
      "cox-job",
      "What does a cox do?",
      "Steers, calls the race, keeps eight people honest. Josh does it for Stanford.",
    ),
  ],
  teammate: [
    ask(
      "drill",
      "What should we practice?",
      "Make one from each side of the hoop, then trade places.",
      "court",
    ),
    ask("game", "Keeping score?", "Only if my first shot goes in."),
    ask(
      "team",
      "Pickup or practice?",
      "Practice until someone suggests a game. Then it's pickup with extra arguing about the score.",
    ),
  ],
  producer: [
    ask(
      "birds",
      "How'd you use that sound?",
      "Leave a gap in the beat for it. No point recording a bird you can't hear.",
      "pads",
    ),
    ask("lab", "Can I try the pads?", "Go for it. I'll listen from out here."),
    ask(
      "kelix",
      "Is kelix Josh?",
      "Yeah, that's his. kelix on SoundCloud, @atkelix on Instagram. He previously released music as dreamr.",
    ),
    ask(
      "tracks",
      "Whose tracks are these?",
      "Josh's. He debuted with “Fairytale” and posts as kelix on SoundCloud.",
    ),
  ],
  "record-shopper": [
    ask(
      "choice",
      "What are you picking?",
      "The one with the better drums. Trouble is I like both.",
      "pads",
    ),
    ask("wait", "Been here long?", "Long enough to hear the same song twice."),
    ask(
      "taste",
      "How do you choose?",
      "Needle drop, first twenty seconds. If the intro doesn't earn the rest of the record, back it goes.",
    ),
  ],
  "home-neighbor": [
    ask(
      "tomatoes",
      "Any ripe ones yet?",
      "A few. Look under the leaves; the bright ones in front always get picked first.",
      "garden",
    ),
    ask(
      "home",
      "Heading home soon?",
      "After one more look. I said that ten minutes ago.",
    ),
    ask(
      "josh",
      "Know Josh well?",
      "He built this neighborhood for his portfolio: the house, the garden, the kitchen. He likes cooking, so guess his favorite room.",
    ),
  ],
  "food-regular": [
    ask(
      "order",
      "What do you get?",
      "Rice and all the little sides. I always run out of the pickled ones first.",
      "picnic",
    ),
    ask(
      "line",
      "Is the wait always this long?",
      "Only when everyone else has the same good idea.",
    ),
    ask(
      "josh",
      "Does Josh eat here?",
      "He says he eats literally everything, and from what I've seen that's true. The sides go first.",
    ),
  ],
  picnicker: [
    ask(
      "basket",
      "What's in the basket?",
      "An orange, some rice, and the last bite I was saving.",
      "picnic",
    ),
    ask(
      "shade",
      "Mind if I sit?",
      "Go ahead. The other end of the bench is still cool.",
    ),
    ask(
      "spot",
      "Why this spot?",
      "Shade in the afternoon, sun in the morning, close enough to the path to people-watch. A bench that does three jobs.",
    ),
  ],
  "river-walker": [
    ask(
      "walk",
      "Where do you turn back?",
      "I go as far as the bridge. If the sky looks like that, sometimes I cross.",
      "river",
    ),
    ask(
      "cool",
      "Is it really cooler here?",
      "Feels that way to me. Try standing in the breeze for a minute.",
    ),
    ask(
      "josh",
      "Does Josh walk here?",
      "Not that I've seen. He's busy leading Cognition's Korea efforts. They're hiring for Korea, by the way: message or DM Joshua.",
    ),
  ],
  rower: [
    ask(
      "boat",
      "How do I get on the water?",
      "Head into the boathouse and look for the race prompt on the floor. The buoys mark the course.",
      "oar",
    ),
    ask(
      "cox",
      "What's a coxswain do?",
      "Steers the boat and calls the rhythm. It's the only seat that faces the other direction, which is probably why Josh likes it.",
    ),
    ask(
      "josh",
      "Does Josh row?",
      "He's our cox. Walked on as a sophomore and never left the boat.",
    ),
  ],
  neighbor: [
    ask(
      "house",
      "Whose house is this?",
      "Josh's, in spirit at least. He made this corner of the world for his portfolio, give or take the better weather.",
    ),
    ask(
      "hang",
      "What's going on inside?",
      "The usual. People dropping by, something on the stove. The door's open for anyone who finds their way here.",
      "garden",
    ),
    ask(
      "josh",
      "What's Josh like?",
      "Get him started on crew, LeBron, the 49ers or whatever he's making as kelix that week, and you'll be here a while.",
    ),
  ],
  classmate: [
    ask(
      "late",
      "Late for what?",
      "Math lab. Third time this week. The professor's going to start recognizing the back of my head.",
    ),
    ask(
      "major",
      "What's Josh studying?",
      "CS and math together, at Stanford. He's done a lot of math: olympiads, and research with Euler Circle.",
      "tangram",
    ),
    ask(
      "josh",
      "Does Josh tutor?",
      "Not officially, but he helped organize the Stanford Math Tournament, so he's no stranger to a hard problem.",
    ),
  ],
  regular: [
    ask(
      "lunch",
      "What's good here?",
      "All of it, honestly. Get the rice and every side on the table. A meal without the pickled dishes is just a snack.",
      "picnic",
    ),
    ask(
      "often",
      "Eat here a lot?",
      "Most days. It's the kind of place you end up at whether you meant to or not.",
    ),
    ask(
      "crowd",
      "Same faces every day?",
      "Mostly. The regulars know each other's orders better than their names, which is its own kind of friendship.",
    ),
    ask(
      "dinners",
      "Any good dinners around?",
      "Josh hosts kookwleigh: intimate dinners, by invitation. Check the bulletin board.",
    ),
  ],
  lifter: [
    ask(
      "program",
      "What are you training for?",
      "Eight clean reps, mostly so I can say I did them. Last two are always the negotiation.",
    ),
    ask(
      "gym",
      "What's in the gym?",
      "Weights, a couple of machines, and whoever's taking a break from the real workout outside.",
    ),
    ask(
      "day",
      "Leg day tomorrow?",
      "Supposed to be. I've rescheduled it three times, which at this point counts as cardio.",
    ),
  ],
  researcher: [
    ask(
      "work",
      "What are you working on?",
      "A problem that's been stuck in my head all week. I came out here to think, which is either a strategy or a delay tactic.",
    ),
    ask(
      "cognition",
      "What is this office?",
      "The Cognition building. They make Devin, the AI software engineer. Josh leads their Korea efforts.",
      "campus",
    ),
    ask(
      "josh",
      "What's Josh's job?",
      "He's leading Cognition's Korea efforts. He's also an investment intern at CRV.",
    ),
    ask(
      "hiring",
      "Is Cognition hiring?",
      "For Korea, yes. Message or DM Joshua.",
    ),
  ],
};

/**
 * For the town hall (Phase 2): the go regular's line, ready to append to
 * "go-regular" once the building exists. Source: Josh's own notes ("clash of
 * clans (prev. top 6 in the US), I stopped playing now"). Not listed yet, so
 * nobody is pointed at a building that is not there.
 */
export const TOWN_HALL_TOPIC: NpcTopic = ask(
  "town-hall",
  "What's with the town hall?",
  "Josh was top 6 in the US at a certain village-building game. Hasn't touched it in a while.",
);
export const topicsFor = (npcId: string): readonly NpcTopic[] =>
  topics[npcId] ?? [];
