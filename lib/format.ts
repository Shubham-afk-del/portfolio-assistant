/** Presentation helpers. No content decisions live here, only formatting. */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "2023-06" to "Jun 2023", "2025-10-28" to "28 Oct 2025", "2024" to "2024".
 * Passes through anything it doesn't recognise rather than guessing.
 */
export function monthLabel(value: string | number): string {
  const text = String(value);

  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (day !== null) {
    const month = MONTHS[Number(day[2]) - 1];
    if (month !== undefined) return `${Number(day[3])} ${month} ${day[1]}`;
  }

  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (match === null) return text;
  const month = MONTHS[Number(match[2]) - 1];
  return month === undefined ? text : `${month} ${match[1]}`;
}

/** Inclusive month count between two YYYY-MM values, rendered as "2 yr 7 mo". */
export function duration(start: string, end: string): string | undefined {
  const parse = (v: string): [number, number] | undefined => {
    const m = /^(\d{4})-(\d{2})$/.exec(v);
    return m === null ? undefined : [Number(m[1]), Number(m[2])];
  };
  const from = parse(start);
  const to = end === "present" ? undefined : parse(end);
  if (from === undefined) return undefined;

  const now = new Date();
  const [ty, tm] = to ?? [now.getFullYear(), now.getMonth() + 1];
  const months = (ty - from[0]) * 12 + (tm - from[1]) + 1;
  if (months <= 0) return undefined;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} mo`;
  if (rest === 0) return `${years} yr`;
  return `${years} yr ${rest} mo`;
}

/**
 * Strips a trailing "TODO(owner): ..." note from a field that is otherwise
 * filled in. lib/schema.ts flags a field as outstanding only when the marker
 * starts the string, so evidence lines that end with a note to self would
 * otherwise render that note to visitors.
 */
export function withoutTodo(value: string): string {
  const cut = value.indexOf("TODO(owner)");
  return (cut === -1 ? value : value.slice(0, cut)).trim();
}
