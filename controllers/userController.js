




const bcrypt = require("bcrypt");
const pool = require("../config/db");
const nodemailer = require("nodemailer");
const otpGenerator = require("otp-generator");

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const pendingUsers = new Map(); 

const sendOtpAndCheckEmail = async (req, res) => {
  try {
    const { name, mobile_number, email, city, password } = req.body;

    if (!name || !mobile_number || !email || !city || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if email is already registered
    const userExists = await pool.query("SELECT * FROM userquery WHERE email = $1", [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // ✅ Generate a 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // OTP expires in 5 minutes

    // Store OTP in database
    await pool.query(
      `INSERT INTO otp_verifications (email, otp, expires_at) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (email) DO UPDATE 
       SET otp = EXCLUDED.otp, expires_at = EXCLUDED.expires_at`,
      [email, otp, expiresAt]
    );

    // Store user details in temporary storage
    pendingUsers.set(email, { name, mobile_number, city, password });

    // Send OTP email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Email Verification OTP",
      text: `Your OTP for signup verification is: ${otp}. It is valid for 5 minutes.`,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "OTP sent successfully!" });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// 📌 Verify OTP & Register User
const verifyOtpAndSignup = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    // Fetch OTP details
    const otpRecord = await pool.query("SELECT * FROM otp_verifications WHERE email = $1 AND otp = $2", [email, otp]);

    if (otpRecord.rows.length === 0) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const { expires_at } = otpRecord.rows[0];

    // Check if OTP is expired
    if (new Date() > new Date(expires_at)) {
      return res.status(400).json({ message: "OTP expired. Request a new one." });
    }

    // Get user details from temporary storage
    const userDetails = pendingUsers.get(email);
    if (!userDetails) {
      return res.status(400).json({ message: "User details not found. Request a new OTP." });
    }

    const { name, mobile_number, city, password } = userDetails;

    // Delete OTP after verification
    await pool.query("DELETE FROM otp_verifications WHERE email = $1", [email]);
    pendingUsers.delete(email);

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into database
    const result = await pool.query(
      `INSERT INTO userquery (name, mobile_number, email, city, password) 
      VALUES ($1, $2, $3, $4, $5) RETURNING id, name, mobile_number, email, city`,
      [name, mobile_number, email, city, hashedPassword]
    );

    res.status(201).json({ message: "Signup successful!", user: result.rows[0] });
  } catch (error) {
    console.error("Error during signup:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};



const loginUser = async (req, res) => {
  try {
    const { email, mobile_number, password } = req.body;

    // Ensure at least email or mobile_number is provided
    if ((!email && !mobile_number) || !password) {
      return res.status(400).json({ message: "Email/Phone and password are required" });
    }

    // Construct query based on input
    let query = "SELECT * FROM userquery WHERE ";
    let queryParams = [];

    if (email) {
      query += "email = $1";
      queryParams.push(email);
    } else if (mobile_number) {
      query += "mobile_number = $1";
      queryParams.push(mobile_number);
    }

    const user = await pool.query(query, queryParams);

    // Check if user exists
    if (user.rows.length === 0) {
      return res.status(400).json({ message: "Invalid email/phone or password" });
    }

    // Validate password
    const validPassword = await bcrypt.compare(password, user.rows[0].password);
    if (!validPassword) {
      return res.status(400).json({ message: "Invalid email/phone or password" });
    }

    // Respond with user data
    res.json({
      message: "Login successful",
      user: {
        id: user.rows[0].id,
        email: user.rows[0].email,
        mobile_number: user.rows[0].mobile_number,
        name: user.rows[0].name,
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// 📌 Get User by Email
const getUserByEmail = async (req, res) => {
  try {
    const { email } = req.params;

    // Fetch user from database
    const user = await pool.query("SELECT id, name, mobile_number, email, city FROM userquery WHERE email = $1", [email]);

    if (user.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ user: user.rows[0] });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


const forgotPasswordRequest = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Check if user exists
    const user = await pool.query("SELECT * FROM userquery WHERE email = $1", [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ message: "Email not found" });
    }

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // OTP expires in 5 mins

    // Store OTP in database
    await pool.query(
      `INSERT INTO otp_verifications (email, otp, expires_at) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (email) DO UPDATE 
       SET otp = EXCLUDED.otp, expires_at = EXCLUDED.expires_at`,
      [email, otp, expiresAt]
    );

    // Send OTP via Email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset OTP",
      text: `Your OTP to reset your password is: ${otp}. It is valid for 5 minutes.`,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "OTP sent successfully!" });
  } catch (error) {
    console.error("Error in forgot password request:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ 2️⃣ Verify OTP and Reset Password
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP, and new password are required" });
    }

    // Fetch OTP from the database
    const otpRecord = await pool.query("SELECT * FROM otp_verifications WHERE email = $1 AND otp = $2", [email, otp]);

    if (otpRecord.rows.length === 0) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const { expires_at } = otpRecord.rows[0];

    // Check if OTP is expired
    if (new Date() > new Date(expires_at)) {
      return res.status(400).json({ message: "OTP expired. Request a new one." });
    }

    // Delete OTP after verification
    await pool.query("DELETE FROM otp_verifications WHERE email = $1", [email]);

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password in database
    await pool.query("UPDATE userquery SET password = $1 WHERE email = $2", [hashedPassword, email]);

    res.status(200).json({ message: "Password reset successful!" });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { sendOtpAndCheckEmail, verifyOtpAndSignup, loginUser, getUserByEmail , forgotPasswordRequest, resetPassword };

