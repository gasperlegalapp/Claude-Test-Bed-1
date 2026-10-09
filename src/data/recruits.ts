import type { StaffRole } from "./staff.ts";

// Content for generating hireable candidates: name pools and the roles that
// turn up in the market (weighted — common roles appear more often).

export const HIREABLE_ROLES: StaffRole[] = [
  "Associate",
  "Associate",
  "Of Counsel",
  "Partner",
  "Paralegal",
  "Paralegal",
  "Legal Assistant",
  "Receptionist",
  "Managing Attorney",
];

export const FIRST_NAMES = [
  "Alex", "Jordan", "Sam", "Casey", "Morgan", "Riley", "Taylor", "Jamie",
  "Avery", "Quinn", "Devon", "Harper", "Rowan", "Sasha", "Noor", "Diego",
  "Mei", "Omar", "Yuki", "Ingrid",
];

export const LAST_NAMES = [
  "Okafor", "Bianchi", "Nguyen", "Calderon", "Hjalmarsson", "Kowalski",
  "Abara", "Delgado", "Schmidt", "Park", "Rossi", "Fontaine", "Mwangi",
  "Petrov", "Castillo", "Yamamoto", "Bauer", "Haddad", "Lindqvist", "Cruz",
];
