const reportService = require("../services/report");
const { getDb } = require("../db");

const handleError = (res, e) => res.status(500).json({ error: String(e.message || e) });

function listDone(_req, res) {
  try {
    res.json({ done: reportService.listDone() });
  } catch (e) {
    handleError(res, e);
  }
}

function markDone(req, res) {
  try {
    const studentId = Number(req.body?.student_id);
    const bookId = Number(req.body?.book_id);
    if (!Number.isFinite(studentId) || !Number.isFinite(bookId) || studentId <= 0 || bookId <= 0) {
      return res.status(400).json({ error: "student_id dan book_id wajib diisi" });
    }
    const r = reportService.markDone(studentId, bookId);
    res.status(r.ok ? 200 : 400).json(r);
  } catch (e) {
    handleError(res, e);
  }
}

function unmarkDone(req, res) {
  try {
    const studentId = Number(req.body?.student_id);
    const bookId = Number(req.body?.book_id);
    if (!Number.isFinite(studentId) || !Number.isFinite(bookId) || studentId <= 0 || bookId <= 0) {
      return res.status(400).json({ error: "student_id dan book_id wajib diisi" });
    }
    res.json(reportService.unmarkDone(studentId, bookId));
  } catch (e) {
    handleError(res, e);
  }
}

function getLogs(_req, res) {
  try {
    const rows = getDb()
      .prepare(
        `SELECT rl.student_id, s.name AS student_name, rl.session_id, rl.book_id, rl.course_name,
                rl.report_id, rl.report_name, rl.status, rl.message, rl.created_at
         FROM report_log rl JOIN students s ON s.id = rl.student_id
         ORDER BY rl.created_at DESC LIMIT 500`
      )
      .all();
    res.json({ logs: rows });
  } catch (e) {
    handleError(res, e);
  }
}

module.exports = {
  listDone,
  markDone,
  unmarkDone,
  getLogs,
};
