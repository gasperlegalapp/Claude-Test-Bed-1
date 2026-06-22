import type { GameState } from "./types.ts";
import { ROLE_DEFS, type SeatKind, type StaffRole } from "../data/staff.ts";
import { ROOM_TYPES, type RoomType } from "../data/rooms.ts";

export function seatKind(role: StaffRole): SeatKind {
  return ROLE_DEFS[role].seat;
}

export function roomType(typeId: string): RoomType | undefined {
  return ROOM_TYPES.find((r) => r.id === typeId);
}

export interface OfficeStats {
  attorneySeats: number;
  supportSeats: number;
  receptionSeats: number;
  attorneysHoused: number;
  supportHoused: number;
  receptionHoused: number;
  caseBonus: number;
  caseCapacity: number;
  assetValue: number;
}

export function officeStats(state: GameState): OfficeStats {
  let attorneySeats = 0;
  let supportSeats = 0;
  let receptionSeats = 0;
  let caseBonus = 0;
  let caseCapacity = 0;
  let roomsValue = 0;

  for (const room of state.rooms) {
    const t = roomType(room.typeId);
    if (!t) continue;
    attorneySeats += t.attorneySeats;
    supportSeats += t.supportSeats;
    receptionSeats += t.receptionSeats;
    caseBonus += t.caseBonus;
    caseCapacity += t.caseCapacity;
    roomsValue += t.buildCost;
  }

  let attorneysHoused = 0;
  let supportHoused = 0;
  let receptionHoused = 0;
  for (const s of state.staff) {
    const k = seatKind(s.role);
    if (k === "office") attorneysHoused++;
    else if (k === "bullpen") supportHoused++;
    else receptionHoused++;
  }

  return {
    attorneySeats,
    supportSeats,
    receptionSeats,
    attorneysHoused,
    supportHoused,
    receptionHoused,
    caseBonus,
    caseCapacity,
    assetValue: roomsValue,
  };
}

// Is there a free seat of the kind this role needs?
export function hasFreeSeat(state: GameState, role: StaffRole): boolean {
  const s = officeStats(state);
  const k = seatKind(role);
  if (k === "office") return s.attorneysHoused < s.attorneySeats;
  if (k === "bullpen") return s.supportHoused < s.supportSeats;
  return s.receptionHoused < s.receptionSeats;
}

// How many active matters a staffer is currently on.
export function staffLoad(state: GameState, staffId: string): number {
  let n = 0;
  for (const m of state.matters) {
    if (m.status === "active" && m.staffIds.includes(staffId)) n++;
  }
  return n;
}

export function roleCapacity(role: StaffRole): number {
  return ROLE_DEFS[role].capacity;
}

// Spare capacity = how many more matters this staffer could take on.
export function spareCapacity(state: GameState, staffId: string): number {
  const s = state.staff.find((x) => x.id === staffId);
  if (!s) return 0;
  return roleCapacity(s.role) - staffLoad(state, staffId);
}

// How many of a role the firm already employs (for max-count enforcement).
export function roleCount(state: GameState, role: StaffRole): number {
  return state.staff.filter((s) => s.role === role).length;
}
