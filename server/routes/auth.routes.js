const express = require("express");
const authController = require("../controllers/auth.controller");

const router = express.Router();

router.get("/status", authController.getStatus);
router.post("/login-api", authController.loginApi);
router.post("/refresh-login", authController.refreshLogin);
router.post("/logout", authController.logout);

module.exports = router;
