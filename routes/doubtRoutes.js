const express = require("express");
const {
    submitDoubtRequest,
    getAllDoubtRequests,
    acceptDoubtRequest,
    rejectDoubtRequest,
    createDoubtSlot,
    getSlotsByCourse,
    getAllDoubtSlots,
    deleteDoubtSlot
} = require("../controllers/doubtController.js");

const authMiddleware = require("../middleware/authMiddleware.js");

const doubtRouter = express.Router();

// Admin: Create Slot
doubtRouter.post("/admin/doubt-slots", createDoubtSlot);
doubtRouter.get("/admin/doubt-slots", getAllDoubtSlots);
doubtRouter.delete("/admin/doubt-slots/:id", deleteDoubtSlot);

// Public/Student: Get Slots for a course
doubtRouter.get("/courses/:courseId/doubt-slots", getSlotsByCourse);

// Submit a doubt request
doubtRouter.post("/doubt-requests", submitDoubtRequest);

// Get all doubt requests (Admin only - public for now)
doubtRouter.get("/admin/doubt-requests", getAllDoubtRequests);

// Accept/Reject doubt requests
doubtRouter.patch("/admin/doubt-requests/:id/accept", acceptDoubtRequest);
doubtRouter.patch("/admin/doubt-requests/:id/reject", rejectDoubtRequest);

module.exports = doubtRouter;
