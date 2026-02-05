require('dotenv').config();
const pool = require('./config/awsDb');

const createDoubtSlotsTables = async () => {
    try {
        console.log("Creating doubt availability tables...");

        // 1. Create doubt_slots table
        const createSlotsQuery = `
            CREATE TABLE IF NOT EXISTS doubt_slots (
                id INT AUTO_INCREMENT PRIMARY KEY,
                start_time DATETIME NOT NULL,
                end_time DATETIME NOT NULL,
                is_booked BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await pool.query(createSlotsQuery);
        console.log("Table doubt_slots created.");

        // 2. Create doubt_slot_courses table (Many-to-Many relationship between Slots and Courses)
        // Note: Assuming 'courses' table exists or we maximize flexibility by just storing course_id. 
        // Given the code base doesn't seem to have a SQL table for courses (it might be fetching from another service or generic), 
        // I will just use course_id as INT or VARCHAR depending on existing schema.
        // Looking at AdminDashboard, courses seem to come from an API, likely this same backend. 
        // Let's check coursesRoutes.js later, but for now, assuming course_id is INT or VARCHAR. 
        // Safe bet: match ID type from previous usage. In Dashboard, IDs look like they might be integers. 
        // Actually, looking at AdminDashboard code: course.id is used.
        // Let's assume standard INT or VARCHAR(255). I'll use VARCHAR to be safe as MongoDB IDs are strings (if used there) or UUIDs.

        const createSlotCoursesQuery = `
            CREATE TABLE IF NOT EXISTS doubt_slot_courses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                slot_id INT NOT NULL,
                course_id VARCHAR(255) NOT NULL,
                FOREIGN KEY (slot_id) REFERENCES doubt_slots(id) ON DELETE CASCADE
            )
        `;
        await pool.query(createSlotCoursesQuery);
        console.log("Table doubt_slot_courses created.");

        // 3. Add slot_id to doubt_requests
        // We need to check if column exists first or just try to add it.
        // MySQL doesn't have "ADD COLUMN IF NOT EXISTS" easily in one line without procedure in older versions, 
        // but likely we can just try/catch or check.

        try {
            const addColumnQuery = `
                ALTER TABLE doubt_requests
                ADD COLUMN slot_id INT,
                ADD FOREIGN KEY (slot_id) REFERENCES doubt_slots(id) ON DELETE SET NULL
            `;
            await pool.query(addColumnQuery);
            console.log("Added slot_id to doubt_requests.");
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log("Column slot_id already exists in doubt_requests.");
            } else {
                throw err;
            }
        }

        console.log("Migration completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

createDoubtSlotsTables();
