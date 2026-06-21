import type { SkillAxis } from "./skills.ts";

// The city: a grid of districts. Content-only — the engine reads these to
// build the runtime map. Designed to scale (just add rows/cols of entries).

export interface DistrictSeed {
  id: string;
  name: string;
  x: number; // column, 0-indexed
  y: number; // row, 0-indexed
  wealth: number; // 1–3: drives case payoffs and difficulty
  dominantSkill: SkillAxis; // the kind of work this district tends to offer
  isHome?: boolean; // starts discovered with an office
}

export const CITY_COLS = 3;
export const CITY_ROWS = 3;

export const CITY: DistrictSeed[] = [
  { id: "flats", name: "The Flats", x: 0, y: 0, wealth: 1, dominantSkill: "diligence" },
  { id: "riverside", name: "Riverside", x: 1, y: 0, wealth: 2, dominantSkill: "research" },
  { id: "heights", name: "The Heights", x: 2, y: 0, wealth: 3, dominantSkill: "negotiation" },
  { id: "mill", name: "Mill District", x: 0, y: 1, wealth: 1, dominantSkill: "litigation" },
  {
    id: "downtown",
    name: "Old Downtown",
    x: 1,
    y: 1,
    wealth: 2,
    dominantSkill: "litigation",
    isHome: true,
  },
  { id: "techpark", name: "Tech Park", x: 2, y: 1, wealth: 2, dominantSkill: "networking" },
  { id: "harborview", name: "Harborview", x: 0, y: 2, wealth: 2, dominantSkill: "negotiation" },
  { id: "sunset", name: "Sunset Flats", x: 1, y: 2, wealth: 1, dominantSkill: "networking" },
  { id: "goldcoast", name: "Gold Coast", x: 2, y: 2, wealth: 3, dominantSkill: "diligence" },
];
