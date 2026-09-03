const { API_ORIGIN } = require("../config");
const { sleep } = require("./utils");

let sessionService = null;
function getSessionService() {
  if (!sessionService) {
    try {
      sessionService = require("../services/session");
    } catch {}
  }
  return sessionService;
}

/**
 * Perform a JSON request to CMS API with standardized headers, auto-retry on 429,
 * and automatic session recovery on 401.
 */
async function fetchJson(url, headers = {}, options = {}, retryCount = 0) {
  const fullUrl = url.startsWith("http") ? url : `${API_ORIGIN}${url}`;
  const ttl = options.ttl || 30000;

  const reqHeaders = { ...(options.headers || {}) };
  if (headers.token) reqHeaders["authorization"] = `Bearer ${headers.token}`;
  if (headers.branch) reqHeaders["x-app-branch"] = headers.branch;
  if (headers.timezone) reqHeaders["x-app-timezone"] = headers.timezone;
  if (options.body && !reqHeaders["Content-Type"]) reqHeaders["Content-Type"] = "application/json";

  const res = await fetch(fullUrl, {
    method: options.method || "GET",
    headers: reqHeaders,
    body: options.body ? (typeof options.body === "string" ? options.body : JSON.stringify(options.body)) : undefined,
    signal: AbortSignal.timeout(ttl),
  });

  // Handle rate limiting (429)
  if (res.status === 429 && retryCount < 2) {
    await sleep(2500);
    return fetchJson(url, headers, options, retryCount + 1);
  }

  // Handle expired token (401)
  if ((res.status === 401 || res.status === 403) && retryCount < 1) {
    const session = getSessionService();
    if (session && (await session.validateSession(0))) {
      const fresh = session.getApiHeaders();
      if (fresh && fresh.token) {
        return fetchJson(url, { ...headers, token: fresh.token }, options, retryCount + 1);
      }
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    const msg = errorBody?.message || `HTTP ${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.response = errorBody;
    throw err;
  }

  return await res.json();
}

module.exports = {
  fetchJson,
};
