export default function StatusChip({ status, label }) {
  if (status === "ok" || status === "success") {
    return <span className="chip ok">{label || "terkirim"}</span>;
  }
  if (status === "skipped") {
    return <span className="chip neutral">{label || "sudah ada"}</span>;
  }
  return <span className="chip fail">{label || "gagal"}</span>;
}
