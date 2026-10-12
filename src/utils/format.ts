const K = 1024;
const M = K * K;
const G = M * K;

const num = (v: number, digits: number) => v.toFixed(digits).replace('.', ',');

/** Value and unit separately, for big figures. Binary units like the operators (1 Go = 1024 Mo). */
export function bytesParts(b: number): { value: string; unit: string } {
  const v = Math.max(0, b || 0);
  if (v >= G) return { value: num(v / G, v >= 100 * G ? 0 : v >= 10 * G ? 1 : 2), unit: 'Go' };
  if (v >= M) return { value: num(v / M, v >= 100 * M ? 0 : 1), unit: 'Mo' };
  if (v >= K) return { value: num(v / K, 0), unit: 'Ko' };
  return { value: String(Math.round(v)), unit: 'o' };
}

export function fmtBytes(b: number) {
  const p = bytesParts(b);
  return `${p.value} ${p.unit}`;
}

/** Bytes per second. */
export function speedParts(bps: number): { value: string; unit: string } {
  const v = Math.max(0, bps || 0);
  if (v >= M) return { value: num(v / M, v >= 10 * M ? 0 : 1), unit: 'Mo/s' };
  if (v >= K) return { value: num(v / K, 0), unit: 'Ko/s' };
  return { value: String(Math.round(v)), unit: 'o/s' };
}

export function fmtSpeed(bps: number) {
  const p = speedParts(bps);
  return `${p.value} ${p.unit}`;
}

/** Megabits per second, as speed tests show it. */
export function fmtMbps(mbps: number) {
  const v = Math.max(0, mbps || 0);
  return v >= 100 ? num(v, 0) : v >= 10 ? num(v, 1) : num(v, 2);
}

export function fmtMs(ms: number) {
  if (!(ms >= 0)) return '—';
  return ms >= 100 ? `${Math.round(ms)}` : num(ms, ms >= 10 ? 0 : 1);
}

export function fmtDuration(ms: number) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${String(min % 60).padStart(2, '0')}`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d} j ${rh} h` : `${d} j`;
}

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const DAYS_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function dayShort(ts: number) {
  return DAYS_SHORT[new Date(ts).getDay()];
}

export function dayName(ts: number) {
  return DAYS[new Date(ts).getDay()];
}

export function fmtDate(ts: number, withYear = false) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;
}

export function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDateTime(ts: number) {
  return `${fmtDate(ts)} à ${fmtTime(ts)}`;
}

export function relative(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'à l’instant';
  if (diff < 3_600_000) return `il y a ${Math.round(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.round(diff / 3_600_000)} h`;
  if (diff < 7 * 86_400_000) return `${dayName(ts)} ${fmtTime(ts)}`;
  return fmtDate(ts);
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n > 1 ? many : one}`;
}

export function startOfDay(offset = 0, now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.getTime();
}

export const GB = G;
export const MB = M;
