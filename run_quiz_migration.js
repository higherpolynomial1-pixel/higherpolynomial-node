require('dotenv').config();
const pool = require('./config/awsDb');

const fs = require('fs');
const path = require('path');

const runMigration = async () => {
    try {
        console.log("Starting Quiz Migration...");
        const sqlPath = path.join(__dirname, 'migrations', 'create_quiz_tables.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Split SQL into individual statements
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            console.log(`Executing: ${statement.substring(0, 50)}...`);
            await pool.query(statement);
        }

        console.log("Quiz Migration completed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
