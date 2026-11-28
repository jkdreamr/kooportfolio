/**
 * NPC conversations as short trees: a few spoken lines, then one or two
 * choice points (2–3 options each) whose replies differ, some ending in a
 * deed (walk somewhere, start a quest). Six villagers have hand-written
 * scripts; everyone else gets one composed from their own lines and topics
 * (npcs.ts, npcTopics.ts), so no villager is a single bubble any more.
 *
 * Facts about Josh come only from src/content (profile.ts, room-stories.ts).
 */
import type { Villager } from "./npcs";
import { registerScriptWriter } from "./npcState";
import { topicsFor, type NpcPicture } from "./npcTopics";
import type { RegionalAction } from "./regionalActivities";
import { belongsToWorld, WORLD_IDS, type WorldId } from "./worlds";

export type Mood = "neutral" | "happy" | "surprised";
export type Say = { text: string; mood?: Mood };
/** What a choice does once its reply has been read. */
export type Deed =
  | { walk: string }
  | { spot: RegionalAction };
export type Choice = {
  id: string;
  label: string;
  reply: readonly Say[];
  picture?: NpcPicture;
  deed?: Deed;
  /** Skip to the farewell. */
  end?: boolean;
};
export type Step = { say: Say } | { ask: readonly Choice[] };
export type Script = readonly Step[];

type Authored = {
  hello: readonly Say[];
  back: Say;
  first: readonly Choice[];
  bridge: Say;
  second: readonly Choice[];
  bye: Say;
};

const h = (text: string): Say => ({ text, mood: "happy" });
const n = (text: string): Say => ({ text, mood: "neutral" });
const s = (text: string): Say => ({ text, mood: "surprised" });
const later = (label = "Maybe later"): Choice => ({ id: "bye", label, reply: [], end: true });

const AUTHORED: Record<string, Authored> = {
  cook: {
    hello: [s("Oh! You caught me sitting down."), h("Just taking a break. The stew can mind itself for five minutes.")],
    back: h("Back again? Good. I saved you a taste."),
    first: [
      {
        id: "menu",
        label: "What's cooking?",
        reply: [n("Depends what the garden sends up. Today? Tomatoes. Again."), h("I asked for herbs. The garden has opinions.")],
        picture: "garden",
      },
      {
        id: "josh",
        label: "Does Josh cook?",
        reply: [h("He does! Josh likes cooking, and eating literally everything."), h("Honestly, the second part keeps me in business.")],
      },
    ],
    bridge: n("So, sticking around for a bit?"),
    second: [
      {
        id: "harvest",
        label: "I'll help harvest",
        reply: [s("Really? Wonderful!"), h("Pick from the beds and fill three market crates. That's a passport stamp, easy.")],
        deed: { spot: "harvest-0" },
      },
      { id: "walk", label: "Walk to Kitchen", reply: [h("Go on in. Mind the hot pans!")], deed: { walk: "kitchen" } },
      later(),
    ],
    bye: h("Don't be a stranger. There's always a spare spoon."),
  },
  postie: {
    hello: [n("I've got one envelope left and it's to ‘the quiet house.’"), s("No number. No street. Just a doodle of a porch!")],
    back: h("You again! The mailbag's lighter, but never empty."),
    first: [
      {
        id: "letter",
        label: "Can I see it?",
        reply: [h("Here. See the little porch? Somebody drew that with love.")],
        picture: "letter",
      },
      {
        id: "route",
        label: "Long route today?",
        reply: [n("Long enough. Every house gets something eventually."), h("Even the ones that only ever get flyers.")],
      },
    ],
    bridge: n("Say, you look like someone with free hands."),
    second: [
      {
        id: "post",
        label: "I'll deliver some",
        reply: [h("You're a lifesaver! Grab parcels from the postbox."), h("Four deliveries and you've earned yourself a stamp.")],
        deed: { spot: "postbox" },
      },
      { id: "walk", label: "Walk to Study", reply: [n("Try the study. If the light's on, knock.")], deed: { walk: "office" } },
      later("Not today"),
    ],
    bye: h("Thanks for the chat. Off I trot!"),
  },
  dockhand: {
    hello: [h("Morning! Well, it's always morning at a boathouse."), n("The water's flat. Perfect day to row.")],
    back: h("Back for more water? I like your style."),
    first: [
      {
        id: "stroke",
        label: "How do I steer?",
        reply: [n("A and D steer. Keep between the buoys."), s("Hit the shallows and you'll crawl. Ask me how I know.")],
        picture: "oar",
      },
      {
        id: "cox",
        label: "Who calls the shots?",
        reply: [n("The coxswain. Steers the boat and calls the rhythm for the whole crew."), h("Josh walked on to Stanford rowing as a sophomore. He coxes now.")],
      },
      {
        id: "early",
        label: "Why so early?",
        reply: [h("Glassy water, no wind, nobody yelling but the cox."), h("Best part of the day, honestly.")],
      },
    ],
    bridge: n("So, are we getting you on the water?"),
    second: [
      {
        id: "walk",
        label: "Walk to Boathouse",
        reply: [h("Head inside, find the race prompt, watch the countdown. Then pull!")],
        deed: { walk: "boathouse" },
      },
      later("Just watching"),
    ],
    bye: h("See you on the water. Hands in, backs straight!"),
  },
  researcher: {
    hello: [n("Had to get away from my screen."), h("You ever stare at a bug so long it stares back?")],
    back: h("Hey, you found me again. Still thinking, still pacing."),
    first: [
      {
        id: "cognition",
        label: "What is this office?",
        reply: [n("The Cognition building. They make Devin, the AI software engineer."), h("Josh leads their Korea efforts as Chief of Staff, APAC.")],
        picture: "campus",
      },
      {
        id: "hiring",
        label: "Is Cognition hiring?",
        reply: [s("For Korea? Yes!"), h("Message or DM Joshua. Tell him the pacing researcher sent you.")],
      },
    ],
    bridge: n("Anyway, the workshop is just up the path."),
    second: [
      { id: "walk", label: "Walk to Cognition", reply: [h("Go take a look. Mind the whiteboards.")], deed: { walk: "cognition" } },
      later("Good luck with the bug"),
    ],
    bye: h("Thanks. I think I just figured it out, actually."),
  },
  "lunch-vendor": {
    hello: [h("Hungry? You look hungry."), n("Rice, a few sides, and whatever's left in this basket.")],
    back: h("You came back! Everyone does, eventually."),
    first: [
      {
        id: "lunch",
        label: "What's good today?",
        reply: [h("Everything! But the ramen by the river is famous.")],
        picture: "picnic",
      },
      {
        id: "busy",
        label: "Busy today?",
        reply: [n("Steady. The trick is feeding people before they realize how hungry they were.")],
      },
    ],
    bridge: n("Oh, there's a guest at the picnic waiting on a bowl."),
    second: [
      {
        id: "ramen",
        label: "I'll bring the ramen",
        reply: [s("You'd do that?"), h("Grab a bowl at the counter and carry it to the picnic. Stamp's yours.")],
        deed: { spot: "ramen" },
      },
      later("I'm just looking"),
    ],
    bye: h("Mani deuseyo! Eat well!"),
  },
  "hanok-grandmother": {
    hello: [h("Come, come. Mind the step."), n("I grew up in a house just like these.")],
    back: h("Ah, you came back to see me. Sit a moment."),
    first: [
      {
        id: "ondol",
        label: "How do they stay warm?",
        reply: [n("Ondol. Heat from the kitchen fire runs under the stone floor."), h("Cool in summer, warm in winter. Clever, no?")],
      },
      {
        id: "where",
        label: "Where are we?",
        reply: [n("Bukchon, between Gyeongbokgung and Changdeokgung."), s("Many of these homes are about a hundred years old!")],
      },
    ],
    bridge: n("The palace is not far, if your legs are young."),
    second: [
      {
        id: "walk",
        label: "Walk to the palace",
        reply: [h("Through the big gate, Gwanghwamun. Say hello to the guards.")],
        deed: { walk: "gwanghwamun" },
      },
      later("I'll stay a while"),
    ],
    bye: h("Go well. Come back when the persimmons are ripe."),
  },
};

