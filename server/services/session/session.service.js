const { API_BASE, DEFAULT_HEADERS } = require("../../config");
const { extractToken, writeTokens, clearTokens } = require("./token.storage");
const { readState, writeState } = require("./state.storage");

let validateOk = null;
let validateAt = 0;

async function apiCall(access, ttl = 12000) {
  try {
    const r = await fetch(`${API_BASE}/tms/student?limit=1`, {
      headers: { Authorization: `Bearer ${access}`, ...DEFAULT_HEADERS },
      signal: AbortSignal.timeout(ttl),
    });
    if (r.status === 200) return "ok";
    if (r.status === 401 || r.status === 403) return "unauth";
    return "err";
  } catch {
    return "err";
  }
}

async function refreshTokens(refresh) {
  try {
    const r = await fetch(`${API_BASE}/auth/refresh-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...DEFAULT_HEADERS },
      body: JSON.stringify({ refresh_token: refresh }),
      signal: AbortSignal.timeout(12000),
    });
    if (r.status !== 200) return null;
    const b = await r.json();
    const data = b?.data ?? b;
    const access = data?.access_token ?? data?.accessToken ?? null;
    if (!access) return null;
    return { access, refresh: data?.refresh_token ?? data?.refreshToken ?? refresh };
  } catch {
    return null;
  }
}

async function loginViaApi(username, password) {
  let r;
  try {
    r = await fetch(`${API_BASE}/tms/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...DEFAULT_HEADERS },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, message: "Tidak bisa menghubungi server CMS. Periksa internet." };
  }
  const body = await r.json().catch(() => null);
  const data = body?.data ?? body;
  const access = data?.access_token ?? data?.accessToken ?? body?.access_token ?? null;
  const refresh = data?.refresh_token ?? data?.refreshToken ?? null;
  if (r.status < 200 || r.status >= 300 || !access) {
    const m = body?.message || `Gagal (HTTP ${r.status})`;
    return { ok: false, message: /wrong|invalid|incorrect/i.test(m) ? "Email atau password salah" : m };
  }
  writeTokens(access, refresh);
  validateOk = true;
  validateAt = Date.now();
  writeState({ loggedIn: true, lastCheckAt: Date.now(), loginEmail: username });
  return { ok: true };
}

async function validateSession(ttlMs = 15000) {
  const now = Date.now();
  if (validateOk !== null && now - validateAt < ttlMs) return validateOk;
  const t = extractToken();
  if (!t || !t.access) {
    validateOk = false;
    validateAt = now;
    return false;
  }
  const status = await apiCall(t.access);
  if (status === "ok") {
    validateOk = true;
    validateAt = now;
    if (!readState().loggedIn) writeState({ loggedIn: true, lastCheckAt: Date.now() });
    return true;
  }
  if (status === "unauth" && t.refresh) {
    const nt = await refreshTokens(t.refresh);
    if (nt && (await apiCall(nt.access)) === "ok") {
      writeTokens(nt.access, nt.refresh);
      validateOk = true;
      validateAt = now;
      if (!readState().loggedIn) writeState({ loggedIn: true, lastCheckAt: Date.now() });
      return true;
    }
  }
  validateOk = false;
  validateAt = now;
  if (readState().loggedIn) writeState({ loggedIn: false, lastCheckAt: Date.now() });
  return false;
}

function getApiHeaders() {
  const t = extractToken();
  if (!t || !t.access) return null;
  return {
    token: t.access,
    branch: DEFAULT_HEADERS["x-app-branch"],
    timezone: DEFAULT_HEADERS["x-app-timezone"],
  };
}

function logout() {
  clearTokens();
  validateOk = null;
  validateAt = 0;
  writeState({ loggedIn: false, lastCheckAt: Date.now(), loginEmail: null });
  return { ok: true };
}

module.exports = {
  loginViaApi,
  validateSession,
  getApiHeaders,
  logout,
};
