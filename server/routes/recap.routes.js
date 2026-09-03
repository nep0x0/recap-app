const express = require("express");
const recapController = require("../controllers/recap.controller");

const router = express.Router();

router.post("/recap", recapController.startRecap);
router.get("/recap-status", recapController.getRecapStatus);
router.get("/recaps", recapController.listRecaps);

module.exports = router;
