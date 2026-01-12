const bcrypt = require("bcrypt");
const pool = require("../config/awsDb");


const signup = async (req, res) => {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: "Name, email, and password are required." });
    }

    try {
        // Check if user already exists
        const [existingUsers] = await pool.query("SELECT * FROM Users WHERE email = ?", [email]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ message: "User already exists." });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        const insertQuery = "INSERT INTO Users (name, email, password, phone) VALUES (?, ?, ?, ?)";
        await pool.query(insertQuery, [name, email, hashedPassword, phone]);

        res.status(201).json({ message: "User registered successfully." });
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    signup
   
};
