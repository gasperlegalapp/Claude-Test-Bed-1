// The office floor — a fixed set of rooms matching the floor-plan artwork.
// Each room references a RoomType (for its seats/bonus/cost) and either starts
// built or is built out later. "Expansion" means building these rooms.

export interface FloorRoom {
  id: string; // matches a zone id in the floor-plan art
  typeId: string; // references ROOM_TYPES
  startBuilt: boolean;
}

export const FLOOR: FloorRoom[] = [
  { id: "office1", typeId: "office", startBuilt: true },
  { id: "office2", typeId: "office", startBuilt: true },
  { id: "office3", typeId: "office", startBuilt: false },
  { id: "office4", typeId: "office", startBuilt: false },
  { id: "openwork", typeId: "openwork", startBuilt: true },
  { id: "reception", typeId: "lobby", startBuilt: true },
  { id: "conference", typeId: "conference", startBuilt: false },
  { id: "kitchen", typeId: "kitchen", startBuilt: false },
  { id: "storage", typeId: "storage", startBuilt: false },
  { id: "bathroom", typeId: "bathroom", startBuilt: false },
];

export function floorRoom(id: string): FloorRoom | undefined {
  return FLOOR.find((r) => r.id === id);
}
