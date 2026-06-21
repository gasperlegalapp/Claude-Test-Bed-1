// Room types you can build into the office floor plan. Each room contributes
// some mix of: staff seats (which gate hiring), a firm-wide case-success bonus,
// and case capacity (how many matters you can have open). Pure content.

export interface RoomType {
  id: string;
  name: string;
  description: string;
  buildCost: number;
  attorneySeats: number; // private-office seats for attorneys
  supportSeats: number; // bullpen desks for paralegals/assistants
  receptionSeats: number; // front-desk seats for receptionists
  caseBonus: number; // flat success-score bonus on every matter
  caseCapacity: number; // extra open matters the firm can juggle
}

export const ROOM_TYPES: RoomType[] = [
  {
    id: "lobby",
    name: "Lobby",
    description:
      "A reception desk and a waiting area. Seats a receptionist and brings in more walk-in work.",
    buildCost: 4000,
    attorneySeats: 0,
    supportSeats: 0,
    receptionSeats: 1,
    caseBonus: 0,
    caseCapacity: 2,
  },
  {
    id: "office",
    name: "Attorney's Office",
    description: "A door that closes and a window that doesn't. Seats one attorney.",
    buildCost: 5000,
    attorneySeats: 1,
    supportSeats: 0,
    receptionSeats: 0,
    caseBonus: 0,
    caseCapacity: 0,
  },
  {
    id: "bullpen",
    name: "Bullpen",
    description:
      "An open pit of desks for paralegals and legal assistants. Seats four.",
    buildCost: 6000,
    attorneySeats: 0,
    supportSeats: 4,
    receptionSeats: 0,
    caseBonus: 0,
    caseCapacity: 0,
  },
  {
    id: "conference",
    name: "Conference Room",
    description:
      "A long table for impressing clients and out-maneuvering opposing counsel.",
    buildCost: 8000,
    attorneySeats: 0,
    supportSeats: 0,
    receptionSeats: 0,
    caseBonus: 3,
    caseCapacity: 0,
  },
  {
    id: "kitchen",
    name: "Kitchen",
    description:
      "Good coffee and a fridge that works. Quietly makes everyone a little better.",
    buildCost: 5000,
    attorneySeats: 0,
    supportSeats: 0,
    receptionSeats: 0,
    caseBonus: 1,
    caseCapacity: 0,
  },
  {
    id: "breakroom",
    name: "Break Room",
    description:
      "A couch and a ping-pong table — somewhere to decompress between depositions.",
    buildCost: 4500,
    attorneySeats: 0,
    supportSeats: 0,
    receptionSeats: 0,
    caseBonus: 1,
    caseCapacity: 0,
  },
  {
    id: "storage",
    name: "Storage Room",
    description:
      "Banker's boxes to the ceiling. Lets the firm keep more open matters straight.",
    buildCost: 4000,
    attorneySeats: 0,
    supportSeats: 0,
    receptionSeats: 0,
    caseBonus: 0,
    caseCapacity: 2,
  },
];
