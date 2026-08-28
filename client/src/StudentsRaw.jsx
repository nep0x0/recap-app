import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const fmtTs = (ts) => (ts ? new Date(ts).toLocaleString("id-ID") : "—");

const titleCol = (key) =>
  key
    .split(".")
    .map((p) => p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" · ");

const fmtVal = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Ya" : "Tidak";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtTs(v);
  return String(v);
};

export default function StudentsRaw({ busy, act }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async (query) => {
    setLoading(true);
    try {
      const r = await api.students(query);
      setRows(r.students);
      setTotal(r.total);
    } catch (e) {
      setResult({ ok: false, text: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(q), 300);
    return () => clearTimeout(timer.current);
  }, [q, load]);

  const doSync = async () => {
    const r = await act("Muat data siswa", () => api.sync());
    setResult(
      r
        ? {
            ok: r.loggedIn,
            text: r.loggedIn
              ? `Selesai: ${r.inserted} siswa baru, total ${r.students} siswa (${r.pages} halaman).`
              : "Belum login — masuk dulu di halaman masuk.",
          }
        : null
    );
    load("");
  };

  const columns = [];
  const seen = new Set();
  for (const s of rows) {
    for (const k of Object.keys(s.data || {})) {
      if (k === "id" || k === "name") continue;
      if (!seen.has(k)) {
        seen.add(k);
        columns.push(k);
      }
    }
  }

  return (
    <div className="rawbody">
      {result && <div className={`banner ${result.ok ? "banner-ok" : "banner-err"}`}>{result.text}</div>}
      <div className="row">
        <button disabled={busy} onClick={doSync}>
          {busy ? "Memuat…" : "Muat data siswa"}
        </button>
        <input className="search" placeholder="Cari nama siswa…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">
          {loading ? "memuat…" : `${rows.length} dari ${total} siswa · ${columns.length} kolom`}
        </span>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nama</th>
              {columns.map((c) => (
                <th key={c}>{titleCol(c)}</th>
              ))}
              <th>Disinkronkan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="mono small">{s.id}</td>
                <td>{s.name}</td>
                {columns.map((c) => (
                  <td key={c} className="small">
                    {fmtVal(s.data[c])}
                  </td>
                ))}
                <td className="muted small now">{fmtTs(s.synced_at + "Z")}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 3} className="empty">
                  Belum ada data. Klik "Muat data dari CMS".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}