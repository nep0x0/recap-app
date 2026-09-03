const sessionService = require("../services/session");
const recapService = require("../services/recap");

async function startRecap(req, res) {
  try {
    const force = Boolean(req.body?.force);
    const r = await recapService.runRecap(sessionService, { force });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

function getRecapStatus(_req, res) {
  try {
    res.json(recapService.getStatus());
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

function listRecaps(_req, res) {
  try {
    res.json({ recaps: recapService.listRecaps() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

module.exports = {
  startRecap,
  getRecapStatus,
  listRecaps,
};
