const express = require("express");
const {
    registerUser,
    verifyOtpAndSignup,
    loginUser,
    forgotPassword,
    resetPassword
} = require("../controllers/userController");

const userRouter = express.Router();

// Send OTP & store signup details
userRouter.post("/signup", registerUser);

// Login User
userRouter.post("/login", loginUser);

// Verify OTP & create account
userRouter.post("/verify-otp", verifyOtpAndSignup);

// Forgot Password - Send OTP
userRouter.post("/forgot-password", forgotPassword);

// Reset Password - Verify OTP & Update Password
userRouter.post("/reset-password", resetPassword);

module.exports = userRouter;
