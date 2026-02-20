require('dotenv').config();
const pool = require('../config/awsDb');
const axios = require('axios');
const { processVideoToHLS } = require('../utils/hlsConverter');

async function migrateToEncryption() {
    console.log("🔒 Starting HLS Migration to AES-128 Encryption...");

    try {
        // 1. Get all videos that need encryption (Force re-encryption since BACKEND_URL was missing)
        const [videos] = await pool.query(
            "SELECT id, title, video_url, original_video_url FROM course_videos WHERE original_video_url IS NOT NULL"
        );
        console.log(`Found ${videos.length} videos to re-encrypt.`);

        for (const video of videos) {
            console.log(`📦 Re-encrypting: ${video.title} (ID: ${video.id})`);
            try {
                // Download
                console.log(`⏬ Downloading: ${video.original_video_url}`);
                const response = await axios.get(video.original_video_url, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data);
                const filename = video.original_video_url.split('/').pop() || 'input.mp4';

                // Convert with encryption
                const playlistUrl = await processVideoToHLS(buffer, filename, video.id, 'video');

                // Update DB (URL will now end in .dat)
                await pool.query(
                    "UPDATE course_videos SET video_url = ?, conversion_status = 'completed' WHERE id = ?",
                    [playlistUrl, video.id]
                );

                console.log(`✅ Successfully encrypted Video ${video.id}. New URL: ${playlistUrl}`);
            } catch (err) {
                console.error(`❌ Failed processing Video ${video.id}:`, err.message);
            }
        }

    } catch (err) {
        console.error("Fatal Error:", err);
    } finally {
        console.log("🏁 Encryption migration finished.");
        process.exit();
    }
}

migrateToEncryption();
