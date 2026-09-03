const sessionService = require("../services/session");
const { syncStudents } = require("../services/sync");
const { getDb } = require("../db");
const { flatten } = require("../lib/utils");

async function sync(_req, res) {
  try {
    const result = await syncStudents(sessionService);
    if (result.loggedIn) {
      sessionService.writeState({
        lastSyncAt: new Date().toISOString(),
        studentCount: result.students,
      });
    }
    res.json(result);
  } catch (e) {
    console.error("[sync error]", e);
    res.status(500).json({ error: String(e.message || e) });
  }
}

function getStudents(req, res) {
  try {
    const q = String(req.query.q || "").trim().toLowerCase();
    const db = getDb();
    const rows = q
      ? db
          .prepare(
            "SELECT id, name, info, raw, updated_at FROM students WHERE lower(name) LIKE ? ORDER BY lower(name) LIMIT 2000"
          )
          .all(`%${q}%`)
      : db
          .prepare("SELECT id, name, info, raw, updated_at FROM students ORDER BY lower(name) LIMIT 2000")
          .all();

    const students = rows.map((r) => {
      let data = {};
      if (r.raw) {
        try {
          data = flatten(JSON.parse(r.raw));
        } catch {}
      }
      return { id: r.id, name: r.name, info: r.info || "", synced_at: r.updated_at, data };
    });

    const total = db.prepare("SELECT COUNT(*) AS c FROM students").get().c;
    res.json({ students, total });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

module.exports = {
  sync,
  getStudents,
};
