require('dotenv').config();
const pool = require('./config/awsDb');

const updateDoubtTable = async () => {
    try {
        console.log("Updating doubt_requests table...");

        // Check if columns already exist
        const [columns] = await pool.query(`SHOW COLUMNS FROM doubt_requests`);
        const columnNames = columns.map(c => c.Field);

        if (!columnNames.includes('meet_link')) {
            console.log("Adding meet_link column...");
            await pool.query(`ALTER TABLE doubt_requests ADD COLUMN meet_link VARCHAR(500) DEFAULT NULL`);
        }

        if (!columnNames.includes('duration')) {
            console.log("Adding duration column...");
            await pool.query(`ALTER TABLE doubt_requests ADD COLUMN duration VARCHAR(100) DEFAULT NULL`);
        }

        console.log("Table doubt_requests updated successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

updateDoubtTable();
