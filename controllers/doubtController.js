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

// Admin: Create a new doubt availability slot
const createDoubtSlot = async (req, res) => {
    try {
        const { startTime, endTime, courseIds } = req.body;

        if (!startTime || !endTime || !courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
            return res.status(400).json({ message: "Start time, end time, and at least one course ID are required" });
        }

        // Validation: No past dates
        if (new Date(startTime) < new Date()) {
            return res.status(400).json({ message: "Cannot create availability for a past date/time" });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Insert Slot
            const [slotResult] = await connection.query(
                "INSERT INTO doubt_slots (start_time, end_time) VALUES (?, ?)",
                [startTime, endTime]
            );
            const slotId = slotResult.insertId;

            // 2. Link Slot to Courses
            const courseValues = courseIds.map(cid => [slotId, cid]);
            await connection.query(
                "INSERT INTO doubt_slot_courses (slot_id, course_id) VALUES ?",
                [courseValues]
            );

            await connection.commit();
            res.status(201).json({ message: "Doubt slot created successfully", slotId });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Error creating doubt slot:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Public/Student: Get available slots for a course
const getSlotsByCourse = async (req, res) => {
    try {
        const { courseId } = req.params;

        const query = `
            SELECT s.id, s.start_time, s.end_time 
            FROM doubt_slots s
            JOIN doubt_slot_courses sc ON s.id = sc.slot_id
            WHERE sc.course_id = ? AND s.is_booked = FALSE AND s.start_time > NOW()
            ORDER BY s.start_time ASC
        `;

        const [slots] = await pool.query(query, [courseId]);
        res.status(200).json({ slots });
    } catch (error) {
        console.error("Error fetching slots:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Submit a new doubt request (updated to use slot)
const submitDoubtRequest = async (req, res) => {
    try {
        const { userName, userEmail, courseName, doubtDescription, slotId } = req.body;

        if (!userName || !userEmail || !courseName || !doubtDescription || !slotId) {
            return res.status(400).json({ message: "All fields including Slot ID are required" });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Check if slot is still available
            const [slotCheck] = await connection.query(
                "SELECT is_booked FROM doubt_slots WHERE id = ? FOR UPDATE",
                [slotId]
            );

            if (slotCheck.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: "Slot not found" });
            }

            if (slotCheck[0].is_booked) {
                await connection.rollback();
                return res.status(409).json({ message: "Slot is already booked" });
            }

            // Mark slot as booked
            await connection.query("UPDATE doubt_slots SET is_booked = TRUE WHERE id = ?", [slotId]);

            // Create request
            const [result] = await connection.query(
                "INSERT INTO doubt_requests (user_name, user_email, course_name, doubt_description, slot_id, status) VALUES (?, ?, ?, ?, ?, 'pending')",
                [userName, userEmail, courseName, doubtDescription, slotId]
            );

            await connection.commit();
            res.status(201).json({
                message: "Doubt request submitted successfully",
                requestId: result.insertId
            });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Error submitting doubt request:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get all doubt requests (Admin only)
const getAllDoubtRequests = async (req, res) => {
    try {
        // Updated to join with slot details if needed, but basic info is fine. 
        // Ideally we show the scheduled time from the slot initially?
        // Let's join to get slot time for pending requests
        const query = `
            SELECT r.*, s.start_time as slot_start_time, s.end_time as slot_end_time 
            FROM doubt_requests r
            LEFT JOIN doubt_slots s ON r.slot_id = s.id
            ORDER BY r.created_at DESC
        `;
        const [requests] = await pool.query(query);

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
        const { duration, meetLink, scheduledAt } = req.body; // scheduledAt might be redundant if we use slot time, but allowing override is good.

        if (!meetLink) {
            return res.status(400).json({ message: "Meet Link is required" });
        }

        // Fetch request details for email
        const [rows] = await pool.query("SELECT * FROM doubt_requests WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Request not found" });
        const request = rows[0];

        // Update DB
        // If scheduledAt is not provided, we should probably use the slot time? 
        // For now, let's keep the existing flow where Admin confirms the time (or uses the slot time).
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

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Fetch request details
            const [rows] = await connection.query("SELECT * FROM doubt_requests WHERE id = ? FOR UPDATE", [id]);
            if (rows.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: "Request not found" });
            }
            const request = rows[0];

            // Update Request Status
            await connection.query("UPDATE doubt_requests SET status = 'rejected' WHERE id = ?", [id]);

            // Free the slot
            if (request.slot_id) {
                await connection.query("UPDATE doubt_slots SET is_booked = FALSE WHERE id = ?", [request.slot_id]);
            }

            await connection.commit();

            // Send Email (outside transaction)
            try {
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: request.user_email,
                    subject: "Update on your Doubt Session Request",
                    html: getDoubtRejectTemplate(request.user_name, request.course_name),
                });
            } catch (emailError) {
                console.error("Email sending failed but DB updated:", emailError);
            }

            res.status(200).json({ message: "Doubt request rejected, slot freed, and email sent" });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Error rejecting doubt request:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Admin: Get all doubt slots
const getAllDoubtSlots = async (req, res) => {
    try {
        // 1. Auto-cleanup: Delete slots where start_time has passed
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Delete expired mapping first
            await connection.query(`
                DELETE sc FROM doubt_slot_courses sc
                JOIN doubt_slots s ON sc.slot_id = s.id
                WHERE s.start_time < NOW() AND s.is_booked = FALSE
            `);

            // Delete expired unbooked slots
            await connection.query("DELETE FROM doubt_slots WHERE start_time < NOW() AND is_booked = FALSE");

            await connection.commit();
        } catch (cleanupErr) {
            await connection.rollback();
            console.error("Auto-cleanup failed:", cleanupErr);
        } finally {
            connection.release();
        }

        const query = `
            SELECT s.*, 
                   GROUP_CONCAT(c.title SEPARATOR ', ') as courses
            FROM doubt_slots s
            LEFT JOIN doubt_slot_courses sc ON s.id = sc.slot_id
            LEFT JOIN courses c ON sc.course_id = c.id
            GROUP BY s.id
            ORDER BY s.start_time DESC
        `;
        const [slots] = await pool.query(query);
        res.status(200).json({ slots });
    } catch (error) {
        console.error("Error fetching all slots:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Admin: Delete a doubt slot
const deleteDoubtSlot = async (req, res) => {
    try {
        const { id } = req.params;

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Check if slot has any accepted requests (optional policy: don't delete if booked?)
            // For now, let's allow deletion but maybe warn in frontend. 
            // If we delete slot, linked requests should probably have slot_id set to null or be handled.

            // 1. Delete links in doubt_slot_courses
            await connection.query("DELETE FROM doubt_slot_courses WHERE slot_id = ?", [id]);

            // 2. Clear slot_id from linked requests (if any)
            await connection.query("UPDATE doubt_requests SET slot_id = NULL WHERE slot_id = ?", [id]);

            // 3. Delete slot from doubt_slots
            const [result] = await connection.query("DELETE FROM doubt_slots WHERE id = ?", [id]);

            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ message: "Slot not found" });
            }

            await connection.commit();
            res.status(200).json({ message: "Doubt slot deleted successfully" });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Error deleting doubt slot:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    createDoubtSlot,
    getSlotsByCourse,
    submitDoubtRequest,
    getAllDoubtRequests,
    acceptDoubtRequest,
    rejectDoubtRequest,
    getAllDoubtSlots,
    deleteDoubtSlot
};
