const path = require("path");
const { getRecapDb } = require("./recap");
const journalService = require("./journal");

const API_ORIGIN = "https://cms.timedooracademy.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REQUEST_DELAY = 400;
const BLOCK_SIZE = 8;

let scanRun = null;
let runRun = null;

function reportDb() {
  const db = getRecapDb();
  db.exec(`CREATE TABLE IF NOT EXISTS report_scan (
    student_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    course_id INTEGER,
    course_name TEXT,
    max_lesson INTEGER DEFAULT 0,
    block INTEGER DEFAULT 0,
    report_exists INTEGER DEFAULT 0,
    report_id INTEGER,
    report_name TEXT,
    covered_blocks TEXT DEFAULT '',
    block_status TEXT DEFAULT '',
    block_info TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (student_id, session_id, book_id)
  )`);
  try {
    db.exec(`ALTER TABLE report_scan ADD COLUMN covered_blocks TEXT DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE report_scan ADD COLUMN block_status TEXT DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE report_scan ADD COLUMN block_info TEXT DEFAULT ''`);
  } catch {}
  db.exec(`CREATE TABLE IF NOT EXISTS report_done (
    student_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (student_id, book_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS report_log (
    student_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    course_name TEXT,
    report_id INTEGER,
    report_name TEXT,
    status TEXT,
    message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (student_id, session_id, book_id)
  )`);
  return db;
}

