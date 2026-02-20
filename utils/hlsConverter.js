const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');
const AWS = require('aws-sdk');
const crypto = require('crypto');

// Set absolute path for FFmpeg (Winget installation)
const ffmpegPath = "C:\\Users\\ankit\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe";
ffmpeg.setFfmpegPath(ffmpegPath);

// AWS S3 Configuration
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    signatureVersion: 'v4'
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const HLS_SEGMENT_DURATION = process.env.HLS_SEGMENT_DURATION || 10;
const HLS_TEMP_DIR = process.env.HLS_TEMP_DIR || path.join(__dirname, '../temp/hls');

/**
 * Convert MP4 video to Encrypted HLS format
 * @param {string} inputPath - Path to input MP4 file
 * @param {string} outputDir - Directory to save HLS files
 * @param {string} keyUrl - URL where the player can fetch the decryption key
 * @returns {Promise<{playlistPath: string, segmentFiles: string[], encryptionKey: Buffer}>}
 */
const convertToHLS = (inputPath, outputDir, keyUrl) => {
    return new Promise((resolve, reject) => {
        // Ensure output directory exists
        fs.ensureDirSync(outputDir);

        const encryptionKey = crypto.randomBytes(16);
        const keyFile = path.join(outputDir, 'video.key');
        const keyInfoFile = path.join(outputDir, 'key_info.txt');

        // Write key file
        fs.writeFileSync(keyFile, encryptionKey);

        // Create key info file for FFmpeg
        // Format:
        // key_uri
        // key_file_path
        const keyInfoContent = `${keyUrl}\n${keyFile}`;
        fs.writeFileSync(keyInfoFile, keyInfoContent);

        const playlistPath = path.join(outputDir, 'playlist.dat'); // Obfuscated extension
        const segmentPattern = path.join(outputDir, 'seg_%03d.bin'); // Obfuscated extension

        console.log(`[HLS Converter] Starting encrypted conversion: ${inputPath}`);

        ffmpeg(inputPath)
            .outputOptions([
                '-codec: copy',
                '-start_number 0',
                `-hls_time ${HLS_SEGMENT_DURATION}`,
                '-hls_list_size 0',
                `-hls_segment_filename ${segmentPattern}`,
                `-hls_key_info_file ${keyInfoFile}`, // Enable encryption
                '-f hls'
            ])
            .output(playlistPath)
            .on('start', (commandLine) => {
                console.log('[HLS Converter] FFmpeg command:', commandLine);
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`[HLS Converter] Progress: ${Math.round(progress.percent)}%`);
                }
            })
            .on('end', async () => {
                console.log('[HLS Converter] Encryption completed successfully');

                // Remove the temporary key info file before uploading
                await fs.remove(keyInfoFile);

                // Get list of generated files
                const files = await fs.readdir(outputDir);
                const generatedFiles = files.filter(f => f.endsWith('.bin') || f.endsWith('.dat') || f.endsWith('.key'));

                resolve({
                    playlistPath,
                    segmentFiles: generatedFiles.map(f => path.join(outputDir, f)),
                    encryptionKey
                });
            })
            .on('error', (err) => {
                console.error('[HLS Converter] Encryption error:', err);
                reject(err);
            })
            .run();
    });
};

/**
 * Upload HLS files to S3
 * @param {string} hlsDir - Directory containing HLS files
 * @param {string} s3Prefix - S3 path prefix
 * @returns {Promise<string>} - URL of the .dat playlist
 */
const uploadHLSToS3 = async (hlsDir, s3Prefix) => {
    try {
        const files = await fs.readdir(hlsDir);
        const uploadPromises = [];

        for (const file of files) {
            const filePath = path.join(hlsDir, file);
            const fileContent = await fs.readFile(filePath);

            let contentType = 'application/octet-stream';
            if (file.endsWith('.dat')) contentType = 'application/vnd.apple.mpegurl';
            if (file.endsWith('.bin')) contentType = 'video/MP2T';
            if (file.endsWith('.key')) contentType = 'application/octet-stream';

            const s3Key = `${s3Prefix}/${file}`;

            uploadPromises.push(s3.upload({
                Bucket: BUCKET_NAME,
                Key: s3Key,
                Body: fileContent,
                ContentType: contentType
            }).promise());
        }

        await Promise.all(uploadPromises);
        return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Prefix}/playlist.dat`;
    } catch (error) {
        console.error('[HLS Uploader] Upload error:', error);
        throw error;
    }
};

/**
 * Clean up temporary files and directories
 * @param {string} dir - Directory to clean up
 */
const cleanupTempFiles = async (dir) => {
    try {
        if (await fs.pathExists(dir)) {
            await fs.remove(dir);
            console.log(`[HLS Cleanup] Removed temporary directory: ${dir}`);
        }
    } catch (error) {
        console.error('[HLS Cleanup] Cleanup error:', error);
        // Don't throw - cleanup failure shouldn't break the main flow
    }
};

/**
 * Complete HLS conversion workflow with AES-128 Encryption
 * @param {Buffer} videoBuffer - Video file buffer
 * @param {string} originalFilename - Original filename
 * @param {string} targetId - ID of the video or course
 * @param {string} targetType - 'video' or 'course'
 * @returns {Promise<string>} - URL of the playlist
 */
const processVideoToHLS = async (videoBuffer, originalFilename, targetId, targetType = 'video') => {
    const videoIdentifier = `${targetType}_${targetId}`;
    const tempInputPath = path.join(HLS_TEMP_DIR, `input_${videoIdentifier}.mp4`);
    const tempOutputDir = path.join(HLS_TEMP_DIR, `output_${videoIdentifier}`);
    const s3Prefix = `videos/hls/${videoIdentifier}`;

    // Secure key URL (proxied through our backend)
    const keyUrl = `${process.env.BACKEND_URL}/api/videos/key/${targetType}/${targetId}`;

    try {
        await fs.ensureDir(HLS_TEMP_DIR);
        await fs.writeFile(tempInputPath, videoBuffer);

        const { playlistPath, encryptionKey } = await convertToHLS(tempInputPath, tempOutputDir, keyUrl);

        // Upload to S3 (includes video.key, although we'll serve it via API, it's safer to have it in S3 encrypted at rest)
        const playlistUrl = await uploadHLSToS3(tempOutputDir, s3Prefix);

        await cleanupTempFiles(tempInputPath);
        await cleanupTempFiles(tempOutputDir);

        return playlistUrl;
    } catch (error) {
        await cleanupTempFiles(tempInputPath);
        await cleanupTempFiles(tempOutputDir);
        throw error;
    }
};

module.exports = {
    convertToHLS,
    uploadHLSToS3,
    cleanupTempFiles,
    processVideoToHLS
};
