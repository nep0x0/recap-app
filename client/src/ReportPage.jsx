import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { relDate } from "./fmt.js";
import { createConnGuard } from "./conn.js";
import useFocusTrap from "./useFocusTrap.js";
import { IconRefresh, IconReport, IconAlert, IconExternal, IconCheck, IconClose } from "./icons.jsx";

function StatusChip({ status }) {
  if (status === "ok") return <span className="chip ok">terkirim</span>;
  if (status === "skipped") return <span className="chip neutral">sudah ada</span>;
  return <span className="chip fail">gagal</span>;
}

function SkelRows({ cols }) {
  return (
    <tbody>
      {[0, 1, 2, 3, 4].map((i) => (
        <tr key={i}>
          <td colSpan={cols}>
            <div className="skel-line" style={{ width: `${100 - i * 14}%` }} />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

function cmsUrl(studentId, sessionId, bookId) {
  return `https://cms.timedooracademy.com/tms/student/${studentId}/session/${sessionId}/session-history/${bookId}/report`;
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

export default function ReportPage({ notify }) {
  const [due, setDue] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState("all");
  const [scanStatus, setScanStatus] = useState({ running: false });
  const [busy, setBusy] = useState(false);
  const [create, setCreate] = useState(null);
  const [preview, setPreview] = useState(null);
  const [criteria, setCriteria] = useState([]);
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [tab, setTab] = useState("due");
  const guardRef = useRef(null);
  if (!guardRef.current) guardRef.current = createConnGuard(notify);
  const trapRef = useFocusTrap(!!create);

  const loadDue = async () => {
    try {
      const r = await api.reportDue();
      setDue(r.due || []);
    } catch {}
  };

  const loadLogs = async () => {
    try {
      const r = await api.reportLogs();
      setLogs(r.logs || []);
    } catch {}
  };

  const loadDone = async () => {
    try {
      const r = await api.reportDone();
      setDone(r.done || []);
    } catch {}
  };

  const closePanel = () => {
    setCreate(null);
    setPreview(null);
    setCriteria([]);
  };

  const handleMarkDone = async (d) => {
    try {
      await api.reportMarkDone(d.student_id, d.book_id);
      if (create && create.student_id === d.student_id && create.book_id === d.book_id) closePanel();
      await loadDue();
      await loadDone();
      notify("ok", `${d.student_name} — ${d.course_name || "course"} ditandai selesai.`);
    } catch (e) {
      notify("err", `Gagal menandai: ${e.message}`);
    }
  };

  const handleUnmark = async (item) => {
    try {
      await api.reportUnmarkDone(item.student_id, item.book_id);
      await loadDue();
      await loadDone();
      notify("ok", `${item.student_name} — ${item.course_name || "course"} muncul lagi di daftar.`);
    } catch (e) {
      notify("err", `Gagal membatalkan: ${e.message}`);
    }
  };

  useEffect(() => {
    (async () => {
      await loadDue();
      await loadLogs();
      await loadDone();
      try {
        const s = await api.reportScanStatus();
        setScanStatus(s);
      } catch {}
      setInitialLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!create) return;
    const onKey = (e) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [create]);

  useEffect(() => {
    if (!scanStatus.running) return undefined;
    const t = setInterval(async () => {
      try {
        const s = await api.reportScanStatus();
        guardRef.current.ok();
        setScanStatus(s);
        if (!s.running) {
          await loadDue();
          notify(
            s.errors && s.errors.length ? "err" : "ok",
            s.errors && s.errors.length ? `Scan selesai dengan ${s.errors.length} error.` : `Scan selesai — ${s.total || 0} siswa diperiksa.`
          );
        }
      } catch {
        guardRef.current.fail();
      }
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanStatus.running]);

  const handleScan = async () => {
    setBusy(true);
    try {
      const r = await api.reportScan();
      if (!r.started) notify("err", "Scan sudah berjalan.");
      else {
        setScanStatus({ running: true });
        notify("ok", "Scan dimulai — memeriksa blok 8/16/24/32 semua siswa.");
      }
    } catch (e) {
      notify("err", `Scan gagal: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePickBlock = async (d, b) => {
    if (creating) return;
    const w = (d.waiting_blocks || []).find((x) => x.block === b);
    if (w) {
      const s = w.status === "waiting_approval" ? "menunggu persetujuan" : `berstatus ${w.status}`;
      notify("info", `Blok ${b} sudah dibuat — report "${w.report_name || "?"}" ${s}.`);
      return;
    }
    setCreate({ student_id: d.student_id, student_name: d.student_name, session_id: d.session_id, book_id: d.book_id, course_name: d.course_name, block: b });
    setPreview(null);
    setCriteria([]);
    try {
      const r = await api.reportPreview(d.student_id, d.book_id, b);
      setPreview(r);
      if (r.criteria) {
        setCriteria(r.criteria.map((c) => ({ id: c.id, name: c.name, score: "", note: c.note_template || "", include: true })));
      }
    } catch (e) {
      setPreview({ ok: false, error: e.message });
    }
  };

  // R4: alasan tombol kirim disabled — selalu tampil saat ada
  const disableReasons = useMemo(() => {
    if (!create || !preview || !preview.ok) return [];
    const out = [];
    const inc = criteria.filter((c) => c.include);
    if (!inc.length) out.push("Pilih minimal satu kriteria.");
    for (const c of inc) {
      const s = String(c.score).trim();
      if (s === "") out.push(`Isi skor untuk kriteria "${c.name}" (0–100).`);
      else {
        const n = Number(s);
        if (!Number.isInteger(n)) out.push(`Skor "${c.name}" harus bilangan bulat.`);
        else if (n < 0 || n > 100) out.push(`Skor "${c.name}" harus di antara 0–100.`);
      }
    }
    return out;
  }, [create, preview, criteria]);

  const validCriteria = disableReasons.length === 0;

  const journalsOk =
    !!preview &&
    preview.ok &&
    (preview.journalIds.length > 0 || (preview.fillable && (preview.missing_journals || []).length > 0));

  const canSubmit =
    !!create && !!preview && preview.ok && !preview.covered.covered && journalsOk && validCriteria && !creating;

  const handleCreate = async () => {
    setCreating(true);
    try {
      const r = await api.reportCreate({
        student_id: create.student_id,
        book_id: create.book_id,
        block: create.block,
        criteria: criteria.filter((c) => c.include).map((c) => ({ id: c.id, score: Number(c.score), note: c.note })),
      });
      if (r.ok) {
        notify("ok", `Report blok ${create.block} terkirim — cek di CMS.`);
        closePanel();
        await loadLogs();
        await loadDue();
      } else {
        notify("err", r.message || `Gagal (${r.error || "?"})`);
        try {
          const fresh = await api.reportPreview(create.student_id, create.book_id, create.block);
          setPreview(fresh);
        } catch {}
      }
    } catch (e) {
      notify("err", `Buat report gagal: ${e.message}`);
    } finally {
      setCreating(false);
    }
  };

  const sortedDue = useMemo(
    () => [...due].sort((a, b) => b.block - a.block || a.student_name.localeCompare(b.student_name)),
    [due]
  );
  const lastScanAt = scanStatus.finishedAt ? Date.parse(scanStatus.finishedAt) : 0;
  const scanStale = lastScanAt > 0 && Date.now() - lastScanAt > 864e5;

  const logCounts = useMemo(() => {
    const c = { all: logs.length, ok: 0, skipped: 0, failed: 0 };
    for (const l of logs) c[l.status] = (c[l.status] || 0) + 1;
    return c;
  }, [logs]);

  const viewLogs = useMemo(() => (logFilter === "all" ? logs : logs.filter((l) => l.status === logFilter)), [logs, logFilter]);

  const chipActive = (d, b) => !!create && create.student_id === d.student_id && create.book_id === d.book_id && create.block === b;

  const tabs = [
    { key: "due", label: "Perlu report", count: sortedDue.length },
    { key: "logs", label: "Riwayat", count: logs.length },
    { key: "done", label: "Ditandai selesai", count: done.length },
  ];

  return (
    <>
      <section className="card rpage">
        <div className="tabbar" role="tablist" aria-label="Jenis laporan">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={`tab ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
              <span className="chip">{count}</span>
            </button>
          ))}
        </div>

        {tab === "due" && (
          <>
            <div className="row spread wrap">
              <span className="muted small">
                {lastScanAt
                  ? `Blok yang belum tercakup report — dicek ${relDate(new Date(lastScanAt).toISOString())}. Klik blok untuk membuat.`
                  : "Pindai dulu untuk tahu siswa yang sudah melampaui batas blok tapi report-nya belum dibuat."}
              </span>
              <button className="ghost" disabled={busy || scanStatus.running} onClick={handleScan}>
                {scanStatus.running ? <span className="spinner sm" /> : <IconRefresh width={16} height={16} />}
                {scanStatus.running ? `Memindai… ${scanStatus.current ?? "?"}/${scanStatus.total ?? "?"}` : "Pindai ulang"}
              </button>
            </div>
            {scanStale && (
              <div className="banner banner-warn">
                <IconAlert width={15} height={15} />
                Data scan lebih dari 1 hari — pindai ulang agar daftar akurat.
              </div>
            )}
            {initialLoading ? (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Siswa</th>
                      <th>Course</th>
                      <th>Blok</th>
                      <th className="hide-sm">Lesson</th>
                      <th>CMS</th>
                      <th>Selesai</th>
                    </tr>
                  </thead>
                  <SkelRows cols={6} />
                </table>
              </div>
            ) : sortedDue.length === 0 ? (
              <div className="empty">
                <IconReport width={34} height={34} className="empty-ico" />
                <b>Tidak ada siswa yang perlu report.</b>
                <br />
                Semua blok yang sudah tercapai sudah tercakup report — atau belum ada data scan.
              </div>
            ) : (
              <>
                <div className="tbl-desktop">
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Siswa</th>
                          <th>Course</th>
                          <th>Blok</th>
                          <th className="hide-sm">Lesson</th>
                          <th>CMS</th>
                          <th>Selesai</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedDue.map((d) => (
                          <tr key={`${d.student_id}-${d.book_id}`}>
                            <td className="now">{d.student_name}</td>
                            <td className="ellip" title={d.course_name}>
                              {d.course_name || "—"}
                            </td>
                            <td className="now">
                              {d.due_blocks.map((b) => (
                                <button key={b} className={`chip ${chipActive(d, b) ? "active" : ""}`} disabled={creating} onClick={() => handlePickBlock(d, b)}>
                                  blok {b}
                                </button>
                              ))}
                              {(d.waiting_blocks || []).map((w) => (
                                <button
                                  key={`w-${w.block}`}
                                  className="chip wait"
                                  title={`Report "${w.report_name || "?"}" ${w.status === "waiting_approval" ? "menunggu persetujuan" : `berstatus ${w.status}`}`}
                                  disabled={creating}
                                  onClick={() => handlePickBlock(d, w.block)}
                                >
                                  <span className="dot" />
                                  blok {w.block}
                                </button>
                              ))}
                            </td>
                            <td className="mono hide-sm">{d.max_lesson || "—"}</td>
                            <td className="now">
                              <a className="rowlink" href={cmsUrl(d.student_id, d.session_id, d.book_id)} target="_blank" rel="noreferrer">
                                <IconExternal width={13} height={13} />
                                CMS
                              </a>
                            </td>
                            <td className="now">
                              <button className="ghost sm" disabled={creating} onClick={() => handleMarkDone(d)}>
                                <IconCheck width={13} height={13} />
                                Selesai
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="tbl-mobile">
                  {sortedDue.map((d) => (
                    <div key={`m-${d.student_id}-${d.book_id}`} className="mcard">
                      <div className="mcard-top">
                        <span className="avatar">{initials(d.student_name)}</span>
                        <b className="ellip">{d.student_name}</b>
                      </div>
                      <div className="muted small ellip">{d.course_name || "—"}</div>
                      <div className="muted small">
                        Lesson terakhir: <b className="mono">{d.max_lesson || "—"}</b>
                      </div>
                      <div className="mcard-blocks">
                        {d.due_blocks.map((b) => (
                          <button key={b} className={`chip ${chipActive(d, b) ? "active" : ""}`} disabled={creating} onClick={() => handlePickBlock(d, b)}>
                            buat blok {b}
                          </button>
                        ))}
                        {(d.waiting_blocks || []).map((w) => (
                          <button
                            key={`w-${w.block}`}
                            className="chip wait"
                            title={`Report "${w.report_name || "?"}" ${w.status === "waiting_approval" ? "menunggu persetujuan" : `berstatus ${w.status}`}`}
                            disabled={creating}
                            onClick={() => handlePickBlock(d, w.block)}
                          >
                            <span className="dot" />
                            blok {w.block}
                          </button>
                        ))}
                      </div>
                      <div className="mcard-actions">
                        <a className="rowlink" href={cmsUrl(d.student_id, d.session_id, d.book_id)} target="_blank" rel="noreferrer">
                          <IconExternal width={13} height={13} />
                          Buka CMS
                        </a>
                        <button className="ghost sm" disabled={creating} onClick={() => handleMarkDone(d)}>
                          <IconCheck width={13} height={13} />
                          Tandai selesai
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === "logs" && (
          <>
            <div className="row spread wrap">
              <span className="muted small">Semua percobaan pembuatan report — klik status untuk menyaring.</span>
            </div>
            <div className="chiprow">
              {([["all", "Semua"], ["ok", `${logCounts.ok} berhasil`], ["skipped", `${logCounts.skipped} skip`], ["failed", `${logCounts.failed} gagal`]]).map(([k, label]) => (
                <button key={k} className={`chip ${logFilter === k ? "active" : ""}`} onClick={() => setLogFilter(k)}>
                  {label}
                </button>
              ))}
            </div>
            {initialLoading ? (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Siswa</th>
                      <th>Course</th>
                      <th>Status</th>
                      <th>Pesan</th>
                      <th className="hide-sm">Waktu</th>
                    </tr>
                  </thead>
                  <SkelRows cols={5} />
                </table>
              </div>
            ) : viewLogs.length === 0 ? (
              <div className="empty">
                <IconReport width={34} height={34} className="empty-ico" />
                {logs.length === 0 ? "Belum ada riwayat pembuatan report." : "Tidak ada baris dengan filter ini."}
              </div>
            ) : (
              <>
                <div className="tbl-desktop">
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Siswa</th>
                          <th>Course</th>
                          <th>Status</th>
                          <th>Pesan</th>
                          <th className="hide-sm">Waktu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewLogs.map((l) => (
                          <tr key={`${l.student_id}-${l.book_id}-${l.created_at}`}>
                            <td className="now">{l.student_name}</td>
                            <td className="ellip" title={l.course_name}>
                              {l.course_name || "—"}
                            </td>
                            <td>
                              <StatusChip status={l.status} />
                            </td>
                            <td className="small">
                              {l.message}
                              {l.status === "ok" && (
                                <a className="rowlink" href={cmsUrl(l.student_id, l.session_id, l.book_id)} target="_blank" rel="noreferrer">
                                  <IconExternal width={12} height={12} />
                                  buka di CMS
                                </a>
                              )}
                            </td>
                            <td className="muted small now hide-sm">{relDate(l.created_at.replace(" ", "T") + "Z")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="tbl-mobile">
                  {viewLogs.map((l) => (
                    <div key={`m-${l.student_id}-${l.book_id}-${l.created_at}`} className="mcard">
                      <div className="mcard-top">
                        <b className="ellip">{l.student_name}</b>
                        <StatusChip status={l.status} />
                      </div>
                      <div className="muted small ellip">{l.course_name || "—"}</div>
                      <div className="small">{l.message}</div>
                      <div className="mcard-foot">
                        <span className="muted small now">{relDate(l.created_at.replace(" ", "T") + "Z")}</span>
                        {l.status === "ok" && (
                          <a className="rowlink" href={cmsUrl(l.student_id, l.session_id, l.book_id)} target="_blank" rel="noreferrer">
                            <IconExternal width={12} height={12} />
                            Buka CMS
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === "done" && (
          <>
            <div className="row spread wrap">
              <span className="muted small">Course yang sudah beres tanpa report — tidak akan muncul saat scan. Batalkan bila salah tandai.</span>
            </div>
            {initialLoading ? (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Siswa</th>
                      <th>Course</th>
                      <th className="hide-sm">Lesson</th>
                      <th className="hide-sm">Waktu</th>
                      <th>Batalkan</th>
                    </tr>
                  </thead>
                  <SkelRows cols={5} />
                </table>
              </div>
            ) : done.length === 0 ? (
              <div className="empty">
                <IconCheck width={34} height={34} className="empty-ico" />
                Belum ada course yang ditandai selesai.
              </div>
            ) : (
              <>
                <div className="tbl-desktop">
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Siswa</th>
                          <th>Course</th>
                          <th className="hide-sm">Lesson</th>
                          <th className="hide-sm">Waktu</th>
                          <th>Batalkan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {done.map((x) => (
                          <tr key={`d-${x.student_id}-${x.book_id}`}>
                            <td className="now">{x.student_name}</td>
                            <td className="ellip" title={x.course_name}>
                              {x.course_name || "—"}
                            </td>
                            <td className="mono hide-sm">{x.max_lesson || "—"}</td>
                            <td className="muted small now hide-sm">{relDate(x.created_at.replace(" ", "T") + "Z")}</td>
                            <td className="now">
                              <button className="ghost sm" onClick={() => handleUnmark(x)}>
                                Batalkan
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="tbl-mobile">
                  {done.map((x) => (
                    <div key={`m-d-${x.student_id}-${x.book_id}`} className="mcard">
                      <div className="mcard-top">
                        <b className="ellip">{x.student_name}</b>
                        <span className="chip ok">selesai</span>
                      </div>
                      <div className="muted small ellip">{x.course_name || "—"}</div>
                      <div className="mcard-foot">
                        <span className="muted small now">{relDate(x.created_at.replace(" ", "T") + "Z")}</span>
                        <button className="ghost sm" onClick={() => handleUnmark(x)}>
                          Batalkan
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>

      {create && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closePanel()}>
          <div className="modal" ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Buat report blok ${create.block}`}>
            <div className="modal-head">
              <div className="crit-head">
                <b>{create.student_name}</b>
                <span className="muted small">
                  · {create.course_name} · Blok {create.block}
                  {preview?.ok ? ` · Lesson ${preview.lessons[0]}–${preview.lessons[1]}` : ""}
                </span>
              </div>
              <button className="ghost sm" onClick={closePanel} aria-label="Tutup">
                <IconClose width={14} height={14} />
              </button>
            </div>

            {!preview ? (
              <div className="muted small">
                <span className="spinner sm" /> Memuat pratinjau…
              </div>
            ) : preview.error ? (
              <div className="banner banner-warn">
                <IconAlert width={15} height={15} />
                {preview.error}
              </div>
            ) : (
              <>
                <div className="muted small">
                  Meeting {preview.journals.map((j) => j.name.replace(/^Meeting\s*/i, "")).join(", ") || "—"}
                  <span className="chip ok">{preview.journals.length} jurnal</span>
                </div>
                {preview.covered.covered && (
                  <div className="banner banner-warn">
                    <IconAlert width={15} height={15} />
                    Lesson {preview.covered.lessons[0]}–{preview.covered.lessons[preview.covered.lessons.length - 1]} sudah tercakup report "
                    {preview.covered.reportName}" — pilih blok lain.
                  </div>
                )}
                {!preview.covered.covered && (preview.missing_journals || []).length > 0 && (
                  <div className="banner banner-info">
                    <IconAlert width={15} height={15} />
                    Jurnal untuk {preview.missing_journals.join(", ")} belum ada — akan diisi otomatis saat report dibuat.
                  </div>
                )}
                {!preview.covered.covered && preview.journalIds.length === 0 && !(preview.fillable && (preview.missing_journals || []).length > 0) && (
                  <div className="banner banner-warn">
                    <IconAlert width={15} height={15} />
                    Belum ada jurnal untuk Lesson {preview.lessons[0]}–{preview.lessons[1]} — buat lewat fitur Jurnal Meeting dulu.
                  </div>
                )}

                {journalsOk && !preview.covered.covered && (
                  <>
                    <div className="modal-body">
                      {criteria.map((c, i) => (
                        <label key={c.id} className={`crit-row ${c.include ? "" : "off"}`}>
                          <input
                            type="checkbox"
                            className="crit-check"
                            checked={c.include}
                            onChange={() => setCriteria((arr) => arr.map((x, j) => (j === i ? { ...x, include: !x.include } : x)))}
                          />
                          <span className="crit-name">{c.name}</span>
                          <span className="crit-inputs">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              placeholder="0–100"
                              disabled={!c.include}
                              value={c.score}
                              aria-label={`Skor ${c.name}`}
                              onChange={(e) => setCriteria((arr) => arr.map((x, j) => (j === i ? { ...x, score: e.target.value } : x)))}
                            />
                            <textarea
                              rows={2}
                              placeholder="Catatan guru (opsional)"
                              disabled={!c.include}
                              value={c.note}
                              aria-label={`Catatan ${c.name}`}
                              onChange={(e) => setCriteria((arr) => arr.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                            />
                          </span>
                        </label>
                      ))}
                    </div>
                    {disableReasons.length > 0 && (
                      <div className="banner banner-err disable-reasons" role="status">
                        <IconAlert width={15} height={15} />
                        <span>
                          {disableReasons.slice(0, 3).join(" ")}
                          {disableReasons.length > 3 ? ` (+${disableReasons.length - 3} lagi)` : ""}
                        </span>
                      </div>
                    )}
                    <div className="modal-foot">
                      <button className="ghost" onClick={closePanel} disabled={creating}>
                        Batalkan
                      </button>
                      <button className="primary" disabled={!canSubmit} onClick={handleCreate}>
                        {creating ? <span className="spinner sm" /> : <IconReport width={16} height={16} />}
                        {creating ? "Mengirim…" : `Buat report blok ${create.block}`}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
