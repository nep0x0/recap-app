const { API_BASE } = require("../config");
const { getDb } = require("../db");
const { fetchJson } = require("../lib/cms-client");
const { dedupe } = require("../lib/utils");

async function fetchStudentPages(headers) {
  const limit = 100;
  let p = 1;
  let meta = null;
  const pages = [];
  for (;;) {
    const json = await fetchJson(`/api/tms/student?search=&limit=${limit}&page=${p}`, headers, { ttl: 20000 });
    if (!Array.isArray(json.data) || !json.meta || !json.meta.last_page) {
      throw new Error("BAD_RESPONSE");
    }
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
          info:
            o.code != null || o.total_sessions != null
              ? `${o.code ?? ""} ${o.total_sessions != null ? "· " + o.total_sessions + " sesi" : ""}`.trim()
              : "",
          raw: o,
        });
      }
    }
  }

  students = dedupe(students);
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO students (id, name, info, raw, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, info = excluded.info, raw = excluded.raw, updated_at = excluded.updated_at
  `);
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

module.exports = {
  getDb,
  syncStudents,
  BASE_URL: API_BASE,
};
