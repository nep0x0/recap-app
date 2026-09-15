import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtNum } from "./fmt.js";
import { createConnGuard } from "./conn.js";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { IconJournal, IconCheck } from "./icons.jsx";

function JournalPanel({ sessionValid, notify }) {
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [studentOptions, setStudentOptions] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [notes, setNotes] = useState({});
  const [drafts, setDrafts] = useState({});
  const [scores, setScores] = useState({});
  const [draftScores, setDraftScores] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [studentFilter, setStudentFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [fillRunning, setFillRunning] = useState(false);
  const [fillState, setFillState] = useState(null);
  const [editKey, setEditKey] = useState("");
  const [confirmBox, setConfirmBox] = useState(null); // { type: "fill" | "rebuild", count }
  const [confirmBusy, setConfirmBusy] = useState(false);
  const pollRef = useRef(null);
  const guardRef = useRef(null);
  if (!guardRef.current) guardRef.current = createConnGuard(notify);

  useEffect(() => {
    if (!sessionValid) return;
    api
      .students("")
      .then((r) => setStudentOptions(r.students || []))
      .catch(() => {});
  }, [sessionValid]);

  const planStudents = useMemo(() => {
    if (!plan) return [];
    const m = new Map();
    for (const e of plan.entries) {
      if (!m.has(e.student_id)) m.set(e.student_id, e.student_name);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [plan]);

  const courses = useMemo(() => {
    if (!plan) return [];
    const m = new Map();
    for (const e of plan.entries) {
      const k = `${e.course_id}`;
      if (!m.has(k)) m.set(k, e.course_name);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [plan]);

  const filtered = useMemo(() => {
    if (!plan) return [];
    return plan.entries.filter(
      (e) =>
        (!studentFilter || String(e.student_id) === studentFilter) &&
        (!courseFilter || String(e.course_id) === courseFilter)
    );
  }, [plan, studentFilter, courseFilter]);

  const selectedCount = useMemo(() => filtered.filter((e) => selected.has(e.key)).length, [filtered, selected]);
  const allChecked = filtered.length > 0 && selectedCount === filtered.length;

  // Catatan atau nilai mana yang sudah diubah dari draf
  const isEdited = useMemo(() => {
    if (!plan) return () => false;
    const edited = new Set(
      plan.entries
        .filter((e) => {
          if ((notes[e.key] ?? "") !== (drafts[e.key] ?? "")) return true;
          const curS = scores[e.key] || {};
          const drfS = draftScores[e.key] || {};
          for (const a of e.activities || []) {
            if (String(curS[a.id] ?? a.score) !== String(drfS[a.id] ?? a.score)) return true;
          }
          return false;
        })
        .map((e) => e.key)
    );
    return (key) => edited.has(key);
  }, [plan, notes, drafts, scores, draftScores]);

  const editedTotal = useMemo(() => {
    if (!plan) return 0;
    return plan.entries.filter((e) => isEdited(e.key)).length;
  }, [plan, isEdited]);

  const toggleAll = (v) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const e of filtered) {
        if (v) next.add(e.key);
        else next.delete(e.key);
      }
      return next;
    });
  };

  const buildPlan = async () => {
    setPlanLoading(true);
    try {
      const r = await api.journalPlan(selectedStudent || undefined);
      if (!r || !r.entries) throw new Error(r?.error || "Respons tidak dikenal");
      setPlan(r);
      setNotes(Object.fromEntries(r.entries.map((e) => [e.key, e.note])));
      setDrafts(Object.fromEntries(r.entries.map((e) => [e.key, e.note])));
      const sMap = {};
      for (const e of r.entries) {
        sMap[e.key] = {};
        for (const a of e.activities || []) {
          sMap[e.key][a.id] = a.score;
        }
      }
      setScores(sMap);
      setDraftScores(sMap);
      setSelected(new Set(r.entries.map((e) => e.key)));
      notify("ok", `Rencana jurnal dibuat — ${r.entry_count} catatan menunggu pengecekan.`);
    } catch (e) {
      notify("err", `Buat rencana gagal: ${e.message}`);
    } finally {
      setPlanLoading(false);
    }
  };

  // R3: Buat Ulang meminta konfirmasi bila ada editan yang akan hilang
  const requestRebuild = () => {
    if (editedTotal > 0 && !planLoading) {
      setConfirmBox({ type: "rebuild", count: editedTotal });
    } else {
      buildPlan();
    }
  };

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPoll, []);

  useEffect(() => {
    if (!fillRunning) return;
    const t = setInterval(async () => {
      try {
        const s = await api.journalStatus();
        guardRef.current.ok();
        setFillState(s);
        if (!s.running) {
          setFillRunning(false);
          stopPoll();
          const ok = s.results.filter((r) => r.ok).length;
          const bad = s.results.filter((r) => r.status === "failed").length;
          notify(
            bad ? "err" : "ok",
            `Pengisian selesai — ${ok} tertulis${bad ? `, ${bad} gagal` : ""}.`
          );
        }
      } catch {
        guardRef.current.fail();
      }
    }, 1400);
    pollRef.current = t;
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillRunning]);

  const statusOf = (key) => {
    if (!fillState) return null;
    // key = `${student_id}-${session_id}-${meeting_id}`: cocokkan student+meeting
    // sekaligus agar tidak salah pasang antar siswa.
    const parts = String(key).split("-");
    const studentId = Number(parts[0]);
    const meetingId = parts[parts.length - 1];
    return (
      fillState.results.find(
        (r) => r.student_id === studentId && String(r.meeting_id) === String(meetingId)
      ) || null
    );
  };

  const editEntry = useMemo(() => (plan ? plan.entries.find((e) => e.key === editKey) || null : null), [plan, editKey]);

  const restoreDraft = (key) => {
    setNotes((prev) => ({ ...prev, [key]: drafts[key] ?? "" }));
    setScores((prev) => ({ ...prev, [key]: { ...(draftScores[key] || {}) } }));
  };

  const handleConfirm = async () => {
    if (!confirmBox || confirmBusy) return;
    if (confirmBox.type === "rebuild") {
      setConfirmBox(null);
      await buildPlan();
      return;
    }
    // type "fill"
    const list = filtered.filter((e) => selected.has(e.key));
    setConfirmBusy(true);
    try {
      const body = list.map((e) => ({
        ...e,
        note: notes[e.key] ?? e.note,
        activities: (e.activities || []).map((a) => {
          // Input kosong/non-angka → kembali ke skor draf; selalu jepit 0–100
          // (nilai ini ditulis ke CMS asli sebagai skor aktivitas siswa).
          const raw = scores[e.key]?.[a.id];
          const fallback = a.score ?? 85;
          let score = raw === "" || raw == null ? fallback : Number(raw);
          if (!Number.isFinite(score)) score = fallback;
          return { ...a, score: Math.max(0, Math.min(100, Math.round(score))) };
        }),
      }));
      const r = await api.journalFill(body);
      setConfirmBox(null);
      if (!r || !r.started) {
        notify("err", r?.reason === "ALREADY_RUNNING" ? "Pengisian lain masih berjalan." : "Tidak bisa memulai pengisian.");
        return;
      }
      setFillRunning(true);
      setFillState({ running: true, current: 0, total: list.length, results: [], failed: [] });
      notify("info", `Mulai mengisi ${fmtNum(list.length)} catatan…`);
    } catch (e) {
      setConfirmBox(null);
      notify("err", `Gagal memulai pengisian: ${e.message}`);
    } finally {
      setConfirmBusy(false);
    }
  };

  const startFill = () => {
    const list = filtered.filter((e) => selected.has(e.key));
    if (!list.length || fillRunning) return;
    setConfirmBox({ type: "fill", count: list.length });
  };

  const confirmCopy =
    confirmBox?.type === "rebuild"
      ? {
          title: "Buat ulang rencana?",
          description: `${fmtNum(confirmBox.count)} catatan yang kamu edit akan diganti draf baru dari CMS. Perubahanmu tidak bisa dikembalikan.`,
          confirmLabel: "Buang editan & buat ulang",
          danger: true,
        }
      : {
          title: "Isi catatan ke CMS?",
          description: `${fmtNum(confirmBox?.count ?? 0)} jurnal akan ditulis langsung ke CMS atas nama akunmu dan sulit dibatalkan. Pastikan isi tiap baris sudah kamu periksa.`,
          confirmLabel: "Ya, isi ke CMS",
          danger: false,
        };

  return (
    <section className="card jpanel" aria-label="Jurnal meeting">
      <div className="spread row">
        <div>
          <h2 className="sect-title">
            <IconJournal width={18} height={18} />
            Jurnal Meeting
          </h2>
          <span className="muted small">Otomatiskan catatan "mempelajari lesson … dengan baik" untuk tiap meeting di CMS.</span>
        </div>
        {!plan || planLoading ? (
          <div className="row">
            <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} aria-label="Pilih siswa untuk rencana" disabled={planLoading}>
              <option value="">Semua siswa</option>
              {studentOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="primary" disabled={!sessionValid || planLoading} onClick={buildPlan}>
              {planLoading ? (
                <>
                  <span className="spinner sm" /> Membuat rencana…
                </>
              ) : (
                "Buat rencana"
              )}
            </button>
          </div>
        ) : (
          <button className="ghost" onClick={requestRebuild} disabled={planLoading}>
            {planLoading ? (
              <>
                <span className="spinner sm" /> Membuat rencana…
              </>
            ) : (
              "Buat ulang"
            )}
          </button>
        )}
      </div>

      {plan && (
        <>
          <div className="row">
            <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)} aria-label="Filter siswa">
              <option value="">Semua siswa ({fmtNum(planStudents.length)})</option>
              {planStudents.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} aria-label="Filter course">
              <option value="">Semua course ({fmtNum(courses.length)})</option>
              {courses.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
              Pilih semua ({fmtNum(selectedCount)}/{fmtNum(filtered.length)})
            </label>
            {selectedCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "6px", flexWrap: "wrap" }}>
                <span className="muted small" style={{ fontSize: "11px", fontWeight: 600 }}>Set Skor Terpilih:</span>
                {[80, 85, 90, 95, 100].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className="ghost sm"
                    style={{ padding: "1px 6px", fontSize: "11px", height: "auto" }}
                    title={`Set semua lesson pada ${selectedCount} catatan terpilih ke ${val}`}
                    onClick={() => {
                      setScores((prev) => {
                        const next = { ...prev };
                        for (const e of filtered) {
                          if (selected.has(e.key)) {
                            next[e.key] = { ...(next[e.key] || {}) };
                            for (const a of e.activities || []) {
                              next[e.key][a.id] = val;
                            }
                          }
                        }
                        return next;
                      });
                      notify("ok", `Skor ${selectedCount} catatan diset ke ${val}.`);
                    }}
                  >
                    {val}
                  </button>
                ))}
              </div>
            )}
            <span className="muted small grow-right">
              {plan.entry_count} catatan tersedia · {plan.skipped_count} meeting dilewati ·{" "}
              {editedTotal > 0 ? (
                <b className="edited-count">{editedTotal} diedit</b>
              ) : (
                "belum ada yang diedit"
              )}
            </span>
          </div>

          <div className="jsplit">
            <div className="jlist">
              {filtered.map((e) => {
                const st = statusOf(e.key);
                const edited = isEdited(e.key);
                return (
                  <div
                    key={e.key}
                    className={`jitem ${editKey === e.key ? "active" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setEditKey(e.key)}
                    onKeyDown={(ev) => {
                      if (ev.target.tagName === "INPUT") return;
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        setEditKey(e.key);
                      }
                    }}
                    aria-label={`Edit catatan ${e.meeting_name} ${e.student_name}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(e.key)}
                      onClick={(ev) => ev.stopPropagation()}
                      onChange={(ev) => {
                        setSelected((prev) => {
                          const n = new Set(prev);
                          if (ev.target.checked) n.add(e.key);
                          else n.delete(e.key);
                          return n;
                        });
                      }}
                      onKeyDown={(ev) => ev.stopPropagation()}
                      aria-label={`Pilih ${e.meeting_name}`}
                    />
                    <div className="jitem-main">
                      <div>
                        <b>{e.student_name}</b>
                        <span className="muted small"> · {e.course_name}</span>
                      </div>
                      <div className="muted small">
                        {e.date} · {e.meeting_name}
                      </div>
                      <div className="small jitem-lessons">
                        {e.lessons.map((l) => (
                          <span key={l}>• {l}</span>
                        ))}
                      </div>
                    </div>
                    <div className="jitem-right">
                      {e.activities.map((a) => (
                        <span key={a.id} className="mono small chip" title={`${a.name || 'Lesson'}: ${scores[e.key]?.[a.id] ?? a.score}`}>
                          {scores[e.key]?.[a.id] ?? a.score}
                        </span>
                      ))}
                      {edited && <span className="chip info edit-dot-chip">diedit</span>}
                      {st && (
                        <span className={`chip ${st.ok ? "ok" : st.status === "failed" ? "fail" : "neutral"}`}>
                          {st.status === "ok" ? "tertulis" : st.status === "skipped" ? "dilewati" : "gagal"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {!filtered.length && (
                <div className="empty">
                  Tidak ada catatan dengan filter ini. <b>Buat ulang</b> untuk mengambil data terbaru dari CMS.
                </div>
              )}
            </div>

            <div className="jedit">
              {editEntry ? (
                <>
                  <div className="jedit-head">
                    <b>{editEntry.student_name}</b>
                    <span className="muted small">
                      · {editEntry.course_name} · {editEntry.meeting_name} · {editEntry.date}
                    </span>
                  </div>
                  <textarea
                    className="jnote"
                    rows={4}
                    value={notes[editEntry.key] ?? editEntry.note}
                    onChange={(ev) => setNotes((prev) => ({ ...prev, [editEntry.key]: ev.target.value }))}
                    aria-label={`Catatan ${editEntry.meeting_name}`}
                  />
                  <div className="jedit-meta">
                    <span className="muted small mono">{(notes[editEntry.key] ?? "").length} karakter</span>
                    {isEdited(editEntry.key) && (
                      <button className="quiet sm" onClick={() => restoreDraft(editEntry.key)}>
                        Kembalikan ke draf
                      </button>
                    )}
                  </div>

                  <div className="jedit-scores" style={{ marginTop: "12px", borderTop: "1px solid var(--line)", paddingTop: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
                      <b className="small">Nilai Lesson ({editEntry.activities?.length || 0}):</b>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span className="muted small" style={{ fontSize: "11px" }}>Set Semua:</span>
                        {[80, 85, 90, 95, 100].map((val) => (
                          <button
                            key={val}
                            type="button"
                            className="ghost sm"
                            style={{ padding: "1px 6px", fontSize: "11px", height: "auto" }}
                            title={`Set semua lesson pada meeting ini ke ${val}`}
                            onClick={() => {
                              setScores((prev) => {
                                const updated = { ...(prev[editEntry.key] || {}) };
                                for (const a of editEntry.activities || []) {
                                  updated[a.id] = val;
                                }
                                return { ...prev, [editEntry.key]: updated };
                              });
                            }}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {(editEntry.activities || []).map((a) => {
                        const curVal = scores[editEntry.key]?.[a.id] ?? a.score;
                        return (
                          <div
                            key={a.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              background: "rgba(125, 125, 125, 0.05)",
                              padding: "6px 10px",
                              borderRadius: "6px",
                              border: "1px solid var(--line)",
                            }}
                          >
                            <span className="small" style={{ fontWeight: 500, flex: 1, marginRight: "8px" }}>
                              {a.name || `Lesson ${a.id}`}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={curVal}
                                style={{ width: "60px", padding: "3px 6px", textAlign: "center", fontWeight: 600 }}
                                onChange={(ev) => {
                                  const val = ev.target.value;
                                  setScores((prev) => ({
                                    ...prev,
                                    [editEntry.key]: {
                                      ...(prev[editEntry.key] || {}),
                                      [a.id]: val === "" ? "" : Number(val),
                                    },
                                  }));
                                }}
                                aria-label={`Skor untuk ${a.name || 'Lesson'}`}
                              />
                              <span className="muted small">/ 100</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {(() => {
                    const st = statusOf(editEntry.key);
                    return st ? (
                      <div className={`banner ${st.ok ? "banner-ok" : st.status === "failed" ? "banner-err" : "banner-info"}`}>
                        {st.status === "ok" ? "✓ tertulis di CMS" : st.status === "skipped" ? "dilewati — sudah ada di CMS" : `gagal: ${st.message}`}
                      </div>
                    ) : null;
                  })()}
                  <div className="jedit-foot">
                    <span className="muted small">
                      <IconCheck width={12} height={12} />
                      tersimpan otomatis · belum dikirim ke CMS
                    </span>
                  </div>
                </>
              ) : (
                <div className="empty">Pilih baris di kiri untuk mengedit catatan.</div>
              )}
            </div>
          </div>

          <div className="row spread">
            <div className="pulsetext">
              {fillRunning && (
                <>
                  <span className="spinner sm" /> Mengisi {fillState?.current ?? 0}/{fillState?.total ?? "?"}…
                </>
              )}
              {!fillRunning && fillState && (fillState.results?.length ?? 0) > 0 && (
                <span className="muted small">
                  Hasil terakhir: {fillState.results.filter((r) => r.ok).length} ok / {fillState.results.filter((r) => r.status === "skipped").length} dilewati / {fillState.results.filter((r) => r.status === "failed").length} gagal
                </span>
              )}
            </div>
            <button className="primary" disabled={!selectedCount || fillRunning} onClick={startFill}>
              {fillRunning ? "Mengisi…" : `Isi ${fmtNum(selectedCount)} catatan ke CMS`}
            </button>
          </div>
        </>
      )}

      {!plan && !planLoading && (
        <div className="empty">
          <IconJournal width={34} height={34} className="empty-ico" />
          <b>Belum ada rencana jurnal.</b>
          <br />
          Tombol <b>Buat rencana</b> membaca meeting &amp; lesson semua siswa dari CMS, lalu menyusun draf catatan sesuai aturan:
          meeting berisi lesson 8/16/24/32 dilewati (sudah ada report), lesson pindah ke meeting berikutnya, dan jurnal yang sudah
          terisi tidak pernah ditimpa.
        </div>
      )}

      <ConfirmDialog
        open={!!confirmBox}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        cancelLabel="Batal"
        danger={confirmCopy.danger}
        busy={confirmBusy}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmBox(null)}
      />
    </section>
  );
}

export default JournalPanel;
