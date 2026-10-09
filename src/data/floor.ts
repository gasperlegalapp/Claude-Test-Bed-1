// The office floor — a fixed set of rooms matching the floor-plan artwork.
// The whole floor is always in use; renting the office grants every room.

export interface FloorRoom {
  id: string; // matches a zone id in the floor-plan art
  typeId: string; // references ROOM_TYPES
}

export const FLOOR: FloorRoom[] = [
  { id: "office1", typeId: "office" },
  { id: "office2", typeId: "office" },
  { id: "office3", typeId: "office" },
  { id: "office4", typeId: "office" },
  { id: "openwork", typeId: "openwork" },
  { id: "reception", typeId: "lobby" },
  { id: "conference", typeId: "conference" },
  { id: "kitchen", typeId: "kitchen" },
  { id: "storage", typeId: "storage" },
  { id: "bathroom", typeId: "bathroom" },
];
