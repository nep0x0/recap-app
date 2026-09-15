const sessionService = require("../services/session");
const journalService = require("../services/journal");

async function planJournal(req, res) {
  try {
    const studentId = req.body?.student_id ? Number(req.body.student_id) : undefined;
    const r = journalService.runPlan(sessionService, { studentId });
    res.json(r);
  } catch (e) {
    res.status(e.message === "NOT_LOGGED_IN" ? 401 : 500).json({ error: String(e.message || e) });
  }
}

function getPlanStatus(_req, res) {
  try {
    res.json(journalService.getPlanStatus());
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

function fillJournal(req, res) {
  try {
    const r = journalService.runFill(sessionService, req.body?.entries || []);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

function getFillStatus(_req, res) {
  try {
    res.json(journalService.getFillStatus());
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

module.exports = {
  planJournal,
  getPlanStatus,
  fillJournal,
  getFillStatus,
};
