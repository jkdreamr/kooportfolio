export type NpcPicture = "campus" | "oar" | "go" | "river" | "booth";

export type NpcTopic = {
  id: string;
  label: string;
  reply: string;
  picture?: NpcPicture;
};

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
        "Head west for the boathouse. If you hit the court, you've gone the other way.",
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
      reply: "Four pads. Hit them as the notes come down. Easier if you listen first.",
    },
  ],
  hooper: [
    {
      id: "shoot",
      label: "How do I shoot?",
      reply:
        "Hold to build power, then release. Try a short shot before you move back.",
    },
    {
      id: "challenge",
      label: "Want to play?",
      reply: "You go ahead. I'm still catching my breath.",
    },
  ],
};

export const topicsFor = (npcId: string): readonly NpcTopic[] =>
  topics[npcId] ?? [];
