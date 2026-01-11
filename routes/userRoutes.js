// const express = require("express");
// const { signupUser, loginUser, getUserByEmail } = require("../controllers/userController");
// const uresRouter = express.Router();

// uresRouter.post("/signup", signupUser);
// uresRouter.post("/login", loginUser);
// uresRouter.get("/email/:email", getUserByEmail);

// module.exports = uresRouter;

// const express = require("express");
// const { sendOtp, verifyOtpAndSignup,  } = require("../controllers/userController");

// const uresRouter = express.Router();

// // Route to send OTP to email before signup
// uresRouter.post("/send-otp", sendOtp);

// // Route to verify OTP and register user
// uresRouter.post("/signup", verifyOtpAndSignup);



// module.exports = uresRouter;


const express = require("express");
const { sendOtpAndCheckEmail, verifyOtpAndSignup, loginUser, getUserByEmail ,forgotPasswordRequest , resetPassword } = require("../controllers/userController");

const uresRouter = express.Router();

// Send OTP (If Email is New)
uresRouter.post("/send-otp", sendOtpAndCheckEmail);

// Verify OTP & Signup User
uresRouter.post("/verify-otp", verifyOtpAndSignup);

uresRouter.post("/forgot-password", forgotPasswordRequest); // Step 1: Request OTP
uresRouter.post("/reset-password", resetPassword); // Step 2: Verify OTP & Reset Password

// Login User
uresRouter.post("/login", loginUser);

// Get User by Email
uresRouter.get("/email/:email", getUserByEmail);

module.exports = uresRouter;

