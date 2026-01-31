require('dotenv').config();
const pool = require('./config/awsDb');

const createDoubtTable = async () => {
    try {
        console.log("Creating doubt_requests table...");

        const query = `
            CREATE TABLE IF NOT EXISTS doubt_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_name VARCHAR(255) NOT NULL,
                user_email VARCHAR(255) NOT NULL,
                course_name VARCHAR(255) NOT NULL,
                doubt_description TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await pool.query(query);
        console.log("Table doubt_requests created or already exists.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

createDoubtTable();
