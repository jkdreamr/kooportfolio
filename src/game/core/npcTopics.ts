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
        "Hoover Tower. Josh uses it the same way you did, to figure out which way he's going on campus. Hard to miss once you get down there.",
      picture: "campus",
    },
    {
      id: "water",
      label: "Where's the water?",
      reply:
        "Follow the campus walk past the court. The boathouse is beside the pond, which is where Josh spends most of his early mornings during crew season.",
    },
    {
      id: "builder",
      label: "Who mapped this place?",
      reply:
        "Josh did, more or less. He's CS and math at Stanford, so half this map is just his routine with better weather. The paths go where he actually walks.",
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
        "Yep. Head inside and look for the race prompt by the dock. If you want the full experience, sit in the coxswain seat. That's Josh's spot.",
    },
    {
      id: "cox",
      label: "Who calls the shots?",
      reply:
        "The coxswain. Josh walked on to the team as a freshman, no rowing background, and ended up steering and calling the rhythm for the whole boat. He'll tell you it chose him.",
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
      id: "josh",
      label: "Does Josh play?",
      reply:
        "Now and then. He plays it like he writes code, patient until he isn't. Last game he spent ten minutes on one move and then lost the corner anyway.",
    },
  ],
  "bridge-cyclist": [
    {
      id: "river",
      label: "Can I cross the river?",
      reply:
        "Try the bridge. I stop halfway across just to look back at the skyline. Josh does the same thing on his way to the Cognition office, whether he admits it or not.",
      picture: "river",
    },
    {
      id: "break",
      label: "Long ride?",
      reply:
        "Not till I tried to ride into the wind. Felt like rowing against the current, which Josh says is exactly as bad as it sounds.",
    },
  ],
  photographer: [
    {
      id: "booth",
      label: "How's the booth work?",
      reply:
        "Take four photos, decorate the strip, then save it or post it to the wall. Josh's strips are up there somewhere. Look for the one where he's clearly laughing.",
      picture: "booth",
    },
    {
      id: "light",
      label: "Best time for a shot?",
      reply:
        "I like it just before dark. The lamps start to come on and the tower goes a little pink. Josh has that same photo from three different evenings.",
    },
  ],
  musician: [
    {
      id: "listen",
      label: "Anything to listen to?",
      reply:
        "Look up kelix on SoundCloud. That's Josh. Try ‘back room’ first, then ‘please be’ if you want something quieter.",
    },
    {
      id: "make",
      label: "What's in the beat lab?",
      reply:
        "Four pads. Hit them as the notes come down. Easier if you listen first. Josh built it to feel like making a track, not passing an exam.",
      picture: "pads",
    },
    {
      id: "kelix",
      label: "Who is kelix?",
      reply:
        "Josh's producer name. He makes beats in the evenings and posts them when he's happy with one. The bird sounds out here? He's probably sampling them.",
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
      reply:
        "LeBron, no debate. Josh has been a fan forever and will explain the longevity argument to anyone who stands still long enough. Don't bring up MJ unless you have an hour.",
    },
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
      "Get rolling and tap Space or Ollie. Give yourself room to land. Josh's advice, not mine.",
    ),
    ask(
      "josh",
      "Does Josh skate?",
      "Since freshman year. He picked it up cruising between classes at Stanford and never put the board down. Still skates when the paths are dry.",
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
      "partner",
      "Who's your usual partner?",
      "Josh, when he's around. He's sneakier at the net than he looks for someone who spends all day at a desk.",
    ),
  ],
  "tower-docent": [
    ask(
      "tower",
      "Can I go up?",
      "There's a door at the base. Have you found its key yet? Josh hid it somewhere only a patient person would look.",
      "campus",
    ),
    ask(
      "quad",
      "Which way to the quad?",
      "Follow the paths south. Once you see the arches, you're there. Josh crossed that quad every day between math lectures and crew practice.",
    ),
    ask(
      "student",
      "What does Josh study?",
      "Computer science and math at Stanford. Ask him about either and he'll talk faster, but he'll also actually explain it, which is rarer than you'd think.",
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
      "Nobody does, but Josh tries. He's been a fan since he was a kid. If you see him here, ask about 2016. You'll be here a while.",
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
      "crew",
      "Is Josh a gym person?",
      "More of a crew person. He walked on to Stanford rowing as a freshman and now he's the coxswain, the one steering and yelling the rhythm. The gym is just for keeping up.",
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
      "Does Josh do math?",
      "It's half his degree. He does CS and math at Stanford, and he's the kind of person who solves it on a napkin if you ask him a question at lunch.",
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
      "appetite",
      "What does Josh eat here?",
      "Rice and every side dish on the table. He grew up on Korean food, so he judges the pickled ones hardest. I make extra when I know he's coming.",
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
      "josh-writing",
      "What does Josh write?",
      "His portfolio mostly, and he rewrites it constantly. He treats every sentence like code. If it reads clean, assume it took him four passes.",
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
      "Lifelong Niners fan. Not the fairweather kind either; he's been through the bad years and stayed. He still talks about the dynasty names like he saw them live.",
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
      "kelix",
      "Who made these beats?",
      "Josh did, under the name kelix. He makes this stuff at night after work. Some of the tracks on his SoundCloud started as pad patterns in here.",
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
      "josh-go",
      "Ever play Josh?",
      "A few times. He reads the board like a puzzle, quiet for a while and then three moves at once. Won our last game by two points and was polite about it, which was worse.",
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
      "mail",
      "Who gets the most mail?",
      "Josh, by a mile. Internship letters, rowing schedules, sound cards he ordered at two in the morning. Half of it goes to the Cognition office these days.",
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
      "wall",
      "Who else posts here?",
      "Josh posts a strip every time he visits. He leads the Korea work at Cognition, so this wall is half travel log at this point.",
    ),
  ],
  "park-guide": [
    ask(
      "bridge",
      "What can I see from there?",
      "The skyline across the river. Walk out to the middle if you have time. Josh does it every visit, says it's the best view in either of his cities.",
      "river",
    ),
    ask(
      "long-way",
      "What's the long way?",
      "Follow the path along the water first. A bit farther, but there are benches.",
    ),
    ask(
      "josh",
      "Does Josh come here?",
      "Whenever he's in town. He works on the Korea side of things at Cognition, and this park is where he walks off the jet lag before he goes in.",
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
      "josh",
      "What's Josh doing here?",
      "He leads the Korea effort at Cognition. He says the office is close enough to walk to, then takes the long way over this bridge anyway. I think he just likes the view.",
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
      "josh",
      "Does Josh fish?",
      "No, but he likes it out here. He says the quiet helps him think through work, then he goes back to Cognition and calls it a walk. It's fishing without a rod, basically.",
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
      "cognition",
      "What is this place?",
      "Josh's building, sort of. He works at Cognition and leads the Korea effort there. He'd explain what that means but he'd probably turn it into a diagram.",
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
      "regulars",
      "Who eats here?",
      "Everyone eventually. Josh comes by when he's in Korea for work. He orders the same thing every time and pretends he's going to try something new.",
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
      "josh",
      "What does Josh like?",
      "Anything with rice, and he always asks if there are extra pickled sides. He cooks a little himself, mostly Korean things his mom made. Says the kimchi here almost passes.",
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
      "josh",
      "Does Josh garden?",
      "Not really, but he likes that the herbs end up in the kitchen. He says it's the one supply chain he'll never have to debug.",
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
      "josh",
      "Does Josh run?",
      "He rows instead. Walked on to the crew team freshman year at Stanford and now he's the coxswain. He claims rowing ruined running for him because you face backwards.",
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
      "cognition",
      "What's the big building?",
      "The Cognition office. Josh works there, leading the Korea side of things. He builds software that builds software, or something like that. It took me three explanations to get this far.",
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
      "josh",
      "What does Josh study?",
      "CS and math, both at once, which seems like doing homework twice but he likes it. Between that and crew I don't know when he sleeps.",
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
      "josh",
      "Does Josh read here?",
      "More like works here. He'll have his laptop out and say he's just checking one thing, then look up three hours later surprised it's dark.",
    ),
  ],
  visitor: [
    ask(
      "first",
      "What did you see first?",
      "The tower. I kept using it to work out which way I'd come, which Josh says is basically a campus survival skill.",
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
      "Josh Koo. He made this whole world as his portfolio. Stanford CS and math, coxswain on the crew team, and he works at Cognition leading the Korea effort. Every spot here is somewhere that means something to him.",
    ),
    ask(
      "else",
      "What else does he do?",
      "Makes music as kelix on SoundCloud, skates the paths when they're dry, and argues about LeBron like it's a research project. Also a lifelong Niners fan, so he's used to heartbreak.",
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
      "Find a pace you can hold. Save a burst for the finish. Josh learned that the year he walked on, the season nobody expected him to stick around.",
    ),
    ask(
      "josh",
      "How'd Josh end up a coxswain?",
      "He walked on freshman year with no experience, which is exactly when you shouldn't pick a sport you have to learn backwards. But he listened, called clean, and never missed a practice. Now he steers.",
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
      "josh",
      "Does Josh play?",
      "He watches more than he plays, but he's a LeBron guy so he knows every highlight. He'll beat you at HORSE on fundamentals and then apologize about it.",
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
      "Yeah, that's his thing. Beats on SoundCloud, late night sessions in the lab. He says production is just debugging for your ears, which is such a Josh sentence.",
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
      "What does Josh pick?",
      "Whatever he hasn't sampled yet. He listens for the gaps in the record, places where he can put his own sounds. Explains why his kelix tracks never sound like the source.",
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
      "He built this neighborhood out of his own routine. The house, the garden, the kitchen. It's not his actual street, but it might as well be.",
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
      "Same order every time, which for someone who grew up on Korean food is a compliment. He knows the sides are the whole point.",
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
      "josh",
      "Seen Josh around?",
      "He ends up on a bench here sometimes with a coffee, answering emails from the Cognition office on his laptop. The grass version of a desk.",
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
      "When he's working on the Korea side at Cognition, this is his evening loop. He says the river is the only part of his calendar that runs on time.",
    ),
  ],
  rower: [
    ask(
      "boat",
      "How do I get on the water?",
      "Head into the boathouse and look for the race prompt by the dock.",
      "oar",
    ),
    ask(
      "cox",
      "What's a coxswain do?",
      "Steers the boat and calls the rhythm. It's the only seat that faces the other direction, which is probably why Josh likes it.",
    ),
    ask(
      "josh",
      "How'd Josh start rowing?",
      "He walked on at Stanford as a freshman, no experience, just showed up. Everyone assumed he'd quit by winter. Now he's the one telling the boat when to pull.",
    ),
  ],
  neighbor: [
    ask(
      "house",
      "Whose house is this?",
      "Josh's, in spirit at least. He made this corner of the world from the neighborhood where he grew up, give or take the better weather.",
    ),
    ask(
      "hang",
      "What's going on inside?",
      "The usual. People dropping by, something on the stove. Josh keeps the door open for anyone who finds their way here.",
      "garden",
    ),
    ask(
      "josh",
      "What's Josh like?",
      "Quiet until you get him started. Then it's crew, or LeBron, or whatever beat he's building as kelix that week. He's easy to find. Just follow the sound of someone explaining something.",
    ),
  ],
  classmate: [
    ask(
      "late",
      "Late for what?",
      "Math lab. Third time this week. Josh says he'd help but he took the same class last year and still has the habit of going.",
    ),
    ask(
      "major",
      "What's Josh studying?",
      "CS and math together. He says they reinforce each other, which I believe, since he debugs proofs like they're code.",
      "tangram",
    ),
    ask(
      "josh",
      "Does Josh tutor?",
      "Unofficially. He'll sit down next to you, look at your problem for two minutes, and then draw a picture that somehow makes it obvious. Then he apologizes for being late to crew.",
    ),
  ],
  regular: [
    ask(
      "lunch",
      "What's good here?",
      "All of it, honestly. Josh orders the rice and every side on the table. He says a meal without the pickled dishes is just a snack.",
      "picnic",
    ),
    ask(
      "often",
      "Eat here a lot?",
      "Most days. Josh does the same when he's around. It's the kind of place you end up at whether you meant to or not.",
    ),
    ask(
      "josh",
      "What's Josh's routine?",
      "Crew in the morning, classes through the day, Cognition work in the evenings, and this table whenever there's time. He's the most scheduled person I've ever met.",
    ),
  ],
  lifter: [
    ask(
      "program",
      "What are you training for?",
      "Eight clean reps, mostly so I can say I did them. Josh's version of this is rowing, which is somehow both harder and quieter.",
    ),
    ask(
      "gym",
      "What's in the gym?",
      "Weights, a couple of machines, and whoever's taking a break from the real workout outside.",
    ),
    ask(
      "josh",
      "Does Josh lift?",
      "He coxes instead, which is cardio and yelling at the same time. He walked on to the crew team as a freshman and it's been his whole athletic personality since.",
    ),
  ],
  researcher: [
    ask(
      "work",
      "What are you working on?",
      "A problem that's been stuck in my head all week. I came out here to think, which is apparently what Josh does too.",
    ),
    ask(
      "cognition",
      "What is this office?",
      "The Cognition building. Josh works there leading the Korea effort. He builds the stuff that makes other people's work faster, which sounds abstract until you see him do it.",
      "campus",
    ),
    ask(
      "josh",
      "What's Josh's job?",
      "He works at Cognition on the Korea side. Before that he was an investment intern at CRV, which is a very different kind of busy. He says he likes this better because he actually ships things.",
    ),
  ],
};

export const topicsFor = (npcId: string): readonly NpcTopic[] =>
  topics[npcId] ?? [];
