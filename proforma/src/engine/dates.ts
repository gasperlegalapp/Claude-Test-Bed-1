// Every date in this app is a calendar date, never an instant. Storing them as
// plain YYYY-MM-DD strings and doing the arithmetic in UTC keeps a fee petition
// filed on the 1st from drifting to the 31st depending on who opens the file.

const MS_PER_DAY = 86_400_000;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * MS_PER_DAY);
}

/** Calendar days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  // Clamp to the last day of the target month so Jan 31 + 1 month is Feb 28.
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return fromUtc(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)),
  );
}

export function addYears(iso: string, years: number): string {
  return addMonths(iso, years * 12);
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const dow = new Date(toUtc(iso)).getUTCDay(); // 0 = Sunday
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
}

export function formatMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${names[m - 1]} ${String(y).slice(2)}`;
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