export const AUTHORED_IDS = Object.keys(AUTHORED);

const pick = <T,>(list: readonly T[], id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return list[Math.abs(hash) % list.length];
};
const worldOf = (npc: Villager): WorldId =>
  WORLD_IDS.find((world) => belongsToWorld(npc.place, world)) ?? "home";

const BRIDGES = [n("Anything else on your mind?"), n("What else can I tell you?"), h("Ask away, I've got a minute.")];
const BACKS = [h("Oh hey, you're back!"), h("Back again? Good to see you."), h("There you are! Missed me?")];
const BYES: Record<WorldId, readonly Say[]> = {
  home: [h("Come back anytime. Door's always open."), h("See you around the village!")],
  stanford: [h("Catch you around campus!"), h("Good luck out there. See you on the quad!")],
  korea: [h("Jal gayo! Take care out there."), h("See you around Seoul!")],
};

export type PlaceRef = { id: string; name: string } | undefined;

/** A villager's conversation for this visit. `again`: they have talked today. */
export function scriptFor(npc: Villager, place: PlaceRef, again = false): Script {
  const authored = AUTHORED[npc.id];
  if (authored) {
    return [
      ...(again ? [authored.back] : authored.hello).map((say) => ({ say })),
      { ask: authored.first },
      { say: authored.bridge },
      { ask: authored.second },
      { say: authored.bye },
    ];
  }
  const walk: Choice | undefined = place && {
    id: "walk",
    label: `Walk to ${place.name}`,
    reply: [h(`Right this way. Follow the path to the ${place.name}!`)],
    deed: { walk: place.id },
  };
  const bye: Choice = later("That's all for now");
  const farewell = { say: pick(BYES[worldOf(npc)], npc.id) };
  const lines = npc.lines.slice(0, 3);
  const hello: Step[] = again
    ? [{ say: pick(BACKS, npc.id) }]
    : lines.map((text, i) => ({ say: i === 0 ? h(text) : n(text) }));
  const topics = topicsFor(npc.id).map(
    (topic): Choice => ({
      id: topic.id,
      label: topic.label,
      reply: [topic.picture ? h(topic.reply) : n(topic.reply)],
      picture: topic.picture,
    }),
  );
  if (!topics.length) {
    // Guides with a short talk: the first line, then "tell me more".
    const more: Choice = {
      id: "more",
      label: "Tell me more!",
      reply: lines.slice(1).map((text, i) => (i === 0 ? s(text) : n(text))),
    };
    const first = [...(lines.length < 2 ? [] : [more]), ...(walk ? [walk] : []), bye];
    return [...(again ? hello : hello.slice(0, 1)), { ask: first }, farewell];
  }
  const firstAsk = topics.length > 1 ? topics.slice(0, 3) : [...topics, ...(walk ? [walk] : [])];
  const extras = [...(walk ? [walk] : []), bye];
  const secondAsk = [...topics.slice(3, 3 + Math.max(0, 3 - extras.length)), ...extras];
  return [...hello, { ask: firstAsk }, { say: pick(BRIDGES, npc.id) }, { ask: secondAsk }, farewell];
}

registerScriptWriter(scriptFor);
