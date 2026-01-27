/**
 * Generates a professional HTML email template for OTP verification
 * @param {string} name - Recipient name
 * @param {string} otp - The 6-digit OTP
 * @param {string} type - Type of verification ('signup' or 'reset')
 * @returns {string} HTML content
 */
const getOTPTemplate = (name, otp, type = 'signup') => {
    const title = type === 'signup' ? "Welcome to HigherPolynomia!" : "Password Reset Request";
    const actionText = type === 'signup' ? "creating your account" : "resetting your password";

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: #f4f7ff;
                margin: 0;
                padding: 0;
            }
            .container {
                max-width: 600px;
                margin: 40px auto;
                background-color: #ffffff;
                border-radius: 24px;
                overflow: hidden;
                box-shadow: 0 10px 40px rgba(0,0,0,0.05);
            }
            .header {
                background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
                padding: 40px 20px;
                text-align: center;
                color: #ffffff;
            }
            .logo {
                font-size: 28px;
                font-weight: 900;
                letter-spacing: -1px;
                margin-bottom: 10px;
            }
            .content {
                padding: 40px;
                text-align: center;
                color: #374151;
            }
            h1 {
                font-size: 24px;
                font-weight: 800;
                margin-bottom: 16px;
                color: #111827;
            }
            p {
                font-size: 16px;
                line-height: 1.6;
                margin-bottom: 24px;
            }
            .otp-box {
                background-color: #f8fafc;
                border: 2px dashed #e2e8f0;
                padding: 24px;
                border-radius: 20px;
                margin: 30px 0;
            }
            .otp-code {
                font-size: 42px;
                font-weight: 900;
                letter-spacing: 12px;
                color: #7c3aed;
                margin: 0;
                font-family: 'Courier New', Courier, monospace;
            }
            .footer {
                padding: 30px;
                text-align: center;
                background-color: #f9fafb;
                color: #9ca3af;
                font-size: 13px;
            }
            .warning {
                color: #ef4444;
                font-weight: 600;
                font-size: 14px;
            }
            .divider {
                height: 1px;
                background-color: #e5e7eb;
                margin: 30px 0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">HP HigherPolynomia</div>
                <div style="font-size: 14px; font-weight: 600; opacity: 0.9; text-transform: uppercase; tracking: 2px;">Knowledge, Elevated</div>
            </div>
            <div class="content">
                <h1>Hello ${name},</h1>
                <p>You are one step away from ${actionText}. Please use the verification code below to confirm your identity.</p>
                
                <div class="otp-box">
                    <p style="text-transform: uppercase; font-size: 12px; font-weight: 800; color: #94a3b8; margin-bottom: 12px;">Your Verification Code</p>
                    <div class="otp-code">${otp}</div>
                </div>

                <p class="warning">This code will expire in 5 minutes.</p>
                <p>If you did not request this code, please ignore this email or contact support if you have concerns.</p>
                
                <div class="divider"></div>
                
                <p style="font-size: 14px; font-weight: 500;">Happy Learning,<br><strong>Team HigherPolynomia</strong></p>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} HigherPolynomia. All rights reserved.<br>
                This is an automated system message. Please do not reply to this email.
            </div>
        </div>
    </body>
    </html>
    `;
};

module.exports = { getOTPTemplate };
