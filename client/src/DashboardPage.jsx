import { useState } from "react";
import { fmtNum, needsAttention, relDate } from "./fmt.js";
import RecapTable from "./RecapTable.jsx";
import Progress from "./Progress.jsx";
import { IconRefresh, IconAlert, IconCheck } from "./icons.jsx";

function Stats({ rows, students, sessionValid, attActive, onToggleAtt }) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.student_name)) groups.set(r.student_name, []);
    groups.get(r.student_name).push(r);
  }
  const progs = rows.filter((r) => r.total_progress > 0);
  const avg = progs.length ? Math.round(progs.reduce((a, r) => a + (r.latest_progress / r.total_progress) * 100, 0) / progs.length) : null;
  const att = [...groups.values()].filter((rs) => rs.some(needsAttention));
  const cards = [
    { label: "Siswa", value: sessionValid ? fmtNum(students) : "—", hint: "terdaftar di CMS" },
    { label: "Course diikuti", value: fmtNum(rows.length), hint: "course yang punya data" },
    {
      label: "Rata-rata progress",
      value: avg !== null && rows.length ? `${avg}%` : "—",
      hint: "dari course yang sudah berjalan",
    },
  ];
  return (
    <div className="card statrow">
      {cards.map((c) => (
        <div key={c.label} className="stat">
          <div className="stat-num">{c.value}</div>
          <div className="stat-label">{c.label}</div>
          <div className="muted small">{c.hint}</div>
        </div>
      ))}
      <button
        type="button"
        className={`stat stat-btn ${attActive ? "on" : ""}`}
        onClick={onToggleAtt}
        aria-pressed={attActive}
        title="Klik untuk hanya menampilkan siswa yang perlu perhatian"
      >
        <div className="stat-num">{fmtNum(att.length)}</div>
        <div className="stat-label">Perlu perhatian</div>
        <div className="muted small">{attActive ? "filter aktif — klik untuk reset" : "tak aktif >30 hari · klik untuk filter"}</div>
      </button>
    </div>
  );
}

export default function DashboardPage({
  sessionValid,
  studentCount,
  busy,
  recapRunning,
  recapRows,
  recapLoading,
  recapState,
  startedAt,
  onSync,
  onRecap,
}) {
  const [onlyAtt, setOnlyAtt] = useState(false);
  const needsSync = sessionValid && studentCount === 0;
  const canRecap = sessionValid && studentCount > 0;
  const lastLine = recapRows.length
    ? `Terakhir dibuat ${startedAt ? relDate(startedAt.slice(0, 10)) : "baru saja"} — ${recapRows.length} baris untuk ${fmtNum(studentCount)} siswa.`
    : null;

  return (
    <>
      <section className="actionbar">
        <div className="actionbar-body">
          <h3>
            {recapRunning
              ? "Membuat recap pelajaran…"
              : recapRows.length
                ? "Data pelajaran siap"
                : needsSync
                  ? "Belum ada data siswa"
                  : "Buat recap pelajaran"}
          </h3>
          {recapRunning ? (
            <>
              <p>Sedang mengumpulkan data dari CMS. Boleh tutup halaman; proses tetap berjalan.</p>
              <Progress
                current={recapState?.current ?? 0}
                total={recapState?.total ?? 0}
                label={`Siswa ${recapState?.current ?? "?"}/${recapState?.total ?? "?"}${
                  recapState?.studentName ? ` — ${recapState.studentName}` : ""
                }`}
              />
            </>
          ) : (
            <p>
              {recapRows.length
                ? `${lastLine} Perbarui jika ada pertemuan baru.`
                : needsSync
                  ? "Ambil daftar siswa dari CMS. Cukup sekali — hasilnya disimpan lokal."
                  : "Kumpulkan progres, mastery, dan coin semua siswa dari CMS (sekitar 1 menit)."}
            </p>
          )}
        </div>
        <div className="actionbar-actions">
          {needsSync && (
            <button className="primary stack-sm-full" disabled={busy} onClick={onSync}>
              {busy ? <span className="spinner sm" /> : <IconRefresh width={16} height={16} />}
              {busy ? "Memuat…" : "Muat data siswa"}
            </button>
          )}
          {canRecap && (
            <button className="primary stack-sm-full" disabled={busy || recapRunning} onClick={onRecap}>
              {recapRunning ? (
                <span className="spinner sm" />
              ) : recapRows.length ? (
                <IconRefresh width={16} height={16} />
              ) : (
                <IconCheck width={16} height={16} />
              )}
              {recapRunning ? "Memproses…" : busy ? "Memproses…" : recapRows.length ? "Perbarui recap" : "Muat recap pelajaran"}
            </button>
          )}
          {!sessionValid && (
            <div className="banner banner-warn">
              <IconAlert width={15} height={15} />
              Buka halaman login untuk melanjutkan.
            </div>
          )}
        </div>
      </section>

      <Stats rows={recapRows} students={studentCount} sessionValid={sessionValid} attActive={onlyAtt} onToggleAtt={() => setOnlyAtt((v) => !v)} />

      <RecapTable rows={recapRows} loading={recapLoading} running={recapRunning} state={recapState} onlyAtt={onlyAtt} onOnlyAttChange={setOnlyAtt} />
    </>
  );
}
