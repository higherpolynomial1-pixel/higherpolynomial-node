/**
 * Generates a professional HTML email template for various notifications
 */

const getBaseTemplate = (title, content) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7ff; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 40px 20px; text-align: center; color: #ffffff; }
        .logo { font-size: 28px; font-weight: 900; letter-spacing: -1px; margin-bottom: 10px; }
        .content { padding: 40px; text-align: center; color: #374151; }
        h1 { font-size: 24px; font-weight: 800; margin-bottom: 16px; color: #111827; }
        p { font-size: 16px; line-height: 1.6; margin-bottom: 24px; }
        .info-box { background-color: #f8fafc; border: 2px solid #e2e8f0; padding: 24px; border-radius: 20px; margin: 30px 0; text-align: left; }
        .otp-code { font-size: 42px; font-weight: 900; letter-spacing: 12px; color: #2563eb; margin: 0; font-family: 'Courier New', Courier, monospace; text-align: center; }
        .btn { display: inline-block; padding: 14px 30px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: bold; margin-top: 20px; }
        .footer { padding: 30px; text-align: center; background-color: #f9fafb; color: #9ca3af; font-size: 13px; }
        .divider { height: 1px; background-color: #e5e7eb; margin: 30px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">HP HigherPolynomia</div>
            <div style="font-size: 14px; font-weight: 600; opacity: 0.9; text-transform: uppercase;">Knowledge, Elevated</div>
        </div>
        <div class="content">
            ${content}
            <div class="divider"></div>
            <p style="font-size: 14px; font-weight: 500;">Happy Learning,<br><strong>Team HigherPolynomia</strong></p>
        </div>
        <div class="footer">
            &copy; ${new Date().getFullYear()} HigherPolynomia. All rights reserved.<br>
            This is an automated system message. Please do not reply.
        </div>
    </div>
</body>
</html>
`;

const getOTPTemplate = (name, otp, type = 'signup') => {
    const actionText = type === 'signup' ? "creating your account" : "resetting your password";
    const content = `
        <h1>Hello ${name},</h1>
        <p>You are one step away from ${actionText}. Please use the verification code below.</p>
        <div class="info-box">
            <p style="text-transform: uppercase; font-size: 12px; font-weight: 800; color: #94a3b8; margin-bottom: 12px; text-align: center;">Your Verification Code</p>
            <div class="otp-code">${otp}</div>
        </div>
        <p style="color: #ef4444; font-weight: 600;">This code will expire in 5 minutes.</p>
    `;
    return getBaseTemplate("Verification Code", content);
};

const getDoubtAcceptTemplate = (name, courseName, duration, meetLink, scheduledAt) => {
    // Format date/time nicely
    const dateObj = new Date(scheduledAt);
    const formattedDate = dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const formattedTime = dateObj.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const content = `
        <h1>Hello ${name},</h1>
        <p>Great news! Your doubt session for <strong>${courseName}</strong> has been scheduled.</p>
        <div class="info-box">
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Time:</strong> ${formattedTime}</p>
            <p><strong>Duration:</strong> ${duration}</p>
            <p><strong>Platform:</strong> Google Meet</p>
        </div>
        <p>You can join the session using the link below at the scheduled time:</p>
        <a href="${meetLink}" class="btn">Join Google Meet</a>
        <p style="margin-top: 20px; font-size: 14px; color: #6b7280;">Link: ${meetLink}</p>
    `;
    return getBaseTemplate("Doubt Session Scheduled", content);
};

const getDoubtRejectTemplate = (name, courseName) => {
    const content = `
        <h1>Hello ${name},</h1>
        <p>Regarding your doubt session request for <strong>${courseName}</strong>.</p>
        <p>We regret to inform you that we are unable to schedule a session at this time. We encourage you to review the course materials again or reach out to our community forums for quick answers.</p>
        <p>Keep learning and don't lose heart!</p>
    `;
    return getBaseTemplate("Doubt Session Update", content);
};

module.exports = { getOTPTemplate, getDoubtAcceptTemplate, getDoubtRejectTemplate };
