const express = require("express");
const authRoutes = require("./auth.routes");
const studentsRoutes = require("./students.routes");
const recapRoutes = require("./recap.routes");
const journalRoutes = require("./journal.routes");
const reportRoutes = require("./report.routes");

const router = express.Router();

router.use(authRoutes);
router.use(studentsRoutes);
router.use(recapRoutes);
router.use(journalRoutes);
router.use(reportRoutes);

module.exports = router;
