const express = require("express");
const journalController = require("../controllers/journal.controller");

const router = express.Router();

router.post("/journal/plan", journalController.planJournal);
router.get("/journal/plan-status", journalController.getPlanStatus);
router.post("/journal/fill", journalController.fillJournal);
router.get("/journal/status", journalController.getFillStatus);

module.exports = router;
