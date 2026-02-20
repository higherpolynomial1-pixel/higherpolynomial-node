// Database Migration Runner for HLS Conversion Status
require('dotenv').config();
const pool = require('./config/awsDb');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    let connection;
    try {
        console.log('🔄 Starting database migration...');

        // Read the SQL migration file
        const migrationPath = path.join(__dirname, 'migrations', 'add_hls_conversion_status.sql');
        let sql = fs.readFileSync(migrationPath, 'utf8');

        // Remove comments
        sql = sql.replace(/--.*$/gm, '');

        // Split by semicolons and clean up
        const statements = sql
            .split(';')
            .map(s => s.trim().replace(/\s+/g, ' '))
            .filter(s => s.length > 10); // Filter out empty or very short statements

        connection = await pool.getConnection();

        console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            const preview = statement.substring(0, 80).replace(/\s+/g, ' ');
            console.log(`[${i + 1}/${statements.length}] ${preview}...`);

            try {
                await connection.query(statement);
                console.log('   ✅ Success\n');
            } catch (error) {
                // Ignore "duplicate column" errors (migration already run)
                if (error.code === 'ER_DUP_FIELDNAME') {
                    console.log('   ⚠️  Column already exists, skipping...\n');
                } else if (error.code === 'ER_DUP_KEYNAME') {
                    console.log('   ⚠️  Index already exists, skipping...\n');
                } else if (error.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
                    console.log('   ⚠️  Field or key doesn\'t exist, skipping...\n');
                } else {
                    throw error;
                }
            }
        }

        console.log('✅ Migration completed successfully!\n');
        console.log('📊 Verifying changes...\n');

        // Verify the new columns exist
        const [courseVideosConvStatus] = await connection.query(
            "SHOW COLUMNS FROM course_videos LIKE 'conversion_status'"
        );
        const [courseVideosOrigUrl] = await connection.query(
            "SHOW COLUMNS FROM course_videos LIKE 'original_video_url'"
        );
        const [coursesConvStatus] = await connection.query(
            "SHOW COLUMNS FROM courses LIKE 'video_conversion_status'"
        );
        const [coursesOrigUrl] = await connection.query(
            "SHOW COLUMNS FROM courses LIKE 'original_video_url'"
        );

        if (courseVideosConvStatus.length > 0) {
            console.log('✅ course_videos.conversion_status column exists');
        }
        if (courseVideosOrigUrl.length > 0) {
            console.log('✅ course_videos.original_video_url column exists');
        }
        if (coursesConvStatus.length > 0) {
            console.log('✅ courses.video_conversion_status column exists');
        }
        if (coursesOrigUrl.length > 0) {
            console.log('✅ courses.original_video_url column exists');
        }

        console.log('\n🎉 Database is ready for automatic HLS conversion!');

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        if (error.sql) {
            console.error('Failed SQL:', error.sql);
        }
        process.exit(1);
    } finally {
        if (connection) {
            connection.release();
        }
        await pool.end();
    }
}

// Run the migration
runMigration();
