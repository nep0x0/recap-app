const fs = require("fs");
const path = require("path");

const BASE_URL = "https://cms.timedooracademy.com/tms";
const API_BASE = "https://cms.timedooracademy.com/api";
const HTTP_HEADERS = { "x-app-branch": "[238]", "x-app-timezone": "Asia/Jakarta" };
const DATA_DIR = path.join(__dirname, "..", "data");
const PROFILE_DIR = path.join(DATA_DIR, "profile");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const STORAGE_FILE = path.join(PROFILE_DIR, "storage.json");

const defaultState = () => ({
  loggedIn: false,
  lastCheckAt: null,
  lastSyncAt: null,
  studentCount: 0,
  loginEmail: null,
});

function readState() {
  try {
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) };
  } catch {
    return defaultState();
  }
}

function writeState(patch) {
  const s = { ...readState(), ...patch };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  return s;
}

function extractToken() {
  try {
    const st = JSON.parse(fs.readFileSync(STORAGE_FILE, "utf8"));
    const ck = (st.cookies || []).find((c) => c.name === "access_token");
    if (ck && ck.value) return { access: ck.value, refresh: (st.cookies || []).find((c) => c.name === "refresh_token")?.value || null };
    for (const o of st.origins || []) {
      const it = (o.localStorage || []).find((x) => x.name === "access_token");
      if (it && it.value) {
        const rf = (o.localStorage || []).find((x) => x.name === "refresh_token");
        return { access: it.value, refresh: rf?.value || null };
      }
    }
  } catch {}
  return null;
}

function writeTokens(access, refresh) {
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180;
  const cookie = (name, value) => ({
    name,
    value,
    domain: "cms.timedooracademy.com",
    path: "/",
    expires,
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  });
  const ls = [{ name: "access_token", value: access }];
  const cookies = [cookie("access_token", access)];
  if (refresh) {
    ls.push({ name: "refresh_token", value: refresh });
    cookies.push(cookie("refresh_token", refresh));
  }
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  fs.writeFileSync(
    STORAGE_FILE,
    JSON.stringify({ cookies, origins: [{ origin: "https://cms.timedooracademy.com", localStorage: ls }] }, null, 2)
  );
}

async function apiCall(access, ttl = 12000) {
  try {
    const r = await fetch(`${API_BASE}/tms/student?limit=1`, {
      headers: { Authorization: `Bearer ${access}`, ...HTTP_HEADERS },
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
      headers: { "Content-Type": "application/json", ...HTTP_HEADERS },
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
      headers: { "Content-Type": "application/json", ...HTTP_HEADERS },
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
    branch: HTTP_HEADERS["x-app-branch"],
    timezone: HTTP_HEADERS["x-app-timezone"],
  };
}

function logout() {
  try {
    fs.rmSync(STORAGE_FILE, { force: true });
  } catch {}
  validateOk = null;
  validateAt = 0;
  writeState({ loggedIn: false, lastCheckAt: Date.now(), loginEmail: null });
  return { ok: true };
}

let validateOk = null;
let validateAt = 0;

module.exports = {
  BASE_URL,
  readState,
  writeState,
  validateSession,
  loginViaApi,
  getApiHeaders,
  logout,
};