const express = require("express");
const studentsController = require("../controllers/students.controller");

const router = express.Router();

router.post("/sync", studentsController.sync);
router.get("/students", studentsController.getStudents);

module.exports = router;
