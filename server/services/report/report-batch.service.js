const { getDb } = require("../../db");
const { fetchJson } = require("../../lib/cms-client");
const { sleep, extractList } = require("../../lib/utils");
const { createBookReport } = require("./report-book.service");

const REQUEST_DELAY = 400;
let runRun = null;

function getRunStatus() {
  if (!runRun) {
    return {
      running: false,
      startedAt: null,
      finishedAt: null,
      current: 0,
      total: 0,
      studentName: null,
      results: [],
      failed: [],
    };
  }
  return { ...runRun };
}

function runReportForStudents(api, studentIds) {
  if (runRun && runRun.running) return { started: false, reason: "ALREADY_RUNNING" };
  runRun = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    current: 0,
    total: 0,
    studentName: null,
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
      const placeholders = studentIds.map(() => "?").join(",");
      const students = db
        .prepare(`SELECT id, name FROM students WHERE id IN (${placeholders}) ORDER BY lower(name)`)
        .all(...studentIds);
      runRun.total = students.length;
      if (!students.length) throw new Error("NO_STUDENTS");

      for (const st of students) {
        runRun.current++;
        runRun.studentName = st.name;
        try {
          const sessionsRes = await fetchJson(`/api/tms/student/${st.id}/learning-session?search=`, headers);
          const sessions = extractList(sessionsRes);
          for (const session of sessions) {
            const booksRes = await fetchJson(`/api/tms/student/${st.id}/learning-session/${session.id}/book`, headers);
            const books = extractList(booksRes);
            for (const book of books) {
              const res = await createBookReport(st, session, book, headers, db);
              const item = { book_id: book.id, course_name: book?.book?.course?.name || session.name || "", ...res };
              runRun.results.push(item);
              if (!res.ok && res.status !== "skipped") runRun.failed.push(item);
              await sleep(REQUEST_DELAY);
            }
            await sleep(REQUEST_DELAY);
          }
        } catch (e) {
          const item = { book_id: null, course_name: "", ok: false, status: "failed", message: String(e.message || e) };
          runRun.results.push(item);
          runRun.failed.push(item);
        }
      }
    } catch (e) {
      runRun.failed.push({ book_id: null, course_name: "", ok: false, status: "failed", message: String(e.message || e) });
    } finally {
      runRun.running = false;
      runRun.finishedAt = new Date().toISOString();
    }
  })();
  return { started: true };
}

module.exports = {
  getRunStatus,
  createBookReport,
  runReportForStudents,
};
