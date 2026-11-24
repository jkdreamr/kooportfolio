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
      reply: "Hoover Tower. Hard to miss once you get down to campus.",
      picture: "campus",
    },
    {
      id: "water",
      label: "Where's the water?",
      reply:
        "Follow the campus walk past the court. The boathouse is beside the pond.",
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
      reply: "Yep. Head inside and look for the race prompt by the dock.",
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
      reply: "Try the small board inside. Black goes first.",
    },
  ],
  "bridge-cyclist": [
    {
      id: "river",
      label: "Can I cross the river?",
      reply:
        "Try the bridge. I stop halfway across just to look back at the skyline.",
      picture: "river",
    },
    {
      id: "break",
      label: "Long ride?",
      reply: "Not till I tried to ride into the wind.",
    },
  ],
  photographer: [
    {
      id: "booth",
      label: "How's the booth work?",
      reply: "Take four photos, decorate the strip, then save it or post it to the wall.",
      picture: "booth",
    },
    {
      id: "light",
      label: "Best time for a shot?",
      reply: "I like it just before dark. The lamps start to come on.",
    },
  ],
  musician: [
    {
      id: "listen",
      label: "Anything to listen to?",
      reply: "Look up kelix on SoundCloud. Try ‘back room’.",
    },
    {
      id: "make",
      label: "What's in the beat lab?",
      reply:
        "Four pads. Hit them as the notes come down. Easier if you listen first.",
      picture: "pads",
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
      "Get rolling and tap Space or Ollie. Give yourself room to land.",
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
      "Call ‘mine’ early. Saves both of you running into the middle.",
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
  ],
  visitor: [
    ask(
      "first",
      "What did you see first?",
      "The tower. I kept using it to work out which way I'd come.",
      "campus",
    ),
    ask(
      "lost",
      "Get lost?",
      "Once. Twice if you count walking right past the place.",
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
  ],
  teammate: [
    ask(
      "drill",
      "What should we practice?",
      "Make one from each side of the hoop, then trade places.",
      "court",
    ),
    ask("game", "Keeping score?", "Only if my first shot goes in."),
  ],
  producer: [
    ask(
      "birds",
      "How'd you use that sound?",
      "Leave a gap in the beat for it. No point recording a bird you can't hear.",
      "pads",
    ),
    ask("lab", "Can I try the pads?", "Go for it. I'll listen from out here."),
  ],
  "record-shopper": [
    ask(
      "choice",
      "What are you picking?",
      "The one with the better drums. Trouble is I like both.",
      "pads",
    ),
    ask("wait", "Been here long?", "Long enough to hear the same song twice."),
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
  ],
};

export const topicsFor = (npcId: string): readonly NpcTopic[] =>
  topics[npcId] ?? [];
