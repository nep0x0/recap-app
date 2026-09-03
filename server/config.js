const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const PROFILE_DIR = path.join(DATA_DIR, "profile");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const STORAGE_FILE = path.join(PROFILE_DIR, "storage.json");
const DB_PATH = path.join(DATA_DIR, "recap.db");

module.exports = {
  PORT: Number(process.env.PORT || 3000),
  HOST: process.env.HOST || "0.0.0.0",
  API_ORIGIN: "https://cms.timedooracademy.com",
  API_BASE: "https://cms.timedooracademy.com/api",
  BASE_URL: "https://cms.timedooracademy.com/tms",
  DEFAULT_HEADERS: {
    "x-app-branch": "[238]",
    "x-app-timezone": "Asia/Jakarta",
  },
  DATA_DIR,
  PROFILE_DIR,
  STATE_FILE,
  STORAGE_FILE,
  DB_PATH,
};
