export const fmtTs = (ts) => (ts ? new Date(ts).toLocaleString("id-ID") : "—");

export const fmtNum = (n) => (n ?? 0).toLocaleString("id-ID");

export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);

export function relDate(dstr) {
  if (!dstr) return null;
  const d = new Date(dstr.length === 10 ? dstr + "T00:00:00" : dstr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  const diff = Math.round((today - t) / 864e5);
  if (diff <= 0) return "hari ini";
  if (diff === 1) return "kemarin";
  if (diff < 30) return `${diff} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function isStale(dstr, days = 30) {
  if (!dstr) return true;
  const d = new Date(dstr.length === 10 ? dstr + "T00:00:00" : dstr);
  return Date.now() - d.getTime() > days * 864e5;
}

export function needsAttention(r) {
  if (!r.last_lesson_date) return true;
  if (r.total_progress > 0 && r.latest_progress === 0) return true;
  return isStale(r.last_lesson_date);
}