const express = require("express");
const reportController = require("../controllers/report.controller");

const router = express.Router();

// POST (bukan GET): scan memulai job berat dengan efek samping — GET mudah
// dipicu lintas-origin (CSRF via <img>/prefetch) karena simple request.
router.post("/report/scan", reportController.runScan);
router.get("/report/scan-status", reportController.getScanStatus);
router.get("/report/due", reportController.listDue);
router.post("/report/run", reportController.runReport);
router.get("/report/run-status", reportController.getRunStatus);
router.get("/report/books", reportController.listBooks);
router.get("/report/preview", reportController.previewReport);
router.post("/report/create", reportController.createReport);
router.get("/report/done", reportController.listDone);
router.post("/report/done", reportController.markDone);
router.delete("/report/done", reportController.unmarkDone);
router.get("/report/logs", reportController.getLogs);

module.exports = router;
