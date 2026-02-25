const express = require("express");
const router = express.Router();
const counselingController = require("../controllers/counselingController");

// Post request to book a counseling session
router.post("/counseling/book", counselingController.createSession);

// Get request to fetch all sessions (protect this in real app)
router.get("/counseling/sessions", counselingController.getSessions);

// Slot management (Admin)
router.get("/counseling/slots/all", counselingController.getSlots);
router.post("/counseling/slots", counselingController.createSlot);
router.delete("/counseling/slots/:id", counselingController.deleteSlot);

// Available slots (User)
router.get("/counseling/slots/available", counselingController.getAvailableSlots);

// Accept/Reject request (Admin)
router.post("/counseling/accept/:id", counselingController.acceptSession);
router.post("/counseling/reject/:id", counselingController.rejectSession);

module.exports = router;

