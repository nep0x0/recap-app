const sessionService = require("../services/session");

async function getStatus(_req, res) {
  try {
    const state = sessionService.readState();
    const sessionValid = await sessionService.validateSession();
    res.json({ ...state, sessionValid });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}

async function loginApi(req, res) {
  const username = String(req.body?.username ?? req.body?.email ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!username || !password) {
    return res.status(400).json({ error: "Email dan password wajib diisi" });
  }
  try {
    const result = await sessionService.loginViaApi(username, password);
    if (!result.ok) {
      return res.status(401).json({ error: result.message || "Login gagal" });
    }
    res.json({ ok: true, loggedIn: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

async function refreshLogin(_req, res) {
  try {
    const loggedIn = await sessionService.validateSession();
    res.json({ loggedIn });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

function logout(_req, res) {
  try {
    res.json(sessionService.logout());
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

module.exports = {
  getStatus,
  loginApi,
  refreshLogin,
  logout,
};
