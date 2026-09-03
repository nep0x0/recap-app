const { getDb } = require("../../db");
const { fetchJson } = require("../../lib/cms-client");
const { sleep, extractList } = require("../../lib/utils");
const {
  BLOCK_SIZE,
  maxLessonFromMeetings,
  lessonNumbersOfJournal,
  fullBlocksOf,
  coveredBlocksOf,
} = require("./report-helpers");

const REQUEST_DELAY = 400;
let scanRun = null;

function getScanStatus() {
  if (!scanRun) return { running: false, current: 0, total: 0, errors: [] };
  return {
    running: scanRun.running,
    startedAt: scanRun.startedAt,
    finishedAt: scanRun.finishedAt,
    current: scanRun.current,
    total: scanRun.total,
    studentName: scanRun.studentName,
    errors: scanRun.errors,
  };
}

function runScan(api) {
  if (scanRun && scanRun.running) return { started: false, reason: "ALREADY_RUNNING" };
  scanRun = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    current: 0,
    total: 0,
    studentName: null,
    errors: [],
  };
  (async () => {
    try {
      const valid = await api.validateSession();
      if (!valid) throw new Error("NOT_LOGGED_IN");
      const headers = await api.getApiHeaders();
      if (!headers) throw new Error("NO_TOKEN");

      const db = getDb();
      const students = db.prepare("SELECT id, name FROM students ORDER BY lower(name)").all();
      scanRun.total = students.length;

      const upsert = db.prepare(`
        INSERT INTO report_scan
        (student_id, session_id, book_id, course_id, course_name, max_lesson, block, report_exists, report_id, report_name, covered_blocks, block_status, block_info, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(student_id, session_id, book_id) DO UPDATE SET
          course_id = excluded.course_id, course_name = excluded.course_name,
          max_lesson = excluded.max_lesson, block = excluded.block,
          report_exists = excluded.report_exists, report_id = excluded.report_id,
          report_name = excluded.report_name, covered_blocks = excluded.covered_blocks,
          block_status = excluded.block_status, block_info = excluded.block_info,
          updated_at = excluded.updated_at
      `);

      for (const st of students) {
        scanRun.current++;
        scanRun.studentName = st.name;
        try {
          const doneBooks = new Set(
            db.prepare("SELECT book_id FROM report_done WHERE student_id = ?").all(st.id).map((r) => r.book_id)
          );
          const sessionsRes = await fetchJson(`/api/tms/student/${st.id}/learning-session?search=`, headers);
          const sessions = extractList(sessionsRes);
          for (const session of sessions) {
            const booksRes = await fetchJson(`/api/tms/student/${st.id}/learning-session/${session.id}/book`, headers);
            const books = extractList(booksRes);
            for (const book of books) {
              const bid = book.id;
              if (doneBooks.has(bid)) continue;
              const course = book?.book?.course || {};
              let maxLesson = 0;
              let journals = [];
              try {
                const mh = await fetchJson(`/api/cms/student/${st.id}/learning-session/${session.id}/book/${bid}/meeting-history?search=`, headers);
                const meetings = extractList(mh);
                maxLesson = maxLessonFromMeetings(meetings);
                const jl = await fetchJson(`/api/cms/student/${st.id}/learning-session/${session.id}/book/${bid}/meeting-history/journal`, headers);
                journals = extractList(jl).map((j) => ({ id: j.id, lessons: lessonNumbersOfJournal(j) }));
              } catch {}
              let reportExists = 0;
              let reportId = null;
              let reportName = null;
              const coveredLessons = new Set();
              const blockStatus = {};
              const blockInfo = {};
              try {
                const rl = await fetchJson(`/api/tms/student/${st.id}/learning-session/${session.id}/book/${bid}/report`, headers);
                const list = extractList(rl);
                if (list.length) {
                  reportExists = 1;
                  reportId = list[0].id ?? null;
                  reportName = list[0].name ?? null;
                }
                for (const rep of list) {
                  try {
                    const det = await fetchJson(`/api/tms/student/${st.id}/learning-session/${session.id}/book/${bid}/report/${rep.id}`, headers);
                    const payload = det?.data || det;
                    const rawJids = Array.isArray(payload?.learning_session_book_meeting_journals)
                      ? payload.learning_session_book_meeting_journals
                      : [];
                    const jids = new Set(rawJids.map((j) => j.id));
                    const repLessons = new Set();
                    for (const j of journals) if (jids.has(j.id)) for (const n of j.lessons) repLessons.add(n);
                    for (const n of repLessons) coveredLessons.add(n);
                    const status = String(rep.status || "waiting_approval");
                    for (const b of fullBlocksOf(maxLesson, repLessons)) {
                      if (!blockInfo[b]) blockInfo[b] = { report_id: rep.id ?? null, report_name: rep.name ?? null, status };
                      if (status === "approved") blockStatus[b] = "approved";
                      else if (!blockStatus[b]) blockStatus[b] = status;
                    }
                  } catch {}
                }
              } catch {}
              const block = Math.floor(maxLesson / BLOCK_SIZE);
              const coveredBlocks = coveredBlocksOf(maxLesson, coveredLessons);
              upsert.run(st.id, session.id, bid, course.id ?? null, course.name || session.name || "", maxLesson, block, reportExists, reportId, reportName, coveredBlocks, JSON.stringify(blockStatus), JSON.stringify(blockInfo));
              await sleep(REQUEST_DELAY / 2);
            }
            await sleep(REQUEST_DELAY);
          }
        } catch (e) {
          scanRun.errors.push({ id: st.id, name: st.name, error: String(e.message || e) });
        }
        await sleep(REQUEST_DELAY / 2);
      }
    } catch (e) {
      scanRun.errors.push({ error: String(e.message || e) });
    } finally {
      scanRun.running = false;
      scanRun.finishedAt = new Date().toISOString();
    }
  })();
  return { started: true };
}

module.exports = {
  getScanStatus,
  runScan,
};
