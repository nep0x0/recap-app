const path = require("path");
const { getRecapDb } = require("./recap");

const API_ORIGIN = "https://cms.timedooracademy.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REQUEST_DELAY = 400;
const REPORT_STEP = 8;

let fillRun = null;

function getJournalDb() {
  const db = getRecapDb();
  db.exec(`CREATE TABLE IF NOT EXISTS journal_log (
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    meeting_id INTEGER NOT NULL,
    note TEXT,
    status TEXT,
    message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (student_id, course_id, meeting_id)
  )`);
  return db;
}

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
    const body = await fetchJson(`${baseUrl}&page=${p}`, headers);
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

function parseLessonNum(content) {
  const m = String(content || "").match(/Lesson\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function buildNote(studentName, lessons) {
  return lessons.map((l) => `${studentName} mempelajari ${l.content} dengan baik.`).join(" ");
}

function lessonSorter(a, b) {
  return (a.num || 0) - (b.num || 0);
}

function computeScore(l) {
  if (l.num % REPORT_STEP === 0) return 100;
  if ((l.value ?? 0) === 0) return 86;
  return Math.max(70, Math.min((l.value ?? 0) + 10, 100));
}

async function buildCoursePlan(student, session, headers) {
  const sid = session.id;
  const bookId = session?.book?.id || null;
  const historyId = session.latest_learning_session_book_id || bookId;
  if (!historyId) return null;

  let det = session;
  try {
    const r = await fetchJson(`/api/tms/student/${student.id}/learning-session/${sid}`, headers);
    det = r.data || session;
  } catch {}

  const book = det.book || {};
  const course = book.course || {};
  const courseId = course.id ?? bookId ?? sid;

  const meetings = await fetchAllPages(
    `/api/cms/student/${student.id}/learning-session/${sid}/book/${historyId}/meeting-history?search=`,
    headers
  );

  const valueMap = new Map();
  try {
    const v = await fetchJson(
      `/api/cms/student/${student.id}/learning-session/${sid}/book/${historyId}/meeting-history/activity`,
      headers
    );
    for (const a of v.data || []) {
      if (a && a.id != null && a.data && a.data.value != null) valueMap.set(a.id, a.data.value);
    }
  } catch {}

  const sorted = meetings
    .map((m) => ({
      id: m.id,
      name: m.name,
      date: m.date,
      lessons: (m.activities || [])
        .map((a) => ({ id: a.id, content: a?.data?.content || "", value: valueMap.has(a.id) ? valueMap.get(a.id) : (a?.data?.value ?? 0), num: parseLessonNum(a?.data?.content) }))
        .filter((l) => l.num !== null)
        .sort(lessonSorter),
    }))
    .sort((a, b) => String(a.name || a.date).localeCompare(String(b.name || b.date), undefined, { numeric: true }));

  const lessonsAll = sorted.flatMap((m) => m.lessons);
  const maxNum = lessonsAll.reduce((mx, l) => Math.max(mx, l.num), 0);
  const totalLessons = Math.max(det.total_progress ?? 0, maxNum);

  const statuses = [];
  for (const m of sorted) {
    let journal = null;
    try {
      const r = await fetchJson(
        `/api/cms/student/${student.id}/learning-session/${sid}/book/${historyId}/meeting-history/${m.id}/journal`,
        headers
      );
      const d = r.data || {};
      journal = d.id
        ? { id: d.id, note: d.note, recorded: (d.activities || []).map((a) => a?.data?.content || "").filter(Boolean) }
        : null;
    } catch {}
    statuses.push(journal);
  }

  const startIdx = statuses.findIndex((j) => !j);
  if (startIdx < 0) return null;

  const skipped = [];
  const entries = [];
  let carried = [];

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const journal = statuses[i];

    if (journal) {
      const recorded = new Set(journal.recorded || []);
      const unrecorded = m.lessons.filter((l) => !recorded.has(l.content));
      carried = carried.concat(unrecorded);
      skipped.push({
        meeting_id: m.id,
        meeting_name: m.name,
        date: m.date,
        reason: "exists",
        lessons: unrecorded.map((l) => l.content),
      });
      continue;
    }
    if (i < startIdx) {
      carried = [];
      continue;
    }

    const candidate = carried.concat(m.lessons);
    carried = [];
    const examNums = candidate.filter((l) => l.num % REPORT_STEP === 0).map((l) => l.num);
    const lastExamNum = examNums.length ? Math.max(...examNums) : 0;
    const moved = lastExamNum ? candidate.filter((l) => l.num > lastExamNum) : [];
    const write = lastExamNum ? candidate.filter((l) => l.num <= lastExamNum) : candidate;

    if (moved.length) {
      carried = moved;
      skipped.push({
        meeting_id: m.id,
        meeting_name: m.name,
        date: m.date,
        reason: "moved",
        lessons: moved.map((l) => l.content),
      });
    }
    if (!write.length) {
      skipped.push({ meeting_id: m.id, meeting_name: m.name, date: m.date, reason: "empty" });
      continue;
    }

    entries.push({
      key: `${student.id}-${sid}-${m.id}`,
      student_id: student.id,
      student_name: student.name,
      session_id: sid,
      book_id: bookId,
      history_id: historyId,
      course_id: courseId,
      course_name: course.name || book.name || sid,
      meeting_id: m.id,
      meeting_name: m.name,
      date: m.date,
      lessons: write.map((l) => l.content),
      note: buildNote(student.name, write),
      activities: write.map((l) => ({ id: l.id, score: computeScore(l) })),
      exists: null,
    });
  }

  return {
    course_id: courseId,
    total_lessons: totalLessons,
    course_name: course.name || book.name || sid,
    book_id: bookId,
    history_id: historyId,
    session_id: sid,
    latest_progress: det.latest_progress ?? maxNum,
    total_progress: det.total_progress ?? null,
    entries,
    skipped,
  };
}

async function buildPlan(api, { studentId } = {}) {
  const valid = await api.validateSession();
  if (!valid) throw new Error("NOT_LOGGED_IN");
  const headers = await api.getApiHeaders();
  if (!headers) throw new Error("NO_TOKEN");

  const db = getRecapDb();
  const students = db.prepare("SELECT id, name FROM students ORDER BY lower(name)").all();
  const filterId = studentId ? Number(studentId) : null;
  const courses = [];

  for (const st of students) {
    if (filterId && st.id !== filterId) continue;
    let sessions = [];
    try {
      sessions = await fetchAllPages(`/api/tms/student/${st.id}/learning-session?search=`, headers);
    } catch {
      continue;
    }
    for (const session of sessions || []) {
      try {
        const cp = await buildCoursePlan(st, session, headers);
        if (cp) courses.push({ student_id: st.id, student_name: st.name, ...cp });
      } catch {
        continue;
      }
      await sleep(REQUEST_DELAY);
    }
  }

  const entries = courses
    .flatMap((c) => c.entries.map((e) => ({ ...e, course_name: c.course_name })))
    .filter((e) => !e.exists);
  const skipped = courses.flatMap((c) => c.skipped);

  return {
    built_at: new Date().toISOString(),
    student_count: new Set(courses.map((c) => c.student_id)).size,
    course_count: courses.length,
    entry_count: entries.length,
    skipped_count: skipped.length,
    entries,
    skipped,
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
      const db = getJournalDb();

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
            body: JSON.stringify({ note: e.note, learning_session_book_meeting_activities: e.activities || [] }),
            signal: AbortSignal.timeout(30000),
          });
          const body = await r.json().catch(() => null);
          if (r.status >= 200 && r.status < 300) {
            logEntry(db, e, "ok", "tertulis");
            fillRun.results.push({ meeting_id: e.meeting_id, meeting_name: e.meeting_name, ok: true, status: "ok", message: "tertulis" });
          } else {
            const msg = (body?.message) || `HTTP ${r.status}`;
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

async function analyzeBlockJournals(api, { student_id, session_id, book_id, block, student_name }) {
  const valid = await api.validateSession();
  if (!valid) return { ok: false, error: "Sesi CMS berakhir — masuk ulang" };
  const headers = await api.getApiHeaders();
  if (!headers) return { ok: false, error: "Token tidak ditemukan" };

  const from = block - REPORT_STEP + 1;
  const to = block;

  const meetings = await fetchAllPages(
    `/api/cms/student/${student_id}/learning-session/${session_id}/book/${book_id}/meeting-history?search=`,
    headers
  );

  const valueMap = new Map();
  try {
    const v = await fetchJson(
      `/api/cms/student/${student_id}/learning-session/${session_id}/book/${book_id}/meeting-history/activity`,
      headers
    );
    for (const a of v.data || []) {
      if (a && a.id != null && a.data && a.data.value != null) valueMap.set(a.id, a.data.value);
    }
  } catch {}

  const sorted = meetings
    .map((m) => ({
      id: m.id,
      name: m.name,
      date: m.date,
      lessons: (m.activities || [])
        .map((a) => ({
          id: a.id,
          content: a?.data?.content || "",
          value: valueMap.has(a.id) ? valueMap.get(a.id) : (a?.data?.value ?? 0),
          num: parseLessonNum(a?.data?.content),
        }))
        .filter((l) => l.num !== null && l.num >= from && l.num <= to)
        .sort(lessonSorter),
    }))
    .filter((m) => m.lessons.length > 0)
    .sort((a, b) => String(a.name || a.date).localeCompare(String(b.name || b.date), undefined, { numeric: true }));

  const missing = [];
  for (const m of sorted) {
    let exists = false;
    try {
      const r = await fetchJson(
        `/api/cms/student/${student_id}/learning-session/${session_id}/book/${book_id}/meeting-history/${m.id}/journal`,
        headers
      );
      exists = !!(r.data && r.data.id);
    } catch {}
    if (!exists) missing.push({ id: m.id, name: m.name, date: m.date, lessons: m.lessons });
  }

  return {
    ok: true,
    fillable: sorted.length > 0,
    student_name: student_name || "siswa",
    meetings: sorted.map((m) => ({ id: m.id, name: m.name })),
    missing,
  };
}

async function ensureJournalsForBlock(api, opts) {
  const a = await analyzeBlockJournals(api, opts);
  if (!a.ok) return a;
  if (!a.missing.length) return { ok: true, fillable: true, created: [], existing: a.meetings, failed: [] };

  const valid = await api.validateSession();
  const headers = await api.getApiHeaders();
  const { student_id, session_id, book_id } = opts;

  const created = [];
  const failed = [];
  for (const m of a.missing) {
    try {
      const r = await fetch(API_ORIGIN + `/api/cms/student/${student_id}/learning-session/${session_id}/book/${book_id}/meeting-history/${m.id}/journal`, {
        method: "POST",
        headers: {
          authorization: "Bearer " + headers.token,
          "x-app-branch": headers.branch,
          "x-app-timezone": headers.timezone,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note: buildNote(a.student_name, m.lessons),
          learning_session_book_meeting_activities: m.lessons.map((l) => ({ id: l.id, score: computeScore(l) })),
        }),
        signal: AbortSignal.timeout(30000),
      });
      const body = await r.json().catch(() => null);
      if (r.status >= 200 && r.status < 300) {
        created.push({ meeting_id: m.id, meeting_name: m.name, lessons: m.lessons.length });
      } else {
        failed.push({ meeting_id: m.id, meeting_name: m.name, error: body?.message || `HTTP ${r.status}` });
      }
    } catch (er) {
      failed.push({ meeting_id: m.id, meeting_name: m.name, error: String(er.message || er) });
    }
    await sleep(REQUEST_DELAY);
  }
  return { ok: true, fillable: true, created, existing: [], failed };
}

module.exports = { buildPlan, runFill, getFillStatus, analyzeBlockJournals, ensureJournalsForBlock };