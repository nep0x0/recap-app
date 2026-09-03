const { getDb } = require("../../db");
const { getScanStatus, runScan } = require("./report-scan.service");
const {
  listDue,
  listDone,
  markDone,
  unmarkDone,
  isDone,
  listBooks,
} = require("./report-due.service");
const { previewBlock } = require("./report-preview.service");
const { createBlockReport } = require("./report-create.service");
const { getRunStatus, runReportForStudents } = require("./report-batch.service");

module.exports = {
  runScan,
  getScanStatus,
  listDue,
  runReportForStudents,
  getRunStatus,
  reportDb: getDb,
  listBooks,
  previewBlock,
  createBlockReport,
  listDone,
  markDone,
  unmarkDone,
  isDone,
};
