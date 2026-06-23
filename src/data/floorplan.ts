// Floor-plan layout + overlay coordinates. Zones are keyed by FloorRoom id.
// The plan is drawn as an SVG from these numbers (see ui/render.ts); there is
// no raster artwork. All numbers are PERCENTAGES of the plan (0–100), origin
// top-left:
//   x,y,w,h  -> the room's rectangle on the plan
//   seats[]  -> where each staff token (and its desk) sits inside the room
// Token overlays use the same percentage space, so they stay aligned.

export interface FpSeat {
  x: number;
  y: number;
}
export interface FpZone {
  x: number;
  y: number;
  w: number;
  h: number;
  seats: FpSeat[];
}
export interface FloorPlanArt {
  aspect: number; // width / height
  zones: Record<string, FpZone>;
}

export const FLOORPLAN: FloorPlanArt = {
  aspect: 1.3333,
  zones: {
    office1: { x: 3, y: 6, w: 22, h: 20, seats: [{ x: 15, y: 16 }] },
    office2: { x: 3, y: 27, w: 22, h: 19, seats: [{ x: 15, y: 37 }] },
    office3: { x: 3, y: 48, w: 22, h: 19, seats: [{ x: 15, y: 58 }] },
    office4: { x: 3, y: 68, w: 22, h: 21, seats: [{ x: 15, y: 79 }] },
    kitchen: { x: 32, y: 6, w: 19, h: 15, seats: [] },
    storage: { x: 32, y: 23, w: 19, h: 13, seats: [] },
    bathroom: { x: 32, y: 39, w: 19, h: 13, seats: [] },
    conference: { x: 29, y: 54, w: 24, h: 28, seats: [] },
    reception: { x: 31, y: 84, w: 23, h: 13, seats: [{ x: 42, y: 90 }] },
    openwork: {
      x: 55,
      y: 6,
      w: 42,
      h: 83,
      seats: [
        { x: 66, y: 18 },
        { x: 86, y: 18 },
        { x: 66, y: 45 },
        { x: 86, y: 45 },
        { x: 66, y: 72 },
        { x: 86, y: 72 },
      ],
    },
  },
};
