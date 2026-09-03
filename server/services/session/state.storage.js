const fs = require("fs");
const { DATA_DIR, STATE_FILE } = require("../../config");

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

module.exports = {
  readState,
  writeState,
};
