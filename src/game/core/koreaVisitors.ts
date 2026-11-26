import type { Villager } from "./npcs";

/**
 * Visitors who explain the Korea landmarks. Fictional people; the facts are
 * the widely documented ones (dates from the Cultural Heritage
 * Administration / standard references), kept short and non-controversial.
 * Each wanders a small loop by "their" landmark so the existing talk system
 * (E / click, Next, "Walk to …") works unchanged.
 */
export const KOREA_VISITORS: Villager[] = [
  {
    id: "palace-guide",
    name: "Tour guide",
    color: "#3f6e8c",
    skin: "#d9a77f",
    hat: true,
    place: "gwanghwamun",
    lines: [
      "Welcome to Gyeongbokgung. It was built in 1395, three years after the Joseon dynasty began.",
      "Gwanghwamun is its main gate. The palace burned down in 1592 and was rebuilt in the 1860s.",
      "See the colours under the eaves? That painting is called dancheong. It protects the wood and marks an important building.",
    ],
    route: [
      [-25.5, -12],
      [-18.5, -12],
      [-18.5, -8.6],
      [-25.5, -8.6],
    ],
  },
  {
    id: "hall-docent",
    name: "Docent",
    color: "#7a5a86",
    skin: "#c99572",
    hat: false,
    place: "gwanghwamun",
    lines: [
      "This hall is modelled on Geunjeongjeon, the throne hall of Gyeongbokgung.",
      "Coronations and state ceremonies were held there. Officials lined up in the courtyard by rank.",
      "The little pavilion on the pond is Hyangwonjeong. Its name means the pavilion of far-reaching fragrance.",
    ],
    route: [
      [-27, 28.4],
      [-20.5, 28.4],
      [-20.5, 31.8],
      [-27, 32],
    ],
  },
  {
    id: "hanok-grandmother",
    name: "Grandmother",
    color: "#b4646e",
    skin: "#d6a986",
    hat: false,
    place: "bukchon",
    lines: [
      "I grew up in a house just like these. A hanok stays cool in summer and warm in winter.",
      "The floor heating is called ondol. Heat from the kitchen fire runs under the stone floor.",
      "Bukchon sits between Gyeongbokgung and Changdeokgung. Many of these homes are about a hundred years old.",
    ],
    route: [
      [-48, -14.4],
      [-33.6, -14.4],
      [-33.6, -9.6],
      [-38, -14.8],
    ],
  },
  {
    id: "astronomy-student",
    name: "Astronomy student",
    color: "#4d7a63",
    skin: "#e0b48f",
    hat: false,
    place: "sejong",
    lines: [
      "This is Cheomseongdae. It was built in the 7th century, during Queen Seondeok's reign in Silla.",
      "It's one of the oldest surviving astronomical observatories in East Asia. The real one stands in Gyeongju.",
      "It's made of about 362 stones. Some say that matches the days in a lunar year.",
    ],
    route: [
      [-27.6, 28.2],
      [-27.6, 32.6],
      [-31.6, 32.8],
      [-29.8, 27.4],
    ],
  },
  {
    id: "city-wall-walker",
    name: "Hiker",
    color: "#8a6a3c",
    skin: "#b98463",
    hat: true,
    place: "sejong",
    lines: [
      "Sungnyemun was the south gate of Seoul's old city wall. It was completed in 1398.",
      "Most people call it Namdaemun, the Great South Gate.",
      "It was badly damaged by a fire in 2008 and reopened in 2013 after a careful restoration.",
    ],
    route: [
      [-43, 12],
      [-33, 12],
      [-33, 15.4],
      [-42, 15.2],
    ],
  },
  {
    id: "temple-visitor",
    name: "Temple visitor",
    color: "#a8774a",
    skin: "#cf9f7c",
    hat: false,
    place: "bridge",
    lines: [
      "This pagoda is modelled on Seokgatap at Bulguksa, a temple in Gyeongju. The original dates to the 8th century.",
      "Restorers found a printed Buddhist sutra inside it, one of the oldest surviving woodblock prints in the world.",
      "Its neighbour at Bulguksa is Dabotap. One is plain and calm, the other richly carved.",
    ],
    route: [
      [-21.6, 19.6],
      [-16, 19.6],
      [-16, 24.5],
      [-20.8, 27.8],
    ],
  },
  {
    id: "tower-fan",
    name: "K-pop fan",
    color: "#d07aa0",
    skin: "#e3b998",
    hat: false,
    place: "namsan",
    lines: [
      "N Seoul Tower sits on Namsan, right in the middle of the city. It opened to the public in 1980.",
      "Couples leave love locks on the fences up top. There are thousands of them.",
      "I always come here before a concert. The view calms me down.",
    ],
    route: [
      [-38.5, -27],
      [-31, -27.1],
      [-27.5, -24.5],
      [-36, -24],
    ],
  },
  {
    id: "architecture-student",
    name: "Architecture student",
    color: "#5b6f9e",
    skin: "#a8775a",
    hat: false,
    place: "photo",
    lines: [
      "That curved building is modelled on Dongdaemun Design Plaza by Zaha Hadid. It opened in 2014.",
      "There's hardly a straight line on it. Its skin is tens of thousands of aluminium panels.",
      "The tall one up on the hill is like Lotte World Tower: 555 metres, the tallest building in Korea.",
    ],
    route: [
      [8.8, -10.6],
      [19.3, -10.4],
      [19.3, -2.6],
      [8.8, -2.6],
    ],
  },
];
