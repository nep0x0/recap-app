import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { createConnGuard } from "./conn.js";
import useFocusTrap from "./useFocusTrap.js";
import ReportDueTable from "./components/report/ReportDueTable.jsx";
import ReportLogsTable from "./components/report/ReportLogsTable.jsx";
import ReportDoneTable from "./components/report/ReportDoneTable.jsx";
import ReportModal from "./components/report/ReportModal.jsx";

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
            s.errors && s.errors.length
              ? `Scan selesai dengan ${s.errors.length} error.`
              : `Scan selesai — ${s.total || 0} siswa diperiksa.`
          );
        }
      } catch {
        guardRef.current.fail();
      }
    }, 2000);
    return () => clearInterval(t);
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
    setCreate({
      student_id: d.student_id,
      student_name: d.student_name,
      session_id: d.session_id,
      book_id: d.book_id,
      course_name: d.course_name,
      block: b,
    });
    setPreview(null);
    setCriteria([]);
    try {
      const r = await api.reportPreview(d.student_id, d.book_id, b);
      setPreview(r);
      if (r.criteria) {
        setCriteria(
          r.criteria.map((c) => ({
            id: c.id,
            name: c.name,
            score: "",
            note: c.note_template || "",
            include: true,
          }))
        );
      }
    } catch (e) {
      setPreview({ ok: false, error: e.message });
    }
  };

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
    (preview.journalIds?.length > 0 || (preview.fillable && (preview.missing_journals || []).length > 0));

  const canSubmit =
    !!create && !!preview && preview.ok && !preview.covered?.covered && journalsOk && validCriteria && !creating;

  const handleCreate = async () => {
    setCreating(true);
    try {
      const r = await api.reportCreate({
        student_id: create.student_id,
        book_id: create.book_id,
        block: create.block,
        criteria: criteria
          .filter((c) => c.include)
          .map((c) => ({ id: c.id, score: Number(c.score), note: c.note })),
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

  const viewLogs = useMemo(
    () => (logFilter === "all" ? logs : logs.filter((l) => l.status === logFilter)),
    [logs, logFilter]
  );

  const chipActive = (d, b) =>
    !!create && create.student_id === d.student_id && create.book_id === d.book_id && create.block === b;

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
          <ReportDueTable
            due={sortedDue}
            lastScanAt={lastScanAt}
            scanStale={scanStale}
            scanStatus={scanStatus}
            initialLoading={initialLoading}
            busy={busy}
            creating={creating}
            onScan={handleScan}
            onPickBlock={handlePickBlock}
            onMarkDone={handleMarkDone}
            isChipActive={chipActive}
          />
        )}

        {tab === "logs" && (
          <ReportLogsTable
            logs={logs}
            viewLogs={viewLogs}
            logFilter={logFilter}
            logCounts={logCounts}
            initialLoading={initialLoading}
            onFilterChange={setLogFilter}
          />
        )}

        {tab === "done" && (
          <ReportDoneTable done={done} initialLoading={initialLoading} onUnmark={handleUnmark} />
        )}
      </section>

      <ReportModal
        create={create}
        preview={preview}
        criteria={criteria}
        setCriteria={setCriteria}
        disableReasons={disableReasons}
        canSubmit={canSubmit}
        creating={creating}
        onClose={closePanel}
        onSubmit={handleCreate}
        trapRef={trapRef}
      />
    </>
  );
}
