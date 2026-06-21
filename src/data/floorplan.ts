// ---------------------------------------------------------------------------
// Floor-plan artwork + overlay configuration.
//
// The plan is rendered as YOUR top-down floor-plan image with staff figures
// and room states overlaid on top. This file is the bridge between the art and
// the game: for each office (building tier) it holds the image and, for every
// room zone, where it sits on the image and where people sit inside it.
//
// HOW TO PLUG IN YOUR ART
// 1. Drop the image in src/assets/ (e.g. office-small.png). PNG or SVG.
// 2. At the top of this file:  import officeSmall from "../assets/office-small.png";
// 3. Set `image: officeSmall` and `aspect` (image width / height).
// 4. Fill `zones` — one per room, in the order the game should fill them.
//    All coordinates are PERCENTAGES of the image (0–100), origin top-left.
//      x,y,w,h  -> the room's rectangle (used for clicking + dimming)
//      seats[]  -> {x,y} for each desk/chair where a staffer appears
//    Send me the image and I'll measure these for you if you'd rather not.
//
// While `image` is null the game falls back to the built-in plan, so nothing
// breaks before the art lands.
// ---------------------------------------------------------------------------

export interface FpSeat {
  x: number;
  y: number;
}

export interface FpZone {
  x: number;
  y: number;
  w: number;
  h: number;
  labelX?: number;
  labelY?: number;
  seats: FpSeat[];
}

export interface FloorPlanArt {
  image: string | null;
  aspect: number; // image width / height
  zones: FpZone[]; // one per room slot, in fill order
}

// One entry per building tier (Walk-Up, Midtown Suite, Downtown Tower).
export const FLOORPLANS: FloorPlanArt[] = [
  { image: null, aspect: 1.4, zones: [] },
  { image: null, aspect: 1.4, zones: [] },
  { image: null, aspect: 1.4, zones: [] },
];

export function floorPlanArt(tier: number): FloorPlanArt {
  return FLOORPLANS[tier] ?? FLOORPLANS[0];
}
