// Office buildings: each tier provides a number of room slots. "Buying a new
// office" upgrades to the next tier for more space. Pure content.

export interface Building {
  id: string;
  name: string;
  slots: number; // room slots this building provides
  upgradeCost: number; // cost to move up to this tier (0 for the starting one)
  description: string;
}

export const BUILDINGS: Building[] = [
  {
    id: "walkup",
    name: "Cramped Walk-Up",
    slots: 6,
    upgradeCost: 0,
    description:
      "A third-floor walk-up above a sandwich shop. It smells of ambition and pastrami.",
  },
  {
    id: "suite",
    name: "Midtown Suite",
    slots: 12,
    upgradeCost: 35000,
    description:
      "Real elevators, a real reception desk, and a lease you can almost afford.",
  },
  {
    id: "tower",
    name: "Downtown Tower",
    slots: 20,
    upgradeCost: 90000,
    description:
      "Floor-to-ceiling glass and a view of every rival you intend to bury.",
  },
];