async function fetchJson(url, headers, method = "GET", body = null) {
  const full = url.startsWith("http") ? url : API_ORIGIN + url;
  const res = await fetch(full, {
    method,
    headers: {
      authorization: "Bearer " + headers.token,
      "x-app-branch": headers.branch,
      "x-app-timezone": headers.timezone,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, data: json, text };
}

function parseLessonNum(content) {
  const m = String(content || "").match(/Lesson\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function maxLessonFromMeetings(meetings) {
  let max = 0;
  for (const m of meetings || []) {
    for (const a of m?.activities || []) {
      const n = parseLessonNum(a?.data?.content || a?.data?.title || "");
      if (n && n > max) max = n;
    }
  }
  return max;
}

/* ================= scan ================= */

function getScanStatus() {
  if (!scanRun) return { running: false, startedAt: null, finishedAt: null, current: 0, total: 0, studentName: null, errors: [] };
  return { ...scanRun };
}

function runScan(api) {
  if (scanRun && scanRun.running) return { started: false, reason: "ALREADY_RUNNING" };
  scanRun = { running: true, startedAt: new Date().toISOString(), finishedAt: null, current: 0, total: 0, studentName: null, errors: [] };
  (async () => {
    try {
      const valid = await api.validateSession();
      if (!valid) throw new Error("NOT_LOGGED_IN");
      const headers = await api.getApiHeaders();
      if (!headers) throw new Error("NO_TOKEN");

      const db = reportDb();
      const students = db.prepare("SELECT id, name FROM students ORDER BY lower(name)").all();
      scanRun.total = students.length;

      const upsert = db.prepare(`INSERT INTO report_scan
        (student_id, session_id, book_id, course_id, course_name, max_lesson, block, report_exists, report_id, report_name, covered_blocks, block_status, block_info, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(student_id, session_id, book_id) DO UPDATE SET
          course_id = excluded.course_id, course_name = excluded.course_name,
          max_lesson = excluded.max_lesson, block = excluded.block,
          report_exists = excluded.report_exists, report_id = excluded.report_id,
          report_name = excluded.report_name, covered_blocks = excluded.covered_blocks,
          block_status = excluded.block_status, block_info = excluded.block_info,
          updated_at = excluded.updated_at`);

      const coveredBlocksOf = (maxLesson, coveredLessons) => fullBlocksOf(maxLesson, coveredLessons).join(",");
      const fullBlocksOf = (maxLesson, coveredLessons) => {
        const out = [];
        for (let i = 1; i <= Math.floor(maxLesson / BLOCK_SIZE); i++) {
          const from = i * BLOCK_SIZE - BLOCK_SIZE + 1;
          const to = i * BLOCK_SIZE;
          let full = true;
          for (let n = from; n <= to; n++) if (!coveredLessons.has(n)) { full = false; break; }
          if (full) out.push(to);
        }
        return out;
      };

      for (const st of students) {
        scanRun.current++;
        scanRun.studentName = st.name;
        try {
          const doneBooks = new Set(
            db.prepare("SELECT book_id FROM report_done WHERE student_id = ?").all(st.id).map((r) => r.book_id)
          );
          const { data } = await fetchJson(`/api/tms/student/${st.id}/learning-session?search=`, headers);
          const sessions = Array.isArray(data?.data) ? data.data : [];
          for (const session of sessions) {
            const { data: booksData } = await fetchJson(`/api/tms/student/${st.id}/learning-session/${session.id}/book`, headers);
            const books = Array.isArray(booksData?.data) ? booksData.data : [];
            for (const book of books) {
              const bid = book.id;
              if (doneBooks.has(bid)) continue;
              const course = book?.book?.course || {};
              let maxLesson = 0;
              let journals = [];
              try {
                const { data: mh } = await fetchJson(`/api/cms/student/${st.id}/learning-session/${session.id}/book/${bid}/meeting-history?search=`, headers);
                const meetings = Array.isArray(mh?.data) ? mh.data : [];
                maxLesson = maxLessonFromMeetings(meetings);
                const { data: jl } = await fetchJson(`/api/cms/student/${st.id}/learning-session/${session.id}/book/${bid}/meeting-history/journal`, headers);
                journals = (Array.isArray(jl?.data) ? jl.data : []).map((j) => ({ id: j.id, lessons: lessonNumbersOfJournal(j) }));
              } catch {}
              let reportExists = 0;
              let reportId = null;
              let reportName = null;
              const coveredLessons = new Set();
              const blockStatus = {};
              const blockInfo = {};
              try {
                const { data: rl } = await fetchJson(`/api/tms/student/${st.id}/learning-session/${session.id}/book/${bid}/report`, headers);
                const list = Array.isArray(rl?.data) ? rl.data : [];
                if (list.length) {
                  reportExists = 1;
                  reportId = list[0].id ?? null;
                  reportName = list[0].name ?? null;
                }
                for (const rep of list) {
                  try {
                    const { data: det } = await fetchJson(`/api/tms/student/${st.id}/learning-session/${session.id}/book/${bid}/report/${rep.id}`, headers);
                    const jids = new Set((Array.isArray(det?.data?.learning_session_book_meeting_journals) ? det.data.learning_session_book_meeting_journals : []).map((j) => j.id));
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

function listDue() {
  const db = reportDb();
  const rows = db
    .prepare(
      `SELECT rs.student_id, s.name AS student_name, rs.session_id, rs.book_id, rs.course_id, rs.course_name,
              rs.max_lesson, rs.block, rs.covered_blocks, rs.block_status, rs.block_info, rs.updated_at, rs.report_id, rs.report_name
       FROM report_scan rs JOIN students s ON s.id = rs.student_id
       LEFT JOIN report_done rd ON rd.student_id = rs.student_id AND rd.book_id = rs.book_id
       WHERE rs.block >= 1 AND rd.book_id IS NULL
       ORDER BY s.name, rs.course_name`
    )
    .all();
  return rows
    .map((r) => {
      const covered = new Set(String(r.covered_blocks || "").split(",").filter(Boolean).map((x) => Number(x)));
      let statusMap = {};
      try { statusMap = JSON.parse(r.block_status || "{}") || {}; } catch {}
      let infoMap = {};
      try { infoMap = JSON.parse(r.block_info || "{}") || {}; } catch {}
      const labels = blockLabels(r.block);
      const due_blocks = labels.filter((b) => !covered.has(b) && !statusMap[b]);
      const waiting_blocks = labels
        .filter((b) => statusMap[b] && statusMap[b] !== "approved")
        .map((b) => ({ block: b, status: statusMap[b], ...(infoMap[b] || {}) }));
      return { ...r, due_blocks, waiting_blocks };
    })
    .filter((r) => r.due_blocks.length > 0 || r.waiting_blocks.length > 0);
}

function blockLabels(block) {
  const labels = [];
  for (let i = 1; i <= block; i++) labels.push(i * BLOCK_SIZE);
  return labels;
}

/* ================= tandai selesai ================= */

function listDone() {
  const db = reportDb();
  return db
    .prepare(
      `SELECT rd.student_id, s.name AS student_name, rd.book_id, rs.session_id, rs.course_id,
              COALESCE(rs.course_name, '') AS course_name, rs.max_lesson, rd.created_at
       FROM report_done rd
       JOIN students s ON s.id = rd.student_id
       LEFT JOIN report_scan rs ON rs.student_id = rd.student_id AND rs.book_id = rd.book_id
       ORDER BY s.name, rs.course_name`
    )
    .all();
}

function markDone(studentId, bookId) {
  const db = reportDb();
  const exists = db
    .prepare("SELECT 1 FROM report_scan WHERE student_id = ? AND book_id = ?")
    .get(studentId, bookId);
  if (!exists) return { ok: false, error: "Book tidak ditemukan di hasil scan — pindai ulang dulu" };
  db.prepare("INSERT OR IGNORE INTO report_done (student_id, book_id, created_at) VALUES (?, ?, datetime('now'))").run(studentId, bookId);
  return { ok: true };
}

function unmarkDone(studentId, bookId) {
  const db = reportDb();
  db.prepare("DELETE FROM report_done WHERE student_id = ? AND book_id = ?").run(studentId, bookId);
  return { ok: true };
}

function isDone(studentId, bookId) {
  return !!reportDb().prepare("SELECT 1 FROM report_done WHERE student_id = ? AND book_id = ?").get(studentId, bookId);
}

/* ================= per-block create (alur baru) ================= */

const BLOCK_VALUES = [8, 16, 24, 32];

function blockLessonRange(block) {
  return { from: block - BLOCK_SIZE + 1, to: block };
}

function lessonNumbersOfJournal(journal) {
  const out = [];
  for (const a of journal?.activities || []) {
    const n = parseLessonNum(a?.data?.content || a?.data?.title || "");
    if (n) out.push(n);
  }
  return out;
}

function listBooks(studentId) {
  const db = reportDb();
  const rows = db
    .prepare(
      `SELECT rs.book_id, rs.session_id, rs.course_id, rs.course_name, rs.max_lesson, rs.block,
              rs.report_exists, rs.report_id, rs.report_name, rs.updated_at
       FROM report_scan rs
       LEFT JOIN report_done rd ON rd.student_id = rs.student_id AND rd.book_id = rs.book_id
       WHERE rs.student_id = ? AND rd.book_id IS NULL
       ORDER BY rs.course_name, rs.book_id`
    )
    .all(studentId);
  return rows.map((r) => ({ ...r, due_blocks: blockLabels(r.block) }));
}

async function fetchReportsWithJournals(sid, lsid, bid, headers) {
  const { data: rl } = await fetchJson(`/api/tms/student/${sid}/learning-session/${lsid}/book/${bid}/report`, headers);
  const list = Array.isArray(rl?.data) ? rl.data : [];
  const out = [];
  for (const r of list) {
    const journalIds = [];
    try {
      const { data: det } = await fetchJson(`/api/tms/student/${sid}/learning-session/${lsid}/book/${bid}/report/${r.id}`, headers);
      const js = Array.isArray(det?.data?.learning_session_book_meeting_journals) ? det.data.learning_session_book_meeting_journals : [];
      for (const j of js) if (j?.id != null) journalIds.push(j.id);
    } catch {}
    out.push({ id: r.id, name: r.name || "", journalIds });
  }
  return out;
}

async function previewBlock(api, studentId, bookId, block) {
  if (!BLOCK_VALUES.includes(block)) return { ok: false, error: "Blok harus 8, 16, 24, atau 32" };
  const valid = await api.validateSession();
  if (!valid) return { ok: false, error: "Sesi CMS berakhir — masuk ulang" };
  const headers = await api.getApiHeaders();
  if (!headers) return { ok: false, error: "Token tidak ditemukan" };

  const db = reportDb();
  const row = db
    .prepare("SELECT rs.student_id, rs.session_id, rs.book_id, rs.course_id, rs.course_name, s.name AS student_name FROM report_scan rs JOIN students s ON s.id = rs.student_id WHERE rs.student_id = ? AND rs.book_id = ?")
    .get(studentId, bookId);
  if (!row) return { ok: false, error: "Book tidak ditemukan di hasil scan — pindai ulang dulu" };
  if (isDone(studentId, bookId)) return { ok: false, error: "Course ini sudah ditandai selesai — batalkan di bagian 'Ditandai selesai' dulu" };

  const range = blockLessonRange(block);
  const { data: jl } = await fetchJson(`/api/cms/student/${studentId}/learning-session/${row.session_id}/book/${bookId}/meeting-history/journal`, headers);
  const journals = (Array.isArray(jl?.data) ? jl.data : []).map((j) => ({
    id: j.id,
    name: j.name || "Meeting ?",
    lessons: lessonNumbersOfJournal(j),
  }));
  const inRange = journals.filter((j) => j.lessons.some((n) => n >= range.from && n <= range.to));
  inRange.sort((a, b) => (a.lessons[0] || 0) - (b.lessons[0] || 0));

  let covered = { covered: false, reportName: null, lessons: [] };
  try {
    const reports = await fetchReportsWithJournals(studentId, row.session_id, bookId, headers);
    for (const rep of reports) {
      const set = new Set();
      for (const j of journals) if (rep.journalIds.includes(j.id)) for (const n of j.lessons) set.add(n);
      const overlap = [...set].filter((n) => n >= range.from && n <= range.to);
      if (overlap.length) {
        covered = { covered: true, reportName: rep.name, lessons: overlap.sort((a, b) => a - b) };
        break;
      }
    }
  } catch {}

  const criteria = await fetchCourseCriteria(row.course_id, headers);

  let missing = [];
  let fillable = false;
  try {
    const a = await journalService.analyzeBlockJournals(api, {
      student_id: studentId,
      session_id: row.session_id,
      book_id: bookId,
      block,
      student_name: row.student_name,
    });
    if (a.ok) {
      fillable = a.fillable;
      missing = a.missing.map((m) => m.name);
    }
  } catch {}

  return {
    ok: true,
    block,
    lessons: [range.from, range.to],
    journals: inRange.map((j) => ({ id: j.id, name: j.name, lessons: j.lessons })),
    journalIds: inRange.map((j) => j.id),
    covered,
    criteria: criteria.map((c) => ({ ...c, note_template: templateForBlock(c, block, row.student_name) })),
    missing_journals: missing,
    fillable,
    student_name: row.student_name,
    course_name: row.course_name,
  };
}

async function createBlockReport(api, studentId, bookId, block, criteriaInput) {
  if (!BLOCK_VALUES.includes(block)) return { ok: false, status: "failed", message: "Blok harus 8, 16, 24, atau 32" };
  const valid = await api.validateSession();
  if (!valid) return { ok: false, status: "failed", message: "Sesi CMS berakhir — masuk ulang" };
  const headers = await api.getApiHeaders();
  if (!headers) return { ok: false, status: "failed", message: "Token tidak ditemukan" };

  const db = reportDb();
  const row = db
    .prepare("SELECT rs.student_id, rs.session_id, rs.book_id, rs.course_id, rs.course_name, s.name AS student_name FROM report_scan rs JOIN students s ON s.id = rs.student_id WHERE rs.student_id = ? AND rs.book_id = ?")
    .get(studentId, bookId);
  if (!row) return { ok: false, status: "failed", message: "Book tidak ditemukan di hasil scan — pindai ulang dulu" };
  if (isDone(studentId, bookId)) return { ok: false, status: "failed", message: "Course ini sudah ditandai selesai — batalkan di bagian 'Ditandai selesai' dulu" };

  const sid = row.student_id;
  const lsid = row.session_id;
  const bid = row.book_id;
  const courseName = row.course_name || "";

  const logRow = (status, message, extra) => {
    db.prepare(`INSERT INTO report_log (student_id, session_id, book_id, course_name, report_id, report_name, status, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(student_id, session_id, book_id) DO UPDATE SET
        report_id = excluded.report_id, report_name = excluded.report_name,
        status = excluded.status, message = excluded.message, created_at = excluded.created_at`)
      .run(sid, lsid, bid, courseName, extra?.report_id ?? null, extra?.report_name ?? null, status, message);
  };

  try {
    const range = blockLessonRange(block);
    const { data: jl } = await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/meeting-history/journal`, headers);
    const journals = (Array.isArray(jl?.data) ? jl.data : []).map((j) => ({
      id: j.id,
      name: j.name || "Meeting ?",
      lessons: lessonNumbersOfJournal(j),
    }));
    const inRange = journals.filter((j) => j.lessons.some((n) => n >= range.from && n <= range.to));
    let journalIds = inRange.map((j) => j.id);
    if (!journalIds.length) {
      let auto = null;
      try {
        auto = await journalService.ensureJournalsForBlock(api, {
          student_id: sid,
          session_id: lsid,
          book_id: bid,
          block,
          student_name: row.student_name,
        });
      } catch {}
      if (!auto || !auto.ok) {
        const msg = `Tidak ada jurnal untuk Lesson ${range.from}-${range.to} (isi lewat fitur Jurnal Meeting dulu)`;
        logRow("failed", msg);
        return { ok: false, status: "failed", message: msg };
      }
      if (auto.failed && auto.failed.length) {
        const msg = `Gagal mengisi jurnal otomatis: ${auto.failed.map((f) => f.meeting_name + " (" + f.error + ")").join("; ")}`;
        logRow("failed", msg);
        return { ok: false, status: "failed", message: msg };
      }
      const re = await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/meeting-history/journal`, headers);
      const fresh = (Array.isArray(re?.data) ? re.data : []).map((j) => ({
        id: j.id,
        name: j.name || "Meeting ?",
        lessons: lessonNumbersOfJournal(j),
      }));
      const inRange2 = fresh.filter((j) => j.lessons.some((n) => n >= range.from && n <= range.to));
      if (!inRange2.length) {
        const msg = `Jurnal otomatis selesai tapi Lesson ${range.from}-${range.to} belum tercatat — periksa di fitur Jurnal Meeting`;
        logRow("failed", msg);
        return { ok: false, status: "failed", message: msg };
      }
      journals.length = 0;
      journals.push(...fresh);
      inRange.length = 0;
      inRange.push(...inRange2);
      journalIds = inRange.map((j) => j.id);
    }

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
      await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/summary`, headers, "POST", {
        learning_session_book_meeting_journal_ids: journalIds,
      });
    } catch {}

    const body = { learning_session_book_meeting_journal_ids: journalIds, criterias };
    let resp = await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/report`, headers, "POST", body);
    if (resp.status >= 400 && JSON.stringify(resp.data || "").match(/criteria|note|score/i)) {
      resp = await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/report`, headers, "POST", {
        ...body,
        criterias: criterias.map(({ id, score }) => ({ id, score })),
      });
    }

    if (resp.status >= 200 && resp.status < 300) {
      let created = resp.data?.data || resp.data || {};
      let reportId = created.id ?? null;
      let reportName = created.name ?? null;
      let reportStatus = created.status ?? null;
      if (reportId == null) {
        try {
          const { data: rl } = await fetchJson(`/api/tms/student/${sid}/learning-session/${lsid}/book/${bid}/report`, headers);
          const newest = (Array.isArray(rl?.data) ? rl.data : []).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0];
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
          db.prepare(`UPDATE report_scan SET block_status = ?, block_info = ?, updated_at = datetime('now')
            WHERE student_id = ? AND session_id = ? AND book_id = ?`)
            .run(JSON.stringify(st), JSON.stringify(info), sid, lsid, bid);
        }
      } catch {}
      return { ok: true, status: "ok", message: msg, report_id: reportId, report_name: reportName };
    }
    const msg = (resp.data?.message) || (resp.data?.error) || `HTTP ${resp.status}`;
    logRow("failed", msg);
    return { ok: false, status: "failed", message: msg };
  } catch (e) {
    const msg = String(e.message || e);
    logRow("failed", msg);
    return { ok: false, status: "failed", message: msg };
  }
}

/* ================= create per student ================= */

function getRunStatus() {
  if (!runRun) return { running: false, startedAt: null, finishedAt: null, current: 0, total: 0, studentName: null, results: [], failed: [] };
  return { ...runRun };
}

async function fetchCourseCriteria(courseId, headers) {
  if (!courseId) return [];
  try {
    const { data } = await fetchJson(`/api/cms/course/${courseId}/report-criteria`, headers);
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map((c) => {
      const tpl = (Array.isArray(c.templates) ? c.templates : []).find((t) => t?.lang === "id") || (Array.isArray(c.templates) ? c.templates[0] : null);
      return { id: c.id, name: c.name, template: tpl?.content || "" };
    });
  } catch {
    return [];
  }
}

function templateForBlock(criterion, block, studentName) {
  const content = criterion?.template || "";
  if (!content) return "";
  const blocks = [];
  const re = /Report\s*(\d+)\s*\n?([\s\S]*?)(?=(?:^|\n)\s*Report\s+\d+\s*\n|$)/gim;
  let m;
  while ((m = re.exec(content)) !== null) blocks.push({ n: Number(m[1]), text: m[2].trim() });
  const want = block / BLOCK_SIZE;
  const hit = blocks.find((b) => b.n === want);
  const text = (hit ? hit.text : "").trim();
  if (!text) return "";
  return text
    .replace(/\((?:nama_siswa|student_name)\)/gi, studentName || "siswa")
    .trim();
}

async function createBookReport(student, session, book, headers, db) {
  const { id: sid, name: studentName } = student;
  const { id: lsid } = session;
  const bid = book.id;
  const course = book?.book?.course || {};
  const courseName = course.name || session.name || "";

  const key = [sid, lsid, bid];

  const logRow = (status, message, extra) => {
    db.prepare(`INSERT INTO report_log (student_id, session_id, book_id, course_name, report_id, report_name, status, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(student_id, session_id, book_id) DO UPDATE SET
        report_id = excluded.report_id, report_name = excluded.report_name,
        status = excluded.status, message = excluded.message, created_at = excluded.created_at`)
      .run(sid, lsid, bid, courseName, extra?.report_id ?? null, extra?.report_name ?? null, status, message);
  };

  try {
    const { data: rl } = await fetchJson(`/api/tms/student/${sid}/learning-session/${lsid}/book/${bid}/report`, headers);
    const list = Array.isArray(rl?.data) ? rl.data : [];
    if (list.length) {
      const msg = `Sudah ada (${list[0].name || "report"} #${list[0].id})`;
      logRow("skipped", msg, { report_id: list[0].id, report_name: list[0].name });
      return { ok: false, status: "skipped", message: msg };
    }

    const { data: jl } = await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/meeting-history/journal`, headers);
    const journals = Array.isArray(jl?.data) ? jl.data : [];
    const journalIds = journals.map((j) => j.id).filter((x) => x != null);
    if (!journalIds.length) {
      const msg = "Tidak ada jurnal meeting untuk book ini (isi lewat fitur Jurnal Meeting dulu)";
      logRow("failed", msg);
      return { ok: false, status: "failed", message: msg };
    }

    const criterias = (await fetchCourseCriteria(course.id, headers)).map((c) => ({ id: c.id, score: 0, note: "" }));

    try {
      await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/summary`, headers, "POST", {
        learning_session_book_meeting_journal_ids: journalIds,
      });
    } catch {}

    const body = { learning_session_book_meeting_journal_ids: journalIds, criterias };
    let resp = await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/report`, headers, "POST", body);
    if (resp.status >= 400 && criterias.length && JSON.stringify(resp.data || "").match(/criteria|note|score/i)) {
      resp = await fetchJson(`/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/report`, headers, "POST", {
        ...body,
        criterias: criterias.map(({ id }) => ({ id, score: 0 })),
      });
    }

    if (resp.status >= 200 && resp.status < 300) {
      const created = resp.data?.data || resp.data || {};
      const msg = `Terkirim (#${created.id || "?"})${created.name ? ` — ${created.name}` : ""}`;
      logRow("ok", msg, { report_id: created.id, report_name: created.name });
      return { ok: true, status: "ok", message: msg, report_id: created.id, report_name: created.name };
    }
    const msg = (resp.data?.message) || (resp.data?.error) || `HTTP ${resp.status}`;
    logRow("failed", msg);
    return { ok: false, status: "failed", message: msg };
  } catch (e) {
    const msg = String(e.message || e);
    logRow("failed", msg);
    return { ok: false, status: "failed", message: msg };
  }
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

      const db = reportDb();
      const placeholders = studentIds.map(() => "?").join(",");
      const students = db.prepare(`SELECT id, name FROM students WHERE id IN (${placeholders}) ORDER BY lower(name)`).all(...studentIds);
      runRun.total = students.length;
      if (!students.length) throw new Error("NO_STUDENTS");

      for (const st of students) {
        runRun.current++;
        runRun.studentName = st.name;
        try {
          const { data } = await fetchJson(`/api/tms/student/${st.id}/learning-session?search=`, headers);
          const sessions = Array.isArray(data?.data) ? data.data : [];
          for (const session of sessions) {
            const { data: booksData } = await fetchJson(`/api/tms/student/${st.id}/learning-session/${session.id}/book`, headers);
            const books = Array.isArray(booksData?.data) ? booksData.data : [];
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

module.exports = { runScan, getScanStatus, listDue, runReportForStudents, getRunStatus, reportDb, listBooks, previewBlock, createBlockReport, listDone, markDone, unmarkDone };