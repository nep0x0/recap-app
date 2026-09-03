const fs = require("fs");
const { PROFILE_DIR, STORAGE_FILE } = require("../../config");

function extractToken() {
  try {
    const st = JSON.parse(fs.readFileSync(STORAGE_FILE, "utf8"));
    const ck = (st.cookies || []).find((c) => c.name === "access_token");
    if (ck && ck.value) {
      return {
        access: ck.value,
        refresh: (st.cookies || []).find((c) => c.name === "refresh_token")?.value || null,
      };
    }
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

function clearTokens() {
  try {
    fs.rmSync(STORAGE_FILE, { force: true });
  } catch {}
}

module.exports = {
  extractToken,
  writeTokens,
  clearTokens,
};
