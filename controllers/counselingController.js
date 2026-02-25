const pool = require("../config/db");
const nodemailer = require("nodemailer");
const { getCounselingAcceptTemplate, getCounselingRejectTemplate } = require("../utils/emailTemplates");

// Email transporter (Standard configuration)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Get all slots (Admin)
const getSlots = async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM counseling_slots ORDER BY start_time ASC");
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("Error fetching slots:", err);
        res.status(500).json({ message: "Server error while fetching slots" });
    }
};

// Create a new slot (Admin)
const createSlot = async (req, res) => {
    const { start_time, price, service_name } = req.body;
    if (!start_time || !price || !service_name) {
        return res.status(400).json({ message: "Start time, price, and service name are required" });
    }
    try {
        const query = `
            INSERT INTO counseling_slots (start_time, price, service_name) 
            VALUES ($1, $2, $3) RETURNING *;
        `;
        const result = await pool.query(query, [start_time, price, service_name]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Error creating slot:", err);
        res.status(500).json({ message: "Server error while creating slot" });
    }
};

// Delete a slot (Admin)
const deleteSlot = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM counseling_slots WHERE id = $1 AND is_booked = FALSE", [id]);
        res.status(200).json({ message: "Slot deleted successfully" });
    } catch (err) {
        console.error("Error deleting slot:", err);
        res.status(500).json({ message: "Server error while deleting slot" });
    }
};

// Get available slots (User)
const getAvailableSlots = async (req, res) => {
    const { service_name } = req.query;
    try {
        let query = "SELECT * FROM counseling_slots WHERE is_booked = FALSE AND start_time > NOW()";
        const params = [];

        if (service_name) {
            query += " AND service_name = $1";
            params.push(service_name);
        }

        query += " ORDER BY start_time ASC";

        const result = await pool.query(query, params);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("Error fetching available slots:", err);
        res.status(500).json({ message: "Server error while fetching available slots" });
    }
};


// Create a new counseling session
const createSession = async (req, res) => {
    const {
        fullName,
        phone,
        email,
        currentClass,
        age,
        message,
        serviceName,
        duration,
        charges,
        preferredDateTime,
        paymentMethod,
        slotId, // Add slotId to payload
    } = req.body;

    if (!fullName || !phone || !email || !serviceName || !charges || !preferredDateTime) {
        return res.status(400).json({ message: "Required fields are missing" });
    }

    try {
        const query = `
      INSERT INTO counseling_sessions 
      (full_name, phone, email, current_class, age, message, service_name, duration, charges, preferred_date_time, payment_method, slot_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
      RETURNING *;
    `;
        const values = [
            fullName,
            phone,
            email,
            currentClass || null,
            age === '' || age === null ? null : parseInt(age),
            message || null,
            serviceName,
            duration || null,
            charges,
            preferredDateTime,
            paymentMethod,
            slotId,
        ];

        const result = await pool.query(query, values);

        // Mark slot as booked
        if (slotId) {
            await pool.query("UPDATE counseling_slots SET is_booked = TRUE WHERE id = $1", [slotId]);
        }

        res.status(201).json({
            message: "Counseling session booked successfully",
            session: result.rows[0],
        });
    } catch (err) {
        console.error("Error booking counseling session:", err);
        res.status(500).json({ message: "Server error while booking session" });
    }
};

// Get all counseling sessions (for admin)
const getSessions = async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM counseling_sessions WHERE id_deleted = FALSE ORDER BY created_at DESC");
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("Error fetching counseling sessions:", err);
        res.status(500).json({ message: "Server error while fetching sessions" });
    }
};

// Accept counseling session (Admin)
const acceptSession = async (req, res) => {
    const { id } = req.params;
    const { meetLink } = req.body;

    if (!meetLink) {
        return res.status(400).json({ message: "Google Meet link is required" });
    }

    try {
        const query = `
            UPDATE counseling_sessions 
            SET status = 'accepted', meet_link = $1 
            WHERE id = $2 
            RETURNING *;
        `;
        const result = await pool.query(query, [meetLink, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Session not found" });
        }
        const session = result.rows[0];

        // Send confirmation email
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: session.email,
                subject: `Your ${session.service_name} Session is Confirmed!`,
                html: getCounselingAcceptTemplate(
                    session.full_name,
                    session.service_name,
                    session.duration || "Standard Duration",
                    meetLink,
                    session.preferred_date_time
                ),
            });
        } catch (emailErr) {
            console.error("Email sending failed:", emailErr);
            // We don't return 500 here because the DB update was successful
        }

        res.status(200).json({
            message: "Session accepted and confirmation email sent",
            session: session,
        });
    } catch (err) {
        console.error("Error accepting session:", err);
        res.status(500).json({ message: "Server error while accepting session" });
    }
};

// Reject counseling session (Admin)
const rejectSession = async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            UPDATE counseling_sessions 
            SET status = 'rejected'
            WHERE id = $1 
            RETURNING *;
        `;
        const result = await pool.query(query, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Session not found" });
        }
        const session = result.rows[0];

        // Free the associated slot if it exists
        if (session.slot_id) {
            await pool.query("UPDATE counseling_slots SET is_booked = FALSE WHERE id = $1", [session.slot_id]);
        }

        // Send rejection email
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: session.email,
                subject: "Update on your Counseling Session Request",
                html: getCounselingRejectTemplate(session.full_name, session.service_name),
            });
        } catch (emailErr) {
            console.error("Rejection email failed:", emailErr);
        }

        res.status(200).json({
            message: "Session rejected, slot freed, and email sent",
            session,
        });
    } catch (err) {
        console.error("Error rejecting session:", err);
        res.status(500).json({ message: "Server error while rejecting session" });
    }
};

module.exports = {
    createSession,
    getSessions,
    getSlots,
    createSlot,
    deleteSlot,
    getAvailableSlots,
    acceptSession,
    rejectSession,
};

