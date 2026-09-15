const { getDb } = require("../../db");
const { fetchJson } = require("../../lib/cms-client");
const { sleep } = require("../../lib/utils");

const REQUEST_DELAY = 400;
let fillRun = null;

function getFillStatus() {
  if (!fillRun) return { running: false, current: 0, total: 0, results: [], failed: [] };
  return {
    running: fillRun.running,
    current: fillRun.current,
    total: fillRun.total,
    results: fillRun.results,
    failed: fillRun.failed,
  };
}

function logEntry(db, e, status, message) {
  db.prepare(
    `INSERT INTO journal_log (student_id, course_id, meeting_id, note, status, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(student_id, course_id, meeting_id) DO UPDATE SET status = excluded.status, message = excluded.message, created_at = excluded.created_at`
  ).run(e.student_id, e.course_id, e.meeting_id, e.note || "", status, String(message || ""));
}

function runFill(api, entries) {
  if (fillRun && fillRun.running) return { started: false, reason: "ALREADY_RUNNING" };
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return { started: false, reason: "EMPTY" };
  fillRun = {
    running: true,
    current: 0,
    total: list.length,
    results: [],
    failed: [],
  };
  (async () => {
    try {
      const valid = await api.validateSession();
      if (!valid) throw new Error("NOT_LOGGED_IN");
      const headers = await api.getApiHeaders();
      if (!headers) throw new Error("NO_TOKEN");
      const db = getDb();

      for (const e of list) {
        fillRun.current++;
        const url = `/api/cms/student/${e.student_id}/learning-session/${e.session_id}/book/${e.history_id}/meeting-history/${e.meeting_id}/journal`;
        try {
          const r = await fetchJson(url, headers);
          if (r.data && r.data.id) {
            const msg = "sudah ada, dilewati";
            logEntry(db, e, "skipped", msg);
            fillRun.results.push({ student_id: e.student_id, meeting_id: e.meeting_id, meeting_name: e.meeting_name, ok: false, status: "skipped", message: msg });
            continue;
          }
        } catch {}

        try {
          await fetchJson(url, headers, {
            method: "POST",
            body: {
              note: e.note,
              learning_session_book_meeting_activities: (e.activities || []).map((a) => {
                // Jepit skor ke 0–100 (ditulis ke CMS asli). Kosong/invalid → 85.
                let score = a.score;
                if (typeof score !== "number") score = Number(score);
                score = Number.isFinite(score) ? score : 85;
                return { id: a.id, score: Math.max(0, Math.min(100, Math.round(score))) };
              }),
            },
          });
          logEntry(db, e, "ok", "tertulis");
          fillRun.results.push({ student_id: e.student_id, meeting_id: e.meeting_id, meeting_name: e.meeting_name, ok: true, status: "ok", message: "tertulis" });
        } catch (er) {
          const msg = er?.response?.message || er?.message || `HTTP ${er?.status || "?"}`;
          logEntry(db, e, "failed", msg);
          fillRun.results.push({ student_id: e.student_id, meeting_id: e.meeting_id, meeting_name: e.meeting_name, ok: false, status: "failed", message: msg });
          fillRun.failed.push({ student_id: e.student_id, meeting_id: e.meeting_id, meeting_name: e.meeting_name, message: msg });
        }
        await sleep(REQUEST_DELAY);
      }
    } catch (e) {
      fillRun.failed.push({ message: String(e.message || e) });
    } finally {
      fillRun.running = false;
    }
  })();
  return { started: true };
}

module.exports = {
  getFillStatus,
  runFill,
};
