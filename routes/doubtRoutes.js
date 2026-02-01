const express = require("express");
const {
    submitDoubtRequest,
    getAllDoubtRequests,
    acceptDoubtRequest,
    rejectDoubtRequest
} = require("../controllers/doubtController.js");

const authMiddleware = require("../middleware/authMiddleware.js");

const doubtRouter = express.Router();

// Submit a doubt request (Needs auth)
doubtRouter.post("/doubt-requests", authMiddleware, submitDoubtRequest);

// Get all doubt requests (Admin only - public for now)
doubtRouter.get("/admin/doubt-requests", getAllDoubtRequests);

// Accept/Reject doubt requests
doubtRouter.patch("/admin/doubt-requests/:id/accept", authMiddleware, acceptDoubtRequest);
doubtRouter.patch("/admin/doubt-requests/:id/reject", authMiddleware, rejectDoubtRequest);

module.exports = doubtRouter;
