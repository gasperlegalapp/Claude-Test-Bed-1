import type { GameState, Staff } from "./types.ts";
import type { StaffRole } from "../data/staff.ts";
import { ROOM_TYPES, type RoomType } from "../data/rooms.ts";
import { BUILDINGS } from "../data/buildings.ts";
import type { SeatCategory } from "../data/recruits.ts";

const LAWYER_ROLES: StaffRole[] = ["Associate", "Rainmaker"];

// Which kind of seat a role needs: a private office, or a bullpen desk.
export function seatCategory(role: StaffRole): SeatCategory {
  return LAWYER_ROLES.includes(role) ? "lawyer" : "support";
}

export function roomType(typeId: string): RoomType | undefined {
  return ROOM_TYPES.find((r) => r.id === typeId);
}

export interface OfficeStats {
  slotsTotal: number;
  slotsUsed: number;
  slotsFree: number;
  lawyerSeats: number;
  supportSeats: number;
  lawyersHoused: number;
  supportHoused: number;
  caseBonus: number; // firm-wide success-score bonus
  caseCapacity: number; // extra open cases from rooms
  assetValue: number; // invested value of building + rooms (for valuation)
}

// Aggregate everything the office provides from its building tier and rooms.
export function officeStats(state: GameState): OfficeStats {
  const building = BUILDINGS[state.buildingTier];
  let lawyerSeats = 0;
  let supportSeats = 0;
  let caseBonus = 0;
  let caseCapacity = 0;
  let roomsValue = 0;

  for (const room of state.rooms) {
    const t = roomType(room.typeId);
    if (!t) continue;
    lawyerSeats += t.lawyerSeats;
    supportSeats += t.supportSeats;
    caseBonus += t.caseBonus;
    caseCapacity += t.caseCapacity;
    roomsValue += t.buildCost;
  }

  // Building asset value = the cumulative cost of reaching this tier.
  let buildingValue = 0;
  for (let i = 1; i <= state.buildingTier; i++) buildingValue += BUILDINGS[i].upgradeCost;

  let lawyersHoused = 0;
  let supportHoused = 0;
  for (const s of state.staff) {
    if (seatCategory(s.role) === "lawyer") lawyersHoused++;
    else supportHoused++;
  }

  return {
    slotsTotal: building.slots,
    slotsUsed: state.rooms.length,
    slotsFree: building.slots - state.rooms.length,
    lawyerSeats,
    supportSeats,
    lawyersHoused,
    supportHoused,
    caseBonus,
    caseCapacity,
    assetValue: roomsValue + buildingValue,
  };
}

// Is there a free seat of the kind this role needs?
export function hasFreeSeat(state: GameState, role: StaffRole): boolean {
  const stats = officeStats(state);
  return seatCategory(role) === "lawyer"
    ? stats.lawyersHoused < stats.lawyerSeats
    : stats.supportHoused < stats.supportSeats;
}

export function staffSeatCategory(s: Staff): SeatCategory {
  return seatCategory(s.role);
}
