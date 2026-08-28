/**
 * Progress bar proses panjang (R14) — track + fill + persen + label.
 */
export default function Progress({ current, total, label }) {
  const cur = Number(current) || 0;
  const tot = Number(total) || 0;
  const pct = tot > 0 ? Math.round((cur / tot) * 100) : 0;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={tot}
      aria-valuenow={cur}
      aria-label={label || "Progres"}
    >
      <div className="progress-head">
        <span className="progress-label">{label}</span>
        <span className="mono small muted">{pct}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
