const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", "data");
const API_ORIGIN = "https://cms.timedooracademy.com";
const API_BASE = `${API_ORIGIN}/api`;

function getDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "recap.db"));
  db.exec(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    info TEXT,
    raw TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  return db;
}

function dedupe(students) {
  const seen = new Set();
  return students.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

async function fetchJson(url, headers, ttl = 20000) {
  const r = await fetch(API_ORIGIN + url, {
    headers: {
      authorization: "Bearer " + headers.token,
      "x-app-branch": headers.branch,
      "x-app-timezone": headers.timezone,
    },
    signal: AbortSignal.timeout(ttl),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

async function fetchStudentPages(headers) {
  const limit = 100;
  let p = 1;
  let meta = null;
  const pages = [];
  for (;;) {
    const json = await fetchJson(`/api/tms/student?search=&limit=${limit}&page=${p}`, headers);
    if (!Array.isArray(json.data) || !json.meta || !json.meta.last_page) throw new Error("BAD_RESPONSE");
    meta = json.meta;
    pages.push(json.data);
    if (p >= json.meta.last_page) break;
    p++;
    if (p > 200) break;
  }
  return { pages, meta };
}

async function syncStudents(api) {
  const valid = await api.validateSession();
  if (!valid) {
    api.writeState({ lastCheckAt: Date.now() });
    return { loggedIn: false, error: "NOT_LOGGED_IN" };
  }
  const headers = api.getApiHeaders();
  if (!headers) throw new Error("NO_TOKEN");

  let students = [];
  let pages = 0;
  const { pages: pagesArr, meta } = await fetchStudentPages(headers);
  pages = meta.last_page;
  for (const arr of pagesArr) {
    for (const o of arr) {
      if (!o || typeof o.id === "undefined") continue;
      const id = Number(o.id);
      if (!students.some((s) => s.id === id)) {
        students.push({
          id,
          name: String(o.name ?? `Siswa #${id}`).slice(0, 200),
          info: o.code != null || o.total_sessions != null
            ? `${o.code ?? ""} ${o.total_sessions != null ? "· " + o.total_sessions + " sesi" : ""}`.trim()
            : "",
          raw: o,
        });
      }
    }
  }

  students = dedupe(students);
  const db = getDb();
  const upsert = db.prepare(`INSERT INTO students (id, name, info, raw, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, info = excluded.info, raw = excluded.raw, updated_at = excluded.updated_at`);
  let inserted = 0;
  for (const s of students) {
    const prev = db.prepare("SELECT id FROM students WHERE id = ?").get(s.id);
    if (!prev) inserted++;
    const raw = s.raw ? JSON.stringify(s.raw) : null;
    upsert.run(s.id, s.name, s.info, raw);
  }
  const count = db.prepare("SELECT COUNT(*) AS c FROM students").get().c;

  return { loggedIn: true, students: count, inserted, pages, method: "api" };
}

module.exports = { getDb, syncStudents, BASE_URL: API_BASE };
