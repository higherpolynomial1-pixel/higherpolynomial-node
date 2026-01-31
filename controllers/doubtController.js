const pool = require("../config/awsDb");
const nodemailer = require("nodemailer");
const { getDoubtAcceptTemplate, getDoubtRejectTemplate } = require("../utils/emailTemplates");

// Email transporter (same as userController)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Submit a new doubt request
const submitDoubtRequest = async (req, res) => {
    try {
        const { userName, userEmail, courseName, doubtDescription } = req.body;

        if (!userName || !userEmail || !courseName || !doubtDescription) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const [result] = await pool.query(
            "INSERT INTO doubt_requests (user_name, user_email, course_name, doubt_description) VALUES (?, ?, ?, ?)",
            [userName, userEmail, courseName, doubtDescription]
        );

        res.status(201).json({
            message: "Doubt request submitted successfully",
            requestId: result.insertId
        });
    } catch (error) {
        console.error("Error submitting doubt request:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get all doubt requests (Admin only)
const getAllDoubtRequests = async (req, res) => {
    try {
        const [requests] = await pool.query(
            "SELECT * FROM doubt_requests ORDER BY created_at DESC"
        );

        res.status(200).json({ requests });
    } catch (error) {
        console.error("Error fetching doubt requests:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Accept a doubt request
const acceptDoubtRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { duration, meetLink, scheduledAt } = req.body;

        if (!duration || !meetLink || !scheduledAt) {
            return res.status(400).json({ message: "Duration, Meet Link, and Schedule Date/Time are required" });
        }

        // Fetch request details for email
        const [rows] = await pool.query("SELECT * FROM doubt_requests WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Request not found" });
        const request = rows[0];

        // Update DB
        await pool.query(
            "UPDATE doubt_requests SET status = 'accepted', duration = ?, meet_link = ?, scheduled_at = ? WHERE id = ?",
            [duration, meetLink, scheduledAt, id]
        );

        // Send Email
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: request.user_email,
            subject: "Your Doubt Session is Scheduled!",
            html: getDoubtAcceptTemplate(request.user_name, request.course_name, duration, meetLink, scheduledAt),
        });

        res.status(200).json({ message: "Doubt request accepted and email sent" });
    } catch (error) {
        console.error("Error accepting doubt request:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Reject a doubt request
const rejectDoubtRequest = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch request details for email
        const [rows] = await pool.query("SELECT * FROM doubt_requests WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Request not found" });
        const request = rows[0];

        // Update DB
        await pool.query("UPDATE doubt_requests SET status = 'rejected' WHERE id = ?", [id]);

        // Send Email
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: request.user_email,
            subject: "Update on your Doubt Session Request",
            html: getDoubtRejectTemplate(request.user_name, request.course_name),
        });

        res.status(200).json({ message: "Doubt request rejected and email sent" });
    } catch (error) {
        console.error("Error rejecting doubt request:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    submitDoubtRequest,
    getAllDoubtRequests,
    acceptDoubtRequest,
    rejectDoubtRequest
};
