const sessionService = require("../services/session");
const reportService = require("../services/report");
const doneController = require("./report-done.controller");

const handleError = (res, e) => res.status(500).json({ error: String(e.message || e) });

function runScan(_req, res) {
  try {
    res.json(reportService.runScan(sessionService));
  } catch (e) {
    handleError(res, e);
  }
}

function getScanStatus(_req, res) {
  try {
    res.json(reportService.getScanStatus());
  } catch (e) {
    handleError(res, e);
  }
}

function listDue(_req, res) {
  try {
    res.json({ due: reportService.listDue() });
  } catch (e) {
    handleError(res, e);
  }
}

function runReport(req, res) {
  try {
    const ids = [Number(req.body?.student_id)].filter((x) => Number.isFinite(x) && x > 0);
    if (!ids.length) return res.status(400).json({ error: "student_id wajib diisi" });
    res.json(reportService.runReportForStudents(sessionService, ids));
  } catch (e) {
    handleError(res, e);
  }
}

function getRunStatus(_req, res) {
  try {
    res.json(reportService.getRunStatus());
  } catch (e) {
    handleError(res, e);
  }
}

function listBooks(req, res) {
  try {
    const studentId = Number(req.query.student_id);
    if (!Number.isFinite(studentId) || studentId <= 0) {
      return res.status(400).json({ error: "student_id wajib diisi" });
    }
    res.json({ books: reportService.listBooks(studentId) });
  } catch (e) {
    handleError(res, e);
  }
}

async function previewReport(req, res) {
  try {
    const studentId = Number(req.query.student_id);
    const bookId = Number(req.query.book_id);
    const block = Number(req.query.block);
    if (!Number.isFinite(studentId) || !Number.isFinite(bookId) || !Number.isFinite(block)) {
      return res.status(400).json({ error: "student_id, book_id, dan block wajib diisi" });
    }
    const r = await reportService.previewBlock(sessionService, studentId, bookId, block);
    res.status(r.ok ? 200 : 400).json(r);
  } catch (e) {
    handleError(res, e);
  }
}

async function createReport(req, res) {
  try {
    const studentId = Number(req.body?.student_id);
    const bookId = Number(req.body?.book_id);
    const block = Number(req.body?.block);
    const criteria = req.body?.criteria;
    if (!Number.isFinite(studentId) || !Number.isFinite(bookId) || !Number.isFinite(block)) {
      return res.status(400).json({ error: "student_id, book_id, dan block wajib diisi" });
    }
    const r = await reportService.createBlockReport(sessionService, studentId, bookId, block, criteria);
    res.status(r.ok ? 200 : 400).json(r);
  } catch (e) {
    handleError(res, e);
  }
}

module.exports = {
  runScan,
  getScanStatus,
  listDue,
  runReport,
  getRunStatus,
  listBooks,
  previewReport,
  createReport,
  listDone: doneController.listDone,
  markDone: doneController.markDone,
  unmarkDone: doneController.unmarkDone,
  getLogs: doneController.getLogs,
};
