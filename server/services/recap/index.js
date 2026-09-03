const { getDb } = require("../../db");
const { scoreSummary } = require("./recap-fetch.service");
const { getStatus, runRecap } = require("./recap-runner.service");
const { listRecaps } = require("./recap-query.service");

module.exports = {
  runRecap,
  getStatus,
  listRecaps,
  getRecapDb: getDb,
  scoreSummary,
};
