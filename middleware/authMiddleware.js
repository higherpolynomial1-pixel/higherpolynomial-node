const jwt = require("jsonwebtoken");
const pool = require("../config/awsDb");

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "defaultsecret");

        // Fetch user and latest token_version
        const [rows] = await pool.query("SELECT id, email, token_version FROM signup WHERE id = ?", [decoded.id]);

        if (rows.length === 0) {
            return res.status(401).json({ message: "User not found" });
        }

        const user = rows[0];

        // Check if token version matches the one in DB
        // If the token doesn't have a version (legacy tokens), it's invalid if the DB has a version > 0
        // But for this migration, we will enforce that the valid token MUST match.
        // However, initially, the token payload might NOT have version if I don't update login first.
        // So I must update login first or handle it here gracefully?
        // Better to handle it strictly: payload.token_version must equal user.token_version

        // Note: decoded.token_version might be undefined for old tokens, so they will fail (good).
        if (decoded.token_version !== user.token_version) {
            return res.status(401).json({ message: "Session expired. Please login again." });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("Auth Middleware Error:", error.message);
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};

module.exports = authMiddleware;
