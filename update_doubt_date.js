require('dotenv').config();
const pool = require('./config/awsDb');

const updateDoubtDateColumn = async () => {
    try {
        console.log("Adding scheduled_at column to doubt_requests table...");

        // Check if column already exists
        const [columns] = await pool.query(`SHOW COLUMNS FROM doubt_requests`);
        const columnNames = columns.map(c => c.Field);

        if (!columnNames.includes('scheduled_at')) {
            console.log("Adding scheduled_at column...");
            await pool.query(`ALTER TABLE doubt_requests ADD COLUMN scheduled_at DATETIME DEFAULT NULL`);
        }

        console.log("Table doubt_requests updated successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

updateDoubtDateColumn();
