const pool = require("../config/awsDb");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const { getOTPTemplate } = require("../utils/emailTemplates");

// Email transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Temporary storage (use Redis in production)
const pendingUsers = new Map();

const registerUser = async (req, res) => {
    try {
        const { name, email, mobile_number, password } = req.body;

        if (!name || !email || !mobile_number || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Check if user already exists
        const [existingUser] = await pool.query(
            "SELECT id FROM signup WHERE email = ?",
            [email]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({ message: "Email already registered" });
        }

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await pool.query(
            `INSERT INTO otp_verifications (email, otp, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE otp = VALUES(otp), expires_at = VALUES(expires_at)`,
            [email, otp, expiresAt]
        );


        pendingUsers.set(email, { name, email, mobile_number, password });

        // Send OTP email
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Verify your HigherPolynomia Account",
            html: getOTPTemplate(name, otp, 'signup'),
        });

        res.status(200).json({ message: "OTP sent to email" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};


const verifyOtpAndSignup = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: "Email and OTP required" });
        }

        // Verify OTP
        const [otpRows] = await pool.query(
            "SELECT * FROM otp_verifications WHERE email = ? AND otp = ?",
            [email, otp]
        );

        if (otpRows.length === 0) {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        if (new Date() > new Date(otpRows[0].expires_at)) {
            return res.status(400).json({ message: "OTP expired" });
        }

        // Get pending user
        const userData = pendingUsers.get(email);
        if (!userData) {
            return res.status(400).json({ message: "No pending signup found" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(userData.password, 10);

        // Insert user
        await pool.query(
            `INSERT INTO signup (name, email, mobile_number, password)
       VALUES (?, ?, ?, ?)`,
            [
                userData.name,
                userData.email,
                userData.mobile_number,
                hashedPassword,
            ]
        );

        // Cleanup
        await pool.query("DELETE FROM otp_verifications WHERE email = ?", [email]);
        pendingUsers.delete(email);

        res.status(201).json({ message: "Signup successful" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Check if user exists
        const [user] = await pool.query("SELECT * FROM signup WHERE email = ?", [email]);

        if (user.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        // Validate password
        const isMatch = await bcrypt.compare(password, user[0].password);

        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // Increment token version
        const newTokenVersion = (user[0].token_version || 0) + 1;
        await pool.query("UPDATE signup SET token_version = ? WHERE id = ?", [newTokenVersion, user[0].id]);

        // Generate JWT Token with token_version
        const token = jwt.sign(
            { id: user[0].id, email: user[0].email, token_version: newTokenVersion },
            process.env.JWT_SECRET || "defaultsecret",
            { expiresIn: "240h" } // Extended to 10 days for convenience, but single session is enforced
        );

        res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user[0].id,
                name: user[0].name,
                email: user[0].email,
                mobile_number: user[0].mobile_number,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        // Check if user exists
        const [user] = await pool.query("SELECT * FROM signup WHERE email = ?", [email]);

        if (user.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        await pool.query(
            `INSERT INTO otp_verifications (email, otp, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE otp = VALUES(otp), expires_at = VALUES(expires_at)`,
            [email, otp, expiresAt]
        );

        // Send OTP email
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Reset your HigherPolynomia Password",
            html: getOTPTemplate(user[0].name, otp, 'reset'),
        });

        res.status(200).json({ message: "OTP sent to email" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Verify OTP
        const [otpRows] = await pool.query(
            "SELECT * FROM otp_verifications WHERE email = ? AND otp = ?",
            [email, otp]
        );

        if (otpRows.length === 0) {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        if (new Date() > new Date(otpRows[0].expires_at)) {
            return res.status(400).json({ message: "OTP expired" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await pool.query("UPDATE signup SET password = ? WHERE email = ?", [
            hashedPassword,
            email,
        ]);

        // Cleanup OTP
        await pool.query("DELETE FROM otp_verifications WHERE email = ?", [email]);

        res.status(200).json({ message: "Password reset successful" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = { registerUser, verifyOtpAndSignup, loginUser, forgotPassword, resetPassword };
