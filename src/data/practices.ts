// Practice areas: the firm's tech tree. Unlocking one costs money + reputation
// (and sometimes a prerequisite area), and opens up new, higher-value case
// types tagged with the same id. Pure content — a dependency graph in data.

export interface PracticeArea {
  id: string;
  name: string;
  description: string;
  costMoney: number;
  costRep: number;
  prereqs: string[]; // ids that must be unlocked first
}

export const PRACTICE_AREAS: PracticeArea[] = [
  {
    id: "estate",
    name: "Estate Planning",
    description: "Wills, trusts, and the relatives who contest them at the wake.",
    costMoney: 6000,
    costRep: 6,
    prereqs: [],
  },
  {
    id: "personal-injury",
    name: "Personal Injury",
    description: "Slip, trip, and settle. High-volume, high-drama plaintiff work.",
    costMoney: 8000,
    costRep: 8,
    prereqs: [],
  },
  {
    id: "real-estate",
    name: "Real Estate",
    description: "Closings, zoning, and boundary feuds measured in inches.",
    costMoney: 7000,
    costRep: 5,
    prereqs: [],
  },
  {
    id: "corporate",
    name: "Corporate Law",
    description: "Mergers, boardrooms, and retainers with a comfortable number of zeros.",
    costMoney: 20000,
    costRep: 20,
    prereqs: ["estate"],
  },
  {
    id: "criminal",
    name: "Criminal Defense",
    description: "The marquee trials. Enormous stakes, even bigger reputation.",
    costMoney: 18000,
    costRep: 18,
    prereqs: ["personal-injury"],
  },
];
