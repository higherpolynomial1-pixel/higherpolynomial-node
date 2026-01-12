const express = require("express");
const { signup, createTable } = require("../controllers/userController");

const router = express.Router();



// Signup route
router.post("/signup", signup);

module.exports = router;
