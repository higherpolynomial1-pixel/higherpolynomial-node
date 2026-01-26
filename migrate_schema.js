const pool = require('./config/awsDb');

const migrate = async () => {
    try {
        console.log("Starting migration...");

        // Check columns in courses table
        const [columns] = await pool.query(`SHOW COLUMNS FROM courses`);
        const columnNames = columns.map(c => c.Field);

        const columnsToAdd = [
            { name: 'category', type: 'VARCHAR(100)' },
            { name: 'video_url', type: 'VARCHAR(500)' },
            { name: 'notes_pdf', type: 'VARCHAR(500)' },
            { name: 'created_by', type: 'VARCHAR(100)' }
        ];

        for (const col of columnsToAdd) {
            if (!columnNames.includes(col.name)) {
                console.log(`Adding column ${col.name}...`);
                await pool.query(`ALTER TABLE courses ADD COLUMN ${col.name} ${col.type}`);
            } else {
                console.log(`Column ${col.name} already exists.`);
            }
        }

        console.log("Migration completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

migrate();
