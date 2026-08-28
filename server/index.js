const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const sessionApi = require("./services/session");
const { getDb, syncStudents } = require("./services/sync");
const recapService = require("./services/recap");
const journalService = require("./services/journal");
const reportService = require("./services/report");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const app = express();
app.use(express.json());

function lanUrls() {
  const addrs = [];
  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    for (const i of infos || []) {
      if (i.family === "IPv4" && !i.internal) addrs.push(i.address);
    }
  }
  return addrs;
}

app.get("/api/status", async (_req, res) => {
  const s = sessionApi.readState();
  const sessionValid = await sessionApi.validateSession();
  res.json({ ...s, sessionValid });
});

app.post("/api/login-api", async (req, res) => {
  const username = String(req.body?.username ?? req.body?.email ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!username || !password) {
    return res.status(400).json({ error: "Email dan password wajib diisi" });
  }
  try {
    const r = await sessionApi.loginViaApi(username, password);
    if (!r.ok) return res.status(401).json({ error: r.message || "Login gagal" });
    res.json({ ok: true, loggedIn: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/refresh-login", async (_req, res) => {
  try {
    const loggedIn = await sessionApi.validateSession();
    res.json({ loggedIn });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/logout", (_req, res) => {
  try {
    res.json(sessionApi.logout());
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/sync", async (_req, res) => {
  try {
    const result = await syncStudents(sessionApi);
    if (result.loggedIn) {
      sessionApi.writeState({ lastSyncAt: new Date().toISOString(), studentCount: result.students });
    }
    res.json(result);
  } catch (e) {
    console.error("[sync error]", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/students", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const db = getDb();
  const rows = q
    ? db
        .prepare("SELECT id, name, info, raw, updated_at FROM students WHERE lower(name) LIKE ? ORDER BY lower(name) LIMIT 2000")
        .all(`%${q}%`)
    : db.prepare("SELECT id, name, info, raw, updated_at FROM students ORDER BY lower(name) LIMIT 2000").all();
  const students = rows.map((r) => {
    let data = {};
    if (r.raw) {
      try {
        data = flatten(JSON.parse(r.raw));
      } catch {}
    }
    return { id: r.id, name: r.name, info: r.info || "", synced_at: r.updated_at, data };
  });
  res.json({ students, total: db.prepare("SELECT COUNT(*) AS c FROM students").get().c });
});

function flatten(obj, prefix, out) {
  out = out || {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else if (Array.isArray(v)) out[key] = JSON.stringify(v);
    else out[key] = v;
  }
  return out;
}

app.post("/api/recap", async (req, res) => {
  try {
    const force = Boolean(req.body?.force);
    const r = await recapService.runRecap(sessionApi, { force });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/recap-status", (_req, res) => {
  res.json(recapService.getStatus());
});

app.get("/api/recaps", (_req, res) => {
  res.json({ recaps: recapService.listRecaps() });
});

app.post("/api/journal/plan", async (req, res) => {
  try {
    const studentId = req.body?.student_id ? Number(req.body.student_id) : undefined;
    const r = await journalService.buildPlan(sessionApi, { studentId });
    res.json(r);
  } catch (e) {
    res.status(e.message === "NOT_LOGGED_IN" ? 401 : 500).json({ error: String(e.message || e) });
  }
});

app.post("/api/journal/fill", (req, res) => {
  try {
    const r = journalService.runFill(sessionApi, req.body?.entries || []);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/journal/status", (_req, res) => {
  res.json(journalService.getFillStatus());
});

app.get("/api/report/scan", (_req, res) => {
  try {
    res.json(reportService.runScan(sessionApi));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/report/scan-status", (_req, res) => {
  res.json(reportService.getScanStatus());
});

app.get("/api/report/due", (_req, res) => {
  try {
    res.json({ due: reportService.listDue() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/report/run", (req, res) => {
  try {
    const ids = [Number(req.body?.student_id)]
      .filter((x) => Number.isFinite(x) && x > 0);
    if (!ids.length) return res.status(400).json({ error: "student_id wajib diisi" });
    res.json(reportService.runReportForStudents(sessionApi, ids));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/report/run-status", (_req, res) => {
  res.json(reportService.getRunStatus());
});

app.get("/api/report/books", (req, res) => {
  try {
    const studentId = Number(req.query.student_id);
    if (!Number.isFinite(studentId) || studentId <= 0) return res.status(400).json({ error: "student_id wajib diisi" });
    res.json({ books: reportService.listBooks(studentId) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/report/preview", async (req, res) => {
  try {
    const studentId = Number(req.query.student_id);
    const bookId = Number(req.query.book_id);
    const block = Number(req.query.block);
    if (!Number.isFinite(studentId) || !Number.isFinite(bookId) || !Number.isFinite(block)) {
      return res.status(400).json({ error: "student_id, book_id, dan block wajib diisi" });
    }
    const r = await reportService.previewBlock(sessionApi, studentId, bookId, block);
    res.status(r.ok ? 200 : 400).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/report/create", async (req, res) => {
  try {
    const studentId = Number(req.body?.student_id);
    const bookId = Number(req.body?.book_id);
    const block = Number(req.body?.block);
    const criteria = req.body?.criteria;
    if (!Number.isFinite(studentId) || !Number.isFinite(bookId) || !Number.isFinite(block)) {
      return res.status(400).json({ error: "student_id, book_id, dan block wajib diisi" });
    }
    const r = await reportService.createBlockReport(sessionApi, studentId, bookId, block, criteria);
    res.status(r.ok ? 200 : 400).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/report/done", (_req, res) => {
  try {
    res.json({ done: reportService.listDone() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/report/done", (req, res) => {
  try {
    const studentId = Number(req.body?.student_id);
    const bookId = Number(req.body?.book_id);
    if (!Number.isFinite(studentId) || !Number.isFinite(bookId) || studentId <= 0 || bookId <= 0) {
      return res.status(400).json({ error: "student_id dan book_id wajib diisi" });
    }
    const r = reportService.markDone(studentId, bookId);
    res.status(r.ok ? 200 : 400).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/api/report/done", (req, res) => {
  try {
    const studentId = Number(req.body?.student_id);
    const bookId = Number(req.body?.book_id);
    if (!Number.isFinite(studentId) || !Number.isFinite(bookId) || studentId <= 0 || bookId <= 0) {
      return res.status(400).json({ error: "student_id dan book_id wajib diisi" });
    }
    res.json(reportService.unmarkDone(studentId, bookId));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/report/logs", (_req, res) => {
  try {
    const db = reportService.reportDb();
    const rows = db
      .prepare(
        `SELECT rl.student_id, s.name AS student_name, rl.session_id, rl.book_id, rl.course_name,
                rl.report_id, rl.report_name, rl.status, rl.message, rl.created_at
         FROM report_log rl JOIN students s ON s.id = rl.student_id
         ORDER BY rl.created_at DESC LIMIT 500`
      )
      .all();
    res.json({ logs: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const dist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, HOST, () => {
  console.log(`RecapApp aktif di http://localhost:${PORT}`);
  for (const ip of lanUrls()) console.log(`  HP (Wi-Fi sama): http://${ip}:${PORT}`);
  console.log(`Profil sesi: server/data/profile · DB: server/data/recap.db`);
});