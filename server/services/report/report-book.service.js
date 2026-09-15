const { fetchJson } = require("../../lib/cms-client");
const { extractList } = require("../../lib/utils");
const { fetchCourseCriteria } = require("./report-helpers");

async function createBookReport(student, session, book, headers, db) {
  const { id: sid } = student;
  const { id: lsid } = session;
  const bid = book.id;
  const course = book?.book?.course || {};
  const courseName = course.name || session.name || "";

  // Legacy whole-book create: block tidak diketahui → 0 (lihat docs/API.md §5, deprecated)
  const logRow = (status, message, extra) => {
    db.prepare(
      `INSERT INTO report_log (student_id, session_id, book_id, block, course_name, report_id, report_name, status, message, created_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(student_id, session_id, book_id, block) DO UPDATE SET
         report_id = excluded.report_id, report_name = excluded.report_name,
         status = excluded.status, message = excluded.message, created_at = excluded.created_at`
    ).run(sid, lsid, bid, courseName, extra?.report_id ?? null, extra?.report_name ?? null, status, message);
  };

  try {
    const rl = await fetchJson(`/api/tms/student/${sid}/learning-session/${lsid}/book/${bid}/report`, headers);
    const list = extractList(rl);
    if (list.length) {
      const msg = `Sudah ada (${list[0].name || "report"} #${list[0].id})`;
      logRow("skipped", msg, { report_id: list[0].id, report_name: list[0].name });
      return { ok: false, status: "skipped", message: msg };
    }

    const jl = await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/meeting-history/journal`, headers);
    const journals = extractList(jl);
    const journalIds = journals.map((j) => j.id).filter((x) => x != null);
    if (!journalIds.length) {
      const msg = "Tidak ada jurnal meeting untuk book ini (isi lewat fitur Jurnal Meeting dulu)";
      logRow("failed", msg);
      return { ok: false, status: "failed", message: msg };
    }

    const criterias = (await fetchCourseCriteria(course.id, headers)).map((c) => ({ id: c.id, score: 0, note: "" }));

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
      if (criterias.length && JSON.stringify(err.response || "").match(/criteria|note|score/i)) {
        resp = await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/report`, headers, {
          method: "POST",
          body: { ...body, criterias: criterias.map(({ id }) => ({ id, score: 0 })) },
        });
      } else {
        throw err;
      }
    }

    const created = resp?.data || resp || {};
    const msg = `Terkirim (#${created.id || "?"})${created.name ? ` — ${created.name}` : ""}`;
    logRow("ok", msg, { report_id: created.id, report_name: created.name });
    return { ok: true, status: "ok", message: msg, report_id: created.id, report_name: created.name };
  } catch (e) {
    const msg = String(e.message || e);
    logRow("failed", msg);
    return { ok: false, status: "failed", message: msg };
  }
}

module.exports = {
  createBookReport,
};
