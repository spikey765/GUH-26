const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m - 1, d };
}

export function shortDate(iso: string) {
  const { m, d } = parts(iso);
  return `${d} ${MONTHS[m]}`;
}

export function longDate(iso: string) {
  const { m, d } = parts(iso);
  return `${d} ${LONG_MONTHS[m]}`;
}

export function monthShort(iso: string) {
  return MONTHS[parts(iso).m];
}

export function dayNum(iso: string) {
  return parts(iso).d;
}

export function pounds(n: number, opts: { pence?: boolean } = {}) {
  const neg = n < 0;
  const v = Math.abs(n);
  const s = opts.pence ? v.toFixed(2) : Math.round(v).toLocaleString("en-GB");
  return `${neg ? "-" : ""}£${s}`;
}

export function whenText(days: number) {
  if (days <= 0) return "Now";
  if (days === 1) return "Tomorrow";
  if (days < 14) return `In ${days} days`;
  if (days < 60) return `In ${Math.round(days / 7)} weeks`;
  return `In ${Math.round(days / 30)} months`;
}
