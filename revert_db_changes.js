const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./config/awsDb');

async function revertDbChanges() {
    try {
        const connection = await pool.getConnection();

        console.log("Checking database state...");

        // 1. Check and Drop user_courses table
        const [tables] = await connection.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'user_courses'
    `);

        if (tables.length > 0) {
            console.log("Found 'user_courses' table. Dropping it...");
            await connection.query(`DROP TABLE user_courses`);
            console.log("Dropped 'user_courses' table.");
        } else {
            console.log("'user_courses' table does not exist.");
        }

        // 2. Check and Remove is_blocked from signup table
        const [columns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'signup' 
      AND COLUMN_NAME = 'is_blocked'
    `);

        if (columns.length > 0) {
            console.log("Found 'is_blocked' column in 'signup'. Removing it...");
            await connection.query(`ALTER TABLE signup DROP COLUMN is_blocked`);
            console.log("Removed 'is_blocked' column.");
        } else {
            console.log("'is_blocked' column does not exist in 'signup'.");
        }

        connection.release();
        console.log("Database revert process finished.");
        process.exit(0);
    } catch (error) {
        console.error('Revert failed:', error);
        process.exit(1);
    }
}

revertDbChanges();
