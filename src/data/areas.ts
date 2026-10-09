// Areas of law. Staff "know" some of these; matters belong to one. An attorney
// can only work a matter in an area they practice. Pure content.

export interface LawArea {
  id: string;
  name: string;
  blurb: string;
}

export const LAW_AREAS: LawArea[] = [
  { id: "criminal", name: "Criminal", blurb: "DUIs to felonies. Always a trial waiting to happen." },
  { id: "family", name: "Family", blurb: "Divorce, custody, prenups. High emotion, steady demand." },
  { id: "civil", name: "Civil Litigation", blurb: "Contract fights and injury claims that end in a verdict." },
  { id: "probate", name: "Probate & Estate", blurb: "Wills, trusts, and administering estates. Mostly paperwork." },
  { id: "malpractice", name: "Malpractice", blurb: "Suing professionals who got it badly wrong. Big, slow cases." },
  { id: "employment", name: "Employment", blurb: "Wrongful termination, handbooks, severance. A bit of both." },
  { id: "bankruptcy", name: "Bankruptcy", blurb: "Chapter 7 and 13 filings. Reliable transactional volume." },
  { id: "business", name: "Business", blurb: "Formations, leases, deals — and the occasional partnership war." },
];

export function lawArea(id: string): LawArea | undefined {
  return LAW_AREAS.find((a) => a.id === id);
}
