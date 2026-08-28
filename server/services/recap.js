const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", "data");
const API_ORIGIN = "https://cms.timedooracademy.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REQUEST_DELAY = 400;

let recapRun = null;

function getRecapDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "recap.db"));
  db.exec(`CREATE TABLE IF NOT EXISTS recaps (
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    course_name TEXT,
    data TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (student_id, course_id)
  )`);
  return db;
}

function getStatus() {
  if (!recapRun) return { running: false, startedAt: null, finishedAt: null, current: 0, total: 0, studentName: null, failed: [], lastError: null };
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

async function fetchJson(url, headers) {
  const full = url.startsWith("http") ? url : API_ORIGIN + url;
  const res = await fetch(full, {
    headers: {
      authorization: "Bearer " + headers.token,
      "x-app-branch": headers.branch,
      "x-app-timezone": headers.timezone,
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.json();
}

async function fetchAllPages(baseUrl, headers) {
  const items = [];
  let p = 1;
  let lastPage = 1;
  for (;;) {
    const body = await fetchJson(`${baseUrl}&limit=100&page=${p}`, headers);
    const arr = Array.isArray(body.data) ? body.data : [];
    items.push(...arr);
    if (body.meta && body.meta.last_page) lastPage = body.meta.last_page;
    if (p >= lastPage) break;
    p++;
    if (p > 50) break;
    await sleep(REQUEST_DELAY);
  }
  return items;
}

function parseQuizzes(progress) {
  const out = [];
  for (const pr of progress?.progresses || []) {
    for (const th of pr?.detail?.test_histories || []) {
      out.push({ unit_uuid: pr.detail.uuid, attempt: th });
    }
  }
  return out;
}

function scoreSummary(quiz) {
  const text = JSON.stringify(quiz.attempt || {});
  const m = text.match(/"score"\s*:\s*(\d+(?:\.\d+)?)/);
  const c = text.match(/"correct"\s*:\s*(\d+)/);
  const t = text.match(/"total"\s*:\s*(\d+)/);
  if (m) return `${m[1]}${t ? "/" + t[1] : ""}`;
  if (c) return `${c[1]}${t ? "/" + t[1] : ""}`;
  return null;
}

async function fetchSessionRecap(studentId, session, headers) {
  const sid = session.id;
  let det = session;
  try {
    const r = await fetchJson(`/api/tms/student/${studentId}/learning-session/${sid}`, headers);
    det = r.data || r;
  } catch {}
  const book = det.book || {};
  const bookId = book.id;
  const historyId = session.latest_learning_session_book_id || bookId;

  let progress = null;
  if (bookId) {
    try {
      const r = await fetchJson(`/api/v2/tms/student/${studentId}/book/${bookId}/progress-detail`, headers);
      progress = r.data || null;
    } catch {}
  }

  let meetings = [];
  if (bookId && historyId) {
    try {
      meetings = await fetchAllPages(
        `/api/cms/student/${studentId}/learning-session/${sid}/book/${historyId}/meeting-history?search=`,
        headers
      );
    } catch {}
  }

  const withLesson = meetings
    .filter((m) => (m.activities || []).length > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const lastMeeting = withLesson[0] || null;

  const quizzes = progress ? parseQuizzes(progress) : [];
  const stats = progress?.stats || null;

  return {
    session_id: sid,
    session_name: det.name || session.name || "",
    session_code: det.code || session.code || "",
    book_id: bookId,
    book_name: book.name || "",
    course_id: book?.course?.id ?? null,
    course_name: book?.course?.name || book.name || session.name || "Course",
    last_lesson: det.activity || (lastMeeting ? (lastMeeting.activities[0]?.data?.content || "") : null) || null,
    last_lesson_date: lastMeeting ? lastMeeting.date : null,
    last_meeting: lastMeeting ? lastMeeting.name : null,
    latest_progress: det.latest_progress ?? null,
    total_progress: det.total_progress ?? null,
    stats,
    quizzes,
    meetings: meetings
      .map((m) => ({
        name: m.name,
        date: m.date,
        start_time: m.start_time,
        end_time: m.end_time,
        lessons: (m.activities || []).map((a) => a?.data?.content || "").filter(Boolean),
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
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

      const db = getRecapDb();
      const students = db
        .prepare("SELECT id, name FROM students ORDER BY lower(name)")
        .all()
        .map((r) => ({ ...r, recaps: force ? 0 : db.prepare("SELECT COUNT(*) AS c FROM recaps WHERE student_id=?").get(r.id).c }));
      const todo = students.filter((s) => s.recaps === 0);
      recapRun.total = todo.length;
      recapRun.current = 0;

      const upsert = db.prepare(`INSERT INTO recaps (student_id, course_id, course_name, data, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(student_id, course_id) DO UPDATE SET course_name = excluded.course_name, data = excluded.data, updated_at = excluded.updated_at`);

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
      recapRun.failed.push({ name: e.message === "NOT_LOGGED_IN" ? "sesi login tidak valid" : null, error: String(e.message || e) });
    } finally {
      recapRun.running = false;
      recapRun.finishedAt = new Date().toISOString();
    }
  })();
  return { started: true };
}

function listRecaps() {
  const db = getRecapDb();
  const rows = db
    .prepare(
      `SELECT r.student_id, r.course_id, r.course_name, r.data, r.updated_at, s.name AS student_name
       FROM recaps r JOIN students s ON s.id = r.student_id
       ORDER BY s.name, r.course_name`
    )
    .all();
  return rows.map((r) => {
    let data = {};
    try {
      data = JSON.parse(r.data);
    } catch {}
    const stats = data.stats || {};
    const mp = stats.mastery_point || {};
    const lb = stats.learnable || {};
    const quizzes = (data.quizzes || []).map((q) => {
      const sc = scoreSummary(q);
      return { score: sc, attempt: q.attempt };
    });
    return {
      student_id: r.student_id,
      student_name: r.student_name,
      course_id: r.course_id,
      course_name: r.course_name,
      last_lesson: data.last_lesson || null,
      last_lesson_date: data.last_lesson_date || null,
      last_meeting: data.last_meeting || null,
      latest_progress: data.latest_progress ?? null,
      total_progress: data.total_progress ?? null,
      completion_percent: lb.completion_percentage ?? null,
      mastery_gained: mp.gained ?? null,
      mastery_max: mp.max ?? null,
      mastery_pct: mp.completion_percentage ?? null,
      coin_gained: (stats.coin || {}).gained ?? null,
      quiz_count: quizzes.length,
      quizzes,
      meetings: data.meetings || [],
      synced_at: r.updated_at,
    };
  });
}

module.exports = { runRecap, getStatus, listRecaps, getRecapDb, scoreSummary };