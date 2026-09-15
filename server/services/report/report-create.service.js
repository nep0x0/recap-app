const { getDb } = require("../../db");
const { fetchJson } = require("../../lib/cms-client");
const { extractList } = require("../../lib/utils");
const {
  BLOCK_VALUES,
  fetchReportsWithJournals,
  fetchCourseCriteria,
} = require("./report-helpers");
const { isDone } = require("./report-due.service");
const { resolveBlockJournals } = require("./report-journal-resolver");

async function createBlockReport(api, studentId, bookId, block, criteriaInput) {
  if (!BLOCK_VALUES.includes(block)) return { ok: false, status: "failed", message: "Blok harus 8, 16, 24, atau 32" };
  const valid = await api.validateSession();
  if (!valid) return { ok: false, status: "failed", message: "Sesi CMS berakhir — masuk ulang" };
  const headers = await api.getApiHeaders();
  if (!headers) return { ok: false, status: "failed", message: "Token tidak ditemukan" };

  const db = getDb();
  const row = db
    .prepare(
      `SELECT rs.student_id, rs.session_id, rs.book_id, rs.course_id, rs.course_name, s.name AS student_name
       FROM report_scan rs JOIN students s ON s.id = rs.student_id
       WHERE rs.student_id = ? AND rs.book_id = ?`
    )
    .get(studentId, bookId);
  if (!row) return { ok: false, status: "failed", message: "Book tidak ditemukan di hasil scan — pindai ulang dulu" };
  if (isDone(studentId, bookId)) {
    return { ok: false, status: "failed", message: "Course ini sudah ditandai selesai — batalkan di bagian 'Ditandai selesai' dulu" };
  }

  const sid = row.student_id;
  const lsid = row.session_id;
  const bid = row.book_id;
  const courseName = row.course_name || "";

  const logRow = (status, message, extra) => {
    db.prepare(
      `INSERT INTO report_log (student_id, session_id, book_id, block, course_name, report_id, report_name, status, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(student_id, session_id, book_id, block) DO UPDATE SET
         report_id = excluded.report_id, report_name = excluded.report_name,
         status = excluded.status, message = excluded.message, created_at = excluded.created_at`
    ).run(sid, lsid, bid, block, courseName, extra?.report_id ?? null, extra?.report_name ?? null, status, message);
  };

  try {
    const resJournals = await resolveBlockJournals(api, { sid, lsid, bid, block, studentName: row.student_name }, headers);
    if (!resJournals.ok) {
      logRow("failed", resJournals.error);
      return { ok: false, status: "failed", message: resJournals.error };
    }
    const { journalIds, journals, range } = resJournals;

    const reports = await fetchReportsWithJournals(sid, lsid, bid, headers);
    for (const rep of reports) {
      const set = new Set();
      for (const j of journals) if (rep.journalIds.includes(j.id)) for (const n of j.lessons) set.add(n);
      const overlap = [...set].filter((n) => n >= range.from && n <= range.to);
      if (overlap.length) {
        const msg = `Lesson ${range.from}-${range.to} sudah tercakup report "${rep.name}" (#${rep.id})`;
        logRow("failed", msg);
        return { ok: false, status: "failed", message: msg };
      }
    }

    const criteriaIds = new Set((await fetchCourseCriteria(row.course_id, headers)).map((c) => c.id));
    const criterias = (Array.isArray(criteriaInput) ? criteriaInput : [])
      .filter((c) => c && criteriaIds.has(Number(c.id)))
      .map((c) => ({
        id: Number(c.id),
        score: Math.max(0, Math.min(100, Math.round(Number(c.score) || 0))),
        note: String(c.note ?? ""),
      }));
    if (!criterias.length) {
      const msg = "Pilih minimal satu kriteria — isi skor 0–100 untuk kriteria yang disertakan";
      logRow("failed", msg);
      return { ok: false, status: "failed", message: msg };
    }

    try {
      await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/summary`, headers, {
        method: "POST",
        body: { learning_session_book_meeting_journal_ids: journalIds },
      });
    } catch {}

    const body = { learning_session_book_meeting_journal_ids: journalIds, criterias };
    let resp = null;
    try {
      resp = await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/report`, headers, {
        method: "POST",
        body,
      });
    } catch (err) {
      if (JSON.stringify(err.response || "").match(/criteria|note|score/i)) {
        resp = await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/report`, headers, {
          method: "POST",
          body: { ...body, criterias: criterias.map(({ id, score }) => ({ id, score })) },
        });
      } else {
        throw err;
      }
    }

    let created = resp?.data || resp || {};
    let reportId = created.id ?? null;
    let reportName = created.name ?? null;
    let reportStatus = created.status ?? null;
    if (reportId == null) {
      try {
        const rl = await fetchJson(`/api/tms/student/${sid}/learning-session/${lsid}/book/${bid}/report`, headers);
        const newest = extractList(rl).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0];
        reportId = newest?.id ?? null;
        reportName = newest?.name ?? null;
        reportStatus = newest?.status ?? reportStatus;
      } catch {}
    }

    const msg = `Blok ${block} terkirim (#${reportId || "?"})${reportName ? ` — ${reportName}` : ""}`;
    logRow("ok", msg, { report_id: reportId, report_name: reportName });
    try {
      const row2 = db.prepare("SELECT block_status, block_info FROM report_scan WHERE student_id = ? AND session_id = ? AND book_id = ?").get(sid, lsid, bid);
      if (row2) {
        const st = { ...(JSON.parse(row2.block_status || "{}") || {}) };
        const info = { ...(JSON.parse(row2.block_info || "{}") || {}) };
        const status = String(reportStatus || "waiting_approval");
        st[block] = status;
        info[block] = { report_id: reportId, report_name: reportName, status };
        db.prepare(
          `UPDATE report_scan SET block_status = ?, block_info = ?, updated_at = datetime('now')
           WHERE student_id = ? AND session_id = ? AND book_id = ?`
        ).run(JSON.stringify(st), JSON.stringify(info), sid, lsid, bid);
      }
    } catch {}
    return { ok: true, status: "ok", message: msg, report_id: reportId, report_name: reportName };
  } catch (e) {
    const msg = String(e.message || e);
    logRow("failed", msg);
    return { ok: false, status: "failed", message: msg };
  }
}

module.exports = {
  createBlockReport,
};
