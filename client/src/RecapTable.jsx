import { useEffect, useMemo, useRef, useState } from "react";
import { fmtNum, needsAttention, pct, relDate } from "./fmt.js";
import { IconChevronUp, IconChevronDown, IconSearch, IconClose, IconReport } from "./icons.jsx";

function MiniBar({ a, b }) {
  const p = pct(a, b);
  return (
    <div className="minibar">
      <div className="minibar-track">
        <div className="minibar-fill" style={{ width: `${p ?? 0}%` }} />
      </div>
      <span className="muted small">
        {p !== null ? `${a}/${b} · ${p}%` : a != null && b != null ? `${a}/${b}` : "—"}
      </span>
    </div>
  );
}

function attemptDate(a) {
  if (!a || typeof a !== "object") return null;
  for (const k of ["created_at", "createdAt", "attempted_at", "date", "updated_at"]) {
    const v = a[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

function QuizRows({ quizzes }) {
  return (
    <table className="inner">
      <thead>
        <tr>
          <th>Waktu</th>
          <th>Skor</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {quizzes.map((q, i) => {
          const d = attemptDate(q.attempt);
          return (
            <tr key={i}>
              <td>{d ? relDate(d.length === 10 ? d : d.slice(0, 10)) || d : "—"}</td>
              <td className="mono">{q.score || "—"}</td>
              <td>{String(q.attempt?.status ?? q.attempt?.state ?? "—")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CourseRow({ r, open, onToggle }) {
  const att = needsAttention(r);
  const toggleKeys = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };
  return (
    <>
      <tr
        className={`course click ${open ? "openrow" : ""}`}
        onClick={onToggle}
        onKeyDown={toggleKeys}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        title="Lihat detail meeting"
      >
        <td className="td-course">
          <span className="chip course">{r.course_name}</span>
          {r.quiz_count > 0 && (
            <span className="chip quiz" title={`${r.quiz_count} quiz dikerjakan`}>
              Quiz ×{r.quiz_count}
            </span>
          )}
        </td>
        <td>{r.total_progress > 0 ? <MiniBar a={r.latest_progress} b={r.total_progress} /> : <span className="muted small">—</span>}</td>
        <td className="hide-sm">
          {r.mastery_gained != null ? <MiniBar a={r.mastery_gained} b={r.mastery_max} /> : <span className="muted small">—</span>}
        </td>
        <td className="mono hide-sm">{r.coin_gained != null ? fmtNum(r.coin_gained) : "—"}</td>
        <td className="ellip" title={r.last_lesson || ""}>
          {r.last_lesson || <span className="muted">belum mulai</span>}
        </td>
        <td>
          {r.last_lesson_date ? (
            <>
              <span className={att ? "chip warn" : ""}>{relDate(r.last_lesson_date)}</span>
              <div className="muted small">{r.last_meeting || ""}</div>
            </>
          ) : (
            <span className="chip warn">tak aktif</span>
          )}
        </td>
        <td className="muted now">
          {open ? <IconChevronUp width={14} height={14} /> : <IconChevronDown width={14} height={14} />}
        </td>
      </tr>
      {open && (
        <tr className="detailrow">
          <td colSpan={7}>
            <div className="detailbox">
              {r.quizzes?.length > 0 && (
                <details>
                  <summary>Riwayat quiz ({r.quizzes.length})</summary>
                  <QuizRows quizzes={r.quizzes} />
                  <details className="raw-nested">
                    <summary>Lihat data mentah</summary>
                    <pre>{r.quizzes.map((q) => JSON.stringify(q.attempt, null, 1)).join("\n\n")}</pre>
                  </details>
                </details>
              )}
              {r.meetings?.length > 0 && (
                <details open>
                  <summary>Daftar meeting ({r.meetings.length})</summary>
                  <table className="inner">
                    <thead>
                      <tr>
                        <th>Meeting</th>
                        <th>Tanggal</th>
                        <th>Waktu</th>
                        <th>Lesson dibuka</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.meetings.map((m, i) => (
                        <tr key={i}>
                          <td>{m.name}</td>
                          <td>{m.date}</td>
                          <td className="now">
                            {m.start_time}–{m.end_time}
                          </td>
                          <td>{m.lessons.join(", ") || "0 lesson"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function initials(name) {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
}

function Skeleton() {
  return (
    <tbody>
      {[0, 1, 2, 3, 4].map((i) => (
        <tr key={i}>
          <td colSpan={7}>
            <div className="skel-line" style={{ width: `${100 - i * 12}%` }} />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

export default function RecapTable({ rows, loading, running, state, onlyAtt, onOnlyAttChange }) {
  const [q, setQ] = useState("");
  const [course, setCourse] = useState("");
  const [sort, setSort] = useState("date");
  const [openGroups, setOpenGroups] = useState(new Set());
  const [openCourses, setOpenCourses] = useState(new Set());
  const didInit = useRef(false);

  const courses = useMemo(() => [...new Set(rows.map((r) => r.course_name))].sort((a, b) => a.localeCompare(b)), [rows]);

  const groups = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (course && r.course_name !== course) return false;
      const hay = `${r.student_name} ${r.course_name} ${r.last_lesson || ""}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (onlyAtt && !needsAttention(r)) return false;
      return true;
    });
    const map = new Map();
    for (const r of filtered) {
      if (!map.has(r.student_name)) map.set(r.student_name, []);
      map.get(r.student_name).push(r);
    }
    const arr = [...map.entries()].map(([name, rs]) => ({
      name,
      rows: rs,
      last: Math.max(...rs.map((r) => (r.last_lesson_date ? Date.parse(r.last_lesson_date.slice(0, 10) + "T00:00:00") : 0))),
      att: rs.some(needsAttention),
    }));
    const byDate = (a, b) => (b.att !== a.att ? (b.att ? 1 : -1) : b.last - a.last);
    if (sort === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "att") arr.sort((a, b) => (a.att !== b.att ? (a.att ? -1 : 1) : b.last - a.last));
    else arr.sort(byDate);
    return arr;
  }, [rows, q, course, onlyAtt, sort]);

  // R18: saat data pertama masuk — grup "perlu perhatian" terbuka dulu (maks 5)
  useEffect(() => {
    if (didInit.current || groups.length === 0) return;
    didInit.current = true;
    const ordered = [...groups].sort((a, b) => (b.att !== a.att ? (b.att ? 1 : -1) : b.last - a.last));
    setOpenGroups(new Set(ordered.slice(0, 5).map((g) => g.name)));
  }, [groups]);

  const toggleCourse = (k) => {
    const n = new Set(openCourses);
    n.has(k) ? n.delete(k) : n.add(k);
    setOpenCourses(n);
  };

  const groupKey = (name) => {
    const n = new Set(openGroups);
    if (n.has(name)) n.delete(name);
    else n.add(name);
    setOpenGroups(n);
  };

  const grpKeys = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      groupKey(e.currentTarget.getAttribute("data-name"));
    }
  };

  const exportCsv = () => {
    if (!rows.length) return;
    const headers = ["Nama Siswa", "Course", "Progress", "Total", "Persen", "Kuis", "Koin", "Pertemuan Terakhir"];
    const lines = [headers.join(",")];
    for (const r of rows) {
      const p = r.total_progress > 0 ? Math.round((r.latest_progress / r.total_progress) * 100) : 0;
      const row = [
        `"${(r.student_name || "").replace(/"/g, '""')}"`,
        `"${(r.course_name || "").replace(/"/g, '""')}"`,
        r.latest_progress ?? 0,
        r.total_progress ?? 0,
        `"${p}%"`,
        r.quiz_count ?? 0,
        r.coins ?? 0,
        `"${r.last_lesson_date ? r.last_lesson_date.slice(0, 10) : "-"}"`,
      ];
      lines.push(row.join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recap-siswa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card">
      <div className="row spread wrap">
        <h3 className="sect-title">Recap pelajaran</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {running && (
            <span className="pulsetext">
              <span className="spinner sm" /> membuat recap… {state?.current ?? "?"}/{state?.total ?? "?"}
              {state?.total > 0 ? ` (${Math.round(((state.current || 0) / state.total) * 100)}%)` : ""}
            </span>
          )}
          <button
            type="button"
            className="ghost sm"
            style={{ gap: "5px", padding: "4px 10px" }}
            onClick={exportCsv}
            disabled={!rows.length || running}
            title="Unduh data rekap ke file CSV (Excel)"
          >
            <IconReport width={14} height={14} />
            Ekspor CSV
          </button>
        </div>
      </div>
      <div className="row toolbar">
        <div className="searchwrap grow-search">
          <IconSearch width={15} height={15} className="search-ico" />
          <input
            className="search"
            placeholder="Cari siswa, course, pelajaran…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Cari siswa, course, atau pelajaran"
          />
          {q && (
            <button type="button" className="search-clear quiet" onClick={() => setQ("")} aria-label="Bersihkan pencarian">
              <IconClose width={12} height={12} />
            </button>
          )}
        </div>
        <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Filter course">
          <option value="">Semua course</option>
          {courses.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Urutkan">
          <option value="date">Pertemuan terbaru</option>
          <option value="att">Perlu perhatian dulu</option>
          <option value="name">Nama A–Z</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={!!onlyAtt} onChange={(e) => onOnlyAttChange(e.target.checked)} />
          Hanya perlu perhatian
        </label>
        <span className="grp-toggle">
          <button
            type="button"
            className="quiet sm"
            onClick={() => setOpenGroups(new Set(groups.map((g) => g.name)))}
            disabled={!groups.length}
          >
            Buka semua
          </button>
          <button type="button" className="quiet sm" onClick={() => setOpenGroups(new Set())} disabled={!groups.length}>
            Tutup semua
          </button>
        </span>
        <span className="muted small grow-right">
          {loading ? "memuat…" : `${groups.length} siswa · ${groups.reduce((a, g) => a + g.rows.length, 0)} baris`}
        </span>
      </div>

      {/* desktop */}
      <div className="tbl-desktop">
        <div className="tablewrap">
          <table className="recap">
            <thead>
              <tr>
                <th>Course</th>
                <th>Progress</th>
                <th className="hide-sm">Mastery</th>
                <th className="hide-sm">Coin</th>
                <th>Pelajaran terakhir</th>
                <th>Pertemuan</th>
                <th></th>
              </tr>
            </thead>
            {loading && rows.length === 0 ? (
              <Skeleton />
            ) : groups.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={7} className="empty">
                    {rows.length === 0 ? (
                      <>
                        <b>Belum ada data recap.</b> Klik tombol <b>Muat recap pelajaran</b> di atas untuk membuatnya (pastikan sudah login).
                      </>
                    ) : (
                      "Tidak ada yang cocok dengan filter ini."
                    )}
                  </td>
                </tr>
              </tbody>
            ) : (
              groups.map((g) => (
                <tbody key={g.name}>
                  <tr
                    className="grp"
                    data-name={g.name}
                    onClick={() => groupKey(g.name)}
                    onKeyDown={grpKeys}
                    role="button"
                    tabIndex={0}
                    aria-expanded={openGroups.has(g.name)}
                  >
                    <td colSpan={7}>
                      <span className="avatar">{initials(g.name)}</span>
                      <span className="grp-name">{g.name}</span>
                      <span className="muted small">· {g.rows.length} course</span>
                      {g.att && <span className="chip warn">perlu perhatian</span>}
                      <span className="chev">{openGroups.has(g.name) ? <IconChevronUp width={13} height={13} /> : <IconChevronDown width={13} height={13} />}</span>
                    </td>
                  </tr>
                  {openGroups.has(g.name) &&
                    g.rows.map((r) => {
                      const k = `${g.name}::${r.course_name}`;
                      return <CourseRow key={k} r={r} open={openCourses.has(k)} onToggle={() => toggleCourse(k)} />;
                    })}
                </tbody>
              ))
            )}
          </table>
        </div>
      </div>

      {/* mobile */}
      <div className="tbl-mobile">
        {loading && rows.length === 0 ? (
          <div className="skel-line" style={{ width: "80%" }} />
        ) : groups.length === 0 ? (
          <div className="empty">
            {rows.length === 0 ? (
              <>
                <b>Belum ada data recap.</b> Ketuk <b>Muat recap pelajaran</b> di atas.
              </>
            ) : (
              "Tidak ada yang cocok dengan filter ini."
            )}
          </div>
        ) : (
          groups.map((g) => (
            <div key={`m-${g.name}`} className="mcard">
              <div className="mcard-top">
                <span className="avatar">{initials(g.name)}</span>
                <b className="ellip">{g.name}</b>
                {g.att && <span className="chip warn">perlu perhatian</span>}
              </div>
              {g.rows.map((r) => (
                <div key={`mr-${g.name}-${r.course_id ?? r.course_name}`} className="mcourse">
                  <div className="mcourse-head">
                    <span className="chip course">{r.course_name}</span>
                    <span className={`small ${needsAttention(r) ? "warn-text" : "muted"}`}>
                      {r.last_lesson_date ? relDate(r.last_lesson_date) : "belum mulai"}
                    </span>
                  </div>
                  {r.total_progress > 0 && <MiniBar a={r.latest_progress} b={r.total_progress} />}
                  <div className="muted small ellip" title={r.last_lesson || ""}>
                    {r.last_lesson || "belum ada lesson"}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
