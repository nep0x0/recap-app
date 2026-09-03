const { getDb } = require("../../db");
const { sleep } = require("../../lib/utils");
const { fetchAllPages, fetchSessionRecap, REQUEST_DELAY } = require("./recap-fetch.service");

let recapRun = null;

function getStatus() {
  if (!recapRun) {
    return {
      running: false,
      startedAt: null,
      finishedAt: null,
      current: 0,
      total: 0,
      studentName: null,
      failed: [],
      lastError: null,
    };
  }
  return {
    running: recapRun.running,
    startedAt: recapRun.startedAt,
    finishedAt: recapRun.finishedAt,
    current: recapRun.current,
    total: recapRun.total,
    studentName: recapRun.studentName,
    failed: recapRun.failed,
    lastError: recapRun.lastError,
  };
}

async function runRecap(api, { force = false } = {}) {
  if (recapRun && recapRun.running) return { started: false, reason: "ALREADY_RUNNING" };
  recapRun = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    current: 0,
    total: 0,
    studentName: null,
    failed: [],
    lastError: null,
  };
  (async () => {
    try {
      const valid = await api.validateSession();
      if (!valid) throw new Error("NOT_LOGGED_IN");
      const headers = await api.getApiHeaders();
      if (!headers) throw new Error("NO_TOKEN");

      const db = getDb();
      const students = db
        .prepare("SELECT id, name FROM students ORDER BY lower(name)")
        .all()
        .map((r) => ({
          ...r,
          recaps: force ? 0 : db.prepare("SELECT COUNT(*) AS c FROM recaps WHERE student_id=?").get(r.id).c,
        }));
      const todo = students.filter((s) => s.recaps === 0);
      recapRun.total = todo.length;
      recapRun.current = 0;

      const upsert = db.prepare(`
        INSERT INTO recaps (student_id, course_id, course_name, data, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(student_id, course_id) DO UPDATE SET course_name = excluded.course_name, data = excluded.data, updated_at = excluded.updated_at
      `);

      for (const st of todo) {
        recapRun.current++;
        recapRun.studentName = st.name;
        try {
          const sessions = await fetchAllPages(`/api/tms/student/${st.id}/learning-session?search=`, headers);
          for (const session of sessions) {
            const rec = await fetchSessionRecap(st.id, session, headers);
            upsert.run(st.id, rec.session_id, rec.course_name, JSON.stringify(rec));
            await sleep(REQUEST_DELAY);
          }
        } catch (e) {
          recapRun.failed.push({ id: st.id, name: st.name, error: String(e.message || e) });
          recapRun.lastError = String(e.message || e);
        }
        await sleep(REQUEST_DELAY);
      }
    } catch (e) {
      recapRun.lastError = String(e.message || e);
      recapRun.failed.push({
        name: e.message === "NOT_LOGGED_IN" ? "sesi login tidak valid" : null,
        error: String(e.message || e),
      });
    } finally {
      recapRun.running = false;
      recapRun.finishedAt = new Date().toISOString();
    }
  })();
  return { started: true };
}

module.exports = {
  getStatus,
  runRecap,
};
