const { BASE_URL } = require("../../config");
const { readState, writeState } = require("./state.storage");
const {
  loginViaApi,
  validateSession,
  getApiHeaders,
  logout,
} = require("./session.service");

module.exports = {
  BASE_URL,
  readState,
  writeState,
  validateSession,
  loginViaApi,
  getApiHeaders,
  logout,
};
