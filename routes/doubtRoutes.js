const express = require("express");
const {
    submitDoubtRequest,
    getAllDoubtRequests,
    acceptDoubtRequest,
    rejectDoubtRequest
} = require("../controllers/doubtController.js");

const doubtRouter = express.Router();

// Submit a doubt request
doubtRouter.post("/doubt-requests", submitDoubtRequest);

// Get all doubt requests (Admin only)
doubtRouter.get("/admin/doubt-requests", getAllDoubtRequests);

// Accept/Reject doubt requests
doubtRouter.patch("/admin/doubt-requests/:id/accept", acceptDoubtRequest);
doubtRouter.patch("/admin/doubt-requests/:id/reject", rejectDoubtRequest);

module.exports = doubtRouter;
