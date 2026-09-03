const { API_ORIGIN } = require("../../config");
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
            fillRun.results.push({ meeting_id: e.meeting_id, meeting_name: e.meeting_name, ok: false, status: "skipped", message: msg });
            continue;
          }
        } catch {}

        try {
          const r = await fetch(API_ORIGIN + url, {
            method: "POST",
            headers: {
              authorization: "Bearer " + headers.token,
              "x-app-branch": headers.branch,
              "x-app-timezone": headers.timezone,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              note: e.note,
              learning_session_book_meeting_activities: (e.activities || []).map((a) => ({
                id: a.id,
                score: typeof a.score === "number" ? a.score : parseInt(a.score, 10) || 85,
              })),
            }),
            signal: AbortSignal.timeout(30000),
          });
          const body = await r.json().catch(() => null);
          if (r.status >= 200 && r.status < 300) {
            logEntry(db, e, "ok", "tertulis");
            fillRun.results.push({ meeting_id: e.meeting_id, meeting_name: e.meeting_name, ok: true, status: "ok", message: "tertulis" });
          } else {
            const msg = body?.message || `HTTP ${r.status}`;
            logEntry(db, e, "failed", msg);
            fillRun.results.push({ meeting_id: e.meeting_id, meeting_name: e.meeting_name, ok: false, status: "failed", message: msg });
            fillRun.failed.push({ meeting_id: e.meeting_id, meeting_name: e.meeting_name, message: msg });
          }
        } catch (er) {
          const msg = String(er.message || er);
          logEntry(db, e, "failed", msg);
          fillRun.results.push({ meeting_id: e.meeting_id, meeting_name: e.meeting_name, ok: false, status: "failed", message: msg });
          fillRun.failed.push({ meeting_id: e.meeting_id, meeting_name: e.meeting_name, message: msg });
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
