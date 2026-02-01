const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./config/awsDb');

async function addTokenVersionColumn() {
    try {
        const connection = await pool.getConnection();

        // Check if column exists
        const [columns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'signup' 
      AND COLUMN_NAME = 'token_version'
    `);

        if (columns.length === 0) {
            console.log('Adding token_version column...');
            await connection.query(`
        ALTER TABLE signup 
        ADD COLUMN token_version INT DEFAULT 0
      `);
            console.log('token_version column added successfully.');
        } else {
            console.log('token_version column already exists.');
        }

        connection.release();
        process.exit(0);
    } catch (error) {
        console.error('Error adding column:', error);
        process.exit(1);
    }
}

addTokenVersionColumn();
