const pool = require("../config/awsDb");
const AWS = require("aws-sdk");
const multer = require("multer");
const axios = require("axios");
const { processVideoToHLS } = require("../utils/hlsConverter");

// AWS Configuration
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    signatureVersion: 'v4',
    // s3ForcePathStyle: true // Try setting this if virtual hosting fails
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const S3_FOLDER = process.env.S3_FOLDER;

// Multer Memory Storage (Files are stored in memory buffer before uploading to S3)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const uploadMiddleware = upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'notes', maxCount: 1 }
]);

// Create a new course
// Helper function to upload file to S3
const uploadToS3 = (file) => {
    return new Promise((resolve, reject) => {
        const params = {
            Bucket: BUCKET_NAME,
            Key: `${S3_FOLDER}${Date.now()}_${file.originalname}`,
            Body: file.buffer,
            ContentType: file.mimetype,
        };

        s3.upload(params, (err, data) => {
            if (err) return reject(err);
            resolve(data.Location);
        });
    });
};

// Helper function to delete file from S3
const deleteFromS3 = (url) => {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return Promise.resolve();
    return new Promise((resolve, reject) => {
        try {
            // Extract key from URL: https://bucket.s3.region.amazonaws.com/key
            const urlObj = new URL(url);
            const key = decodeURIComponent(urlObj.pathname.substring(1));

            const params = {
                Bucket: BUCKET_NAME,
                Key: key
            };

            s3.deleteObject(params, (err, data) => {
                if (err) {
                    console.error("S3 Delete Error:", err);
                    // Resolve anyway to not block the main process if file is already gone
                    return resolve();
                }
                resolve(data);
            });
        } catch (e) {
            console.error("Invalid S3 URL:", url);
            resolve();
        }
    });
};

// Helper: Sign S3 URLs for temporary access
const signS3Url = (url) => {
    if (!url || typeof url !== 'string' || !url.includes('.s3.')) return url;
    try {
        const urlObj = new URL(url);
        // Pathname starts with / so remove it
        const key = decodeURIComponent(urlObj.pathname.substring(1));
        return s3.getSignedUrl('getObject', {
            Bucket: BUCKET_NAME,
            Key: key,
            Expires: 7200 // 2 hours
        });
    } catch (e) {
        return url;
    }
};

// Create a new course
const createCourse = async (req, res) => {
    try {
        const { title, description, price, category, createdBy, thumbnailUrl: clientThumbnailUrl, videoUrl: clientVideoUrl, notesUrl: clientNotesUrl } = req.body;

        let thumbnailUrl = clientThumbnailUrl || null;
        let videoUrl = clientVideoUrl || null;
        let notesUrl = clientNotesUrl || null;

        if (req.files && req.files['thumbnail']) {
            thumbnailUrl = await uploadToS3(req.files['thumbnail'][0]);
        }

        let originalVideoUrl = null;
        let conversionStatus = 'skipped';
        let isHLS = false;

        if (req.files && req.files['video']) {
            isHLS = req.files['video'][0].originalname.endsWith('.m3u8');

            if (isHLS) {
                videoUrl = await uploadToS3(req.files['video'][0]);
                conversionStatus = 'skipped';
            } else {
                // Upload original MP4 first to S3 as backup
                originalVideoUrl = await uploadToS3(req.files['video'][0]);
                videoUrl = originalVideoUrl; // Temporary URL until HLS is ready
                conversionStatus = 'pending';
            }
        }

        if (req.files && req.files['notes']) {
            notesUrl = await uploadToS3(req.files['notes'][0]);
        }

        // Create the course record
        const [result] = await pool.query(
            "INSERT INTO courses (title, description, price, thumbnail, category, video_url, notes_pdf, created_by, video_conversion_status, original_video_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [title, description, price, thumbnailUrl, category, videoUrl, notesUrl, createdBy, conversionStatus, originalVideoUrl]
        );

        const courseId = result.insertId;

        // Perform HLS conversion in background if it's an MP4 video
        if (req.files && req.files['video'] && !isHLS && conversionStatus === 'pending') {
            console.log(`[HLS Conversion] Starting background conversion for course intro video ${courseId}...`);
            convertCourseIntroToHLS(courseId, req.files['video'][0].buffer, req.files['video'][0].originalname).catch(err => {
                console.error(`[HLS Conversion Error] Course ${courseId}:`, err);
            });
        }

        res.status(201).json({
            message: "Course created. HLS conversion in progress if applicable.",
            courseId: courseId,
            urls: { thumbnail: thumbnailUrl, video: videoUrl, notes: notesUrl },
            conversionStatus: conversionStatus
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Admin Upload Video with Automatic HLS Conversion
const uploadVideo = async (req, res) => {
    try {
        const { courseId, playlistId, title, description, duration, orderIndex, videoUrl: clientVideoUrl, thumbnailUrl: clientThumbnailUrl, notesUrl: clientNotesUrl } = req.body;

        // Files are handled by uploadMiddleware as req.files
        const videoFile = req.files && req.files['video'] ? req.files['video'][0] : null;
        const thumbnailFile = req.files && req.files['thumbnail'] ? req.files['thumbnail'][0] : null;
        const notesFile = req.files && req.files['notes'] ? req.files['notes'][0] : null;

        if (!videoFile && !clientVideoUrl) {
            return res.status(400).json({ message: "No video file or URL provided" });
        }

        if (!playlistId) {
            return res.status(400).json({ message: "playlistId is required" });
        }

        // Check if course exists
        const [course] = await pool.query("SELECT id FROM courses WHERE id = ?", [courseId]);
        if (course.length === 0) {
            return res.status(404).json({ message: "Course not found" });
        }

        // Check if playlist exists and belongs to the course
        const [playlist] = await pool.query(
            "SELECT id FROM playlists WHERE id = ? AND course_id = ?",
            [playlistId, courseId]
        );
        if (playlist.length === 0) {
            return res.status(404).json({ message: "Playlist not found or doesn't belong to this course" });
        }

        // Upload thumbnail and notes immediately
        let thumbnailUrl = thumbnailFile ? await uploadToS3(thumbnailFile) : clientThumbnailUrl;
        let notesUrl = notesFile ? await uploadToS3(notesFile) : clientNotesUrl;

        // Handle video upload
        let videoUrl = clientVideoUrl;
        let originalVideoUrl = null;
        let conversionStatus = 'skipped'; // Default for URL-based videos

        if (videoFile) {
            // Check if video is already HLS format
            const isHLS = videoFile.originalname.endsWith('.m3u8');

            if (isHLS) {
                // Upload HLS file directly
                videoUrl = await uploadToS3(videoFile);
                conversionStatus = 'skipped';
            } else {
                // MP4 video - needs HLS conversion
                // First, upload original MP4 as backup
                originalVideoUrl = await uploadToS3(videoFile);
                videoUrl = originalVideoUrl; // Temporarily use MP4 URL
                conversionStatus = 'pending';
            }
        } else if (clientVideoUrl && clientVideoUrl.toLowerCase().includes('.mp4')) {
            // ADMIN PROVIDED A DIRECT MP4 URL - ENFORCE CONVERSION
            // We'll treat the client URL as the 'original' source
            originalVideoUrl = clientVideoUrl;
            videoUrl = clientVideoUrl;
            conversionStatus = 'pending';
        }

        // Save metadata to MySQL
        const [result] = await pool.query(
            "INSERT INTO course_videos (course_id, playlist_id, title, description, video_url, original_video_url, thumbnail, notes_pdf, duration, order_index, conversion_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [courseId, playlistId, title, description || null, videoUrl, originalVideoUrl, thumbnailUrl, notesUrl, duration || '00:00', orderIndex || 0, conversionStatus]
        );

        const videoId = result.insertId;

        // Start HLS conversion in background (non-blocking)
        if (conversionStatus === 'pending') {
            console.log(`[Upload Video] Starting background HLS conversion for video ID: ${videoId}`);

            // If we have a file buffer, use it. If not (URL provided), convertVideoToHLS will need to handle it.
            if (videoFile) {
                convertVideoToHLS(videoId, videoFile.buffer, videoFile.originalname).catch(err => {
                    console.error(`[Upload Video] Background conversion failed for video ${videoId}:`, err);
                });
            } else if (clientVideoUrl) {
                // Trigger conversion from URL
                convertVideoURLToHLS(videoId, clientVideoUrl, 'video').catch(err => {
                    console.error(`[Upload Video URL] Background conversion failed for video ${videoId}:`, err);
                });
            }
        }

        res.status(201).json({
            message: "Video uploaded successfully" + (conversionStatus === 'pending' ? '. HLS conversion in progress.' : ''),
            videoId,
            videoUrl,
            thumbnailUrl,
            notesUrl,
            conversionStatus
        });

    } catch (error) {
        console.error("Video Upload Error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Background HLS Conversion Function for Course Intro Videos
const convertCourseIntroToHLS = async (courseId, videoBuffer, originalFilename) => {
    try {
        // Update status to 'processing'
        await pool.query(
            "UPDATE courses SET video_conversion_status = 'processing' WHERE id = ?",
            [courseId]
        );

        console.log(`[HLS Conversion] Starting intro conversion for course ${courseId}`);

        // Convert and upload to S3
        const playlistUrl = await processVideoToHLS(videoBuffer, originalFilename, courseId, 'course');

        console.log(`[HLS Conversion] Intro conversion complete for course ${courseId}. Playlist URL: ${playlistUrl}`);

        // Update database with HLS URL
        await pool.query(
            "UPDATE courses SET video_url = ?, video_conversion_status = 'completed' WHERE id = ?",
            [playlistUrl, courseId]
        );

        console.log(`[HLS Conversion] Course ${courseId} intro database updated`);

    } catch (error) {
        console.error(`[HLS Conversion] Error converting intro for course ${courseId}:`, error);

        // Update status to 'failed'
        await pool.query(
            "UPDATE courses SET video_conversion_status = 'failed' WHERE id = ?",
            [courseId]
        );
    }
};

// Background HLS Conversion Function for Lesson Videos
const convertVideoToHLS = async (videoId, videoBuffer, originalFilename) => {
    try {
        // Update status to 'processing'
        await pool.query(
            "UPDATE course_videos SET conversion_status = 'processing' WHERE id = ?",
            [videoId]
        );

        console.log(`[HLS Conversion] Starting lesson conversion for video ${videoId}`);

        // Convert and upload to S3
        const playlistUrl = await processVideoToHLS(videoBuffer, originalFilename, videoId, 'video');

        console.log(`[HLS Conversion] Lesson conversion complete for video ${videoId}. Playlist URL: ${playlistUrl}`);

        // Update database with HLS URL
        await pool.query(
            "UPDATE course_videos SET video_url = ?, conversion_status = 'completed' WHERE id = ?",
            [playlistUrl, videoId]
        );

        console.log(`[HLS Conversion] Video ${videoId} database updated`);

    } catch (error) {
        console.error(`[HLS Conversion] Error converting lesson video ${videoId}:`, error);

        // Update status to 'failed'
        await pool.query(
            "UPDATE course_videos SET conversion_status = 'failed' WHERE id = ?",
            [videoId]
        );
    }
};

// Background HLS Conversion Function for Remote Video URLs
const convertVideoURLToHLS = async (targetId, videoUrl, targetType = 'video') => {
    try {
        console.log(`[HLS URL Conversion] Starting conversion for ${targetType} ID: ${targetId} from URL: ${videoUrl}`);

        // Update status to 'processing'
        if (targetType === 'course') {
            await pool.query("UPDATE courses SET video_conversion_status = 'processing' WHERE id = ?", [targetId]);
        } else {
            await pool.query("UPDATE course_videos SET conversion_status = 'processing' WHERE id = ?", [targetId]);
        }

        // Download video bytes
        const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        const filename = videoUrl.split('/').pop() || 'input.mp4';

        // Process to HLS
        const playlistUrl = await processVideoToHLS(buffer, filename, targetId, targetType);

        // Update database
        if (targetType === 'course') {
            await pool.query(
                "UPDATE courses SET video_url = ?, original_video_url = IFNULL(original_video_url, ?), video_conversion_status = 'completed' WHERE id = ?",
                [playlistUrl, videoUrl, targetId]
            );
        } else {
            await pool.query(
                "UPDATE course_videos SET video_url = ?, original_video_url = IFNULL(original_video_url, ?), conversion_status = 'completed' WHERE id = ?",
                [playlistUrl, videoUrl, targetId]
            );
        }

        console.log(`[HLS URL Conversion] Successfully converted ${targetType} ${targetId} to HLS`);

    } catch (error) {
        console.error(`[HLS URL Conversion] Error converting ${targetType} ${targetId}:`, error);

        // Update status to 'failed'
        if (targetType === 'course') {
            await pool.query("UPDATE courses SET video_conversion_status = 'failed' WHERE id = ?", [targetId]);
        } else {
            await pool.query("UPDATE course_videos SET conversion_status = 'failed' WHERE id = ?", [targetId]);
        }
    }
};

// Get Course Videos
const getCourseVideos = async (req, res) => {
    try {
        const { courseId } = req.params;

        const [videos] = await pool.query(
            `SELECT v.*, (SELECT COUNT(*) FROM quizzes q WHERE q.video_id = v.id) as hasQuiz 
             FROM course_videos v 
             WHERE v.course_id = ?`,
            [courseId]
        );

        const signedVideos = videos.map(v => ({
            ...v,
            video_url: signS3Url(v.video_url),
            hasQuiz: v.hasQuiz > 0
        }));

        res.status(200).json({ videos: signedVideos });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};


// Get All Courses
const getAllCourses = async (req, res) => {
    try {
        const { role } = req.query; // Admin can pass ?role=admin to see drafts
        let query = `
            SELECT c.*, 
            (SELECT COUNT(*) FROM quizzes q JOIN course_videos v ON q.video_id = v.id WHERE v.course_id = c.id) as quizCount 
            FROM courses c
        `;

        if (role !== 'admin') {
            query += " WHERE c.status = 'published'";
        }

        query += " ORDER BY c.created_at DESC";

        const [courses] = await pool.query(query);

        const coursesWithStatus = courses.map(c => ({
            ...c,
            hasQuizzes: parseInt(c.quizCount || 0) > 0
        }));

        res.status(200).json({ courses: coursesWithStatus });
    } catch (error) {
        console.error("Error fetching courses:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Publish / Hide Course
const publishCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'published' or 'draft'

        if (!['published', 'draft'].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        const [result] = await pool.query("UPDATE courses SET status = ? WHERE id = ?", [status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Course not found" });
        }

        res.status(200).json({ message: `Course ${status === 'published' ? 'published' : 'moved to draft'} successfully` });
    } catch (error) {
        console.error("Publish Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Update Course
const updateCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, price, category, thumbnailUrl: clientThumbnailUrl, videoUrl: clientVideoUrl, notesUrl: clientNotesUrl } = req.body;

        const [existing] = await pool.query("SELECT * FROM courses WHERE id = ?", [id]);
        if (existing.length === 0) return res.status(404).json({ message: "Course not found" });

        const course = existing[0];
        let thumbnailUrl = clientThumbnailUrl || course.thumbnail;
        let videoUrl = clientVideoUrl || course.video_url;
        let notesUrl = clientNotesUrl || course.notes_pdf;

        let originalVideoUrl = course.original_video_url;
        let conversionStatus = course.video_conversion_status;

        if (req.files && req.files['thumbnail']) {
            await deleteFromS3(course.thumbnail);
            thumbnailUrl = await uploadToS3(req.files['thumbnail'][0]);
        }

        if (req.files && req.files['video']) {
            const videoFile = req.files['video'][0];
            const isHLS = videoFile.originalname.endsWith('.m3u8');

            // Cleanup old files
            await deleteFromS3(course.video_url);
            await deleteFromS3(course.original_video_url);

            if (isHLS) {
                videoUrl = await uploadToS3(videoFile);
                conversionStatus = 'skipped';
                originalVideoUrl = null;
            } else {
                // MP4 - needs conversion
                originalVideoUrl = await uploadToS3(videoFile);
                videoUrl = originalVideoUrl; // Temporary
                conversionStatus = 'pending';
            }
        } else if (clientVideoUrl && clientVideoUrl !== course.video_url && clientVideoUrl.toLowerCase().includes('.mp4')) {
            // New direct MP4 URL provided
            originalVideoUrl = clientVideoUrl;
            videoUrl = clientVideoUrl;
            conversionStatus = 'pending';
        }

        if (req.files && req.files['notes']) {
            await deleteFromS3(course.notes_pdf);
            notesUrl = await uploadToS3(req.files['notes'][0]);
        }

        await pool.query(
            "UPDATE courses SET title = ?, description = ?, price = ?, thumbnail = ?, category = ?, video_url = ?, notes_pdf = ?, video_conversion_status = ?, original_video_url = ? WHERE id = ?",
            [title || course.title, description || course.description, price || course.price, thumbnailUrl, category || course.category, videoUrl, notesUrl, conversionStatus, originalVideoUrl, id]
        );

        // Start background conversion if needed
        if (conversionStatus === 'pending' && (!course.video_url || videoUrl !== course.video_url || originalVideoUrl !== course.original_video_url)) {
            console.log(`[Update Course] Starting background HLS conversion for course ${id}`);
            if (req.files && req.files['video']) {
                convertCourseIntroToHLS(id, req.files['video'][0].buffer, req.files['video'][0].originalname).catch(err => {
                    console.error(`[Update Course] Background conversion failed for course ${id}:`, err);
                });
            } else if (clientVideoUrl) {
                convertVideoURLToHLS(id, clientVideoUrl, 'course').catch(err => {
                    console.error(`[Update Course URL] Background conversion failed for course ${id}:`, err);
                });
            }
        }

        res.status(200).json({ message: "Course updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};

// Delete Course
const deleteCourse = async (req, res) => {
    try {
        const { id } = req.params;

        const [course] = await pool.query("SELECT thumbnail, video_url, notes_pdf FROM courses WHERE id = ?", [id]);
        if (course.length === 0) return res.status(404).json({ message: "Course not found" });

        // Fetch all videos to delete their files from S3
        const [videos] = await pool.query("SELECT video_url, thumbnail, notes_pdf FROM course_videos WHERE course_id = ?", [id]);

        // Cleanup Course files
        await deleteFromS3(course[0].thumbnail);
        await deleteFromS3(course[0].video_url);
        await deleteFromS3(course[0].notes_pdf);

        // Cleanup Video files
        for (const video of videos) {
            await deleteFromS3(video.video_url);
            await deleteFromS3(video.thumbnail);
            await deleteFromS3(video.notes_pdf);
        }

        await pool.query("DELETE FROM courses WHERE id = ?", [id]);
        res.status(200).json({ message: "Course and all associated content deleted" });
    } catch (error) {
        console.error("Delete Course Error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Update Video
const updateVideo = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, duration, playlistId, videoUrl: clientVideoUrl, thumbnailUrl: clientThumbnailUrl, notesUrl: clientNotesUrl } = req.body;

        const [existing] = await pool.query("SELECT * FROM course_videos WHERE id = ?", [id]);
        if (existing.length === 0) return res.status(404).json({ message: "Video not found" });

        const video = existing[0];
        let videoUrl = clientVideoUrl || video.video_url;
        let thumbnailUrl = clientThumbnailUrl || video.thumbnail;
        let notesUrl = clientNotesUrl || video.notes_pdf;

        let originalVideoUrl = video.original_video_url;
        let conversionStatus = video.conversion_status;

        if (req.files && req.files['video']) {
            const videoFile = req.files['video'][0];
            const isHLS = videoFile.originalname.endsWith('.m3u8');

            // Cleanup old files
            await deleteFromS3(video.video_url);
            await deleteFromS3(video.original_video_url);

            if (isHLS) {
                videoUrl = await uploadToS3(videoFile);
                conversionStatus = 'skipped';
                originalVideoUrl = null;
            } else {
                originalVideoUrl = await uploadToS3(videoFile);
                videoUrl = originalVideoUrl;
                conversionStatus = 'pending';
            }
        }

        if (req.files && req.files['thumbnail']) {
            await deleteFromS3(video.thumbnail);
            thumbnailUrl = await uploadToS3(req.files['thumbnail'][0]);
        }

        if (req.files && req.files['notes']) {
            await deleteFromS3(video.notes_pdf);
            notesUrl = await uploadToS3(req.files['notes'][0]);
        }

        await pool.query(
            "UPDATE course_videos SET title = ?, description = ?, video_url = ?, thumbnail = ?, notes_pdf = ?, duration = ?, playlist_id = ?, conversion_status = ?, original_video_url = ? WHERE id = ?",
            [title || video.title, description || video.description, videoUrl, thumbnailUrl, notesUrl, duration || video.duration, playlistId || video.playlist_id, conversionStatus, originalVideoUrl, id]
        );

        // Start background conversion if needed
        if (req.files && req.files['video'] && conversionStatus === 'pending') {
            console.log(`[Update Video] Starting background HLS conversion for video ID: ${id}`);
            convertVideoToHLS(id, req.files['video'][0].buffer, req.files['video'][0].originalname).catch(err => {
                console.error(`[Update Video] Background conversion failed for video ${id}:`, err);
            });
        }

        res.status(200).json({ message: "Video updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};

// Delete Video
const deleteVideo = async (req, res) => {
    try {
        const { id } = req.params;

        const [video] = await pool.query("SELECT video_url, thumbnail, notes_pdf FROM course_videos WHERE id = ?", [id]);
        if (video.length === 0) return res.status(404).json({ message: "Video not found" });

        await deleteFromS3(video[0].video_url);
        await deleteFromS3(video[0].thumbnail);
        await deleteFromS3(video[0].notes_pdf);

        await pool.query("DELETE FROM course_videos WHERE id = ?", [id]);
        res.status(200).json({ message: "Video deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};

// Generate S3 Presigned URL for direct client upload
const generatePresignedUrl = async (req, res) => {
    try {
        const { fileName, fileType } = req.query;

        if (!fileName || !fileType) {
            return res.status(400).json({ message: "fileName and fileType are required" });
        }

        const fileKey = `${S3_FOLDER}${Date.now()}_${fileName}`;

        const params = {
            Bucket: BUCKET_NAME,
            Key: fileKey,
            Expires: 600, // URL valid for 10 minutes
            ContentType: fileType || 'application/octet-stream',
        };

        const uploadUrl = await s3.getSignedUrlPromise('putObject', params);
        console.log("=== Generated V4 Presigned URL ===");
        console.log(uploadUrl);

        res.status(200).json({
            uploadUrl,
            fileKey,
            publicUrl: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileKey}`
        });
    } catch (error) {
        console.error("Presigned URL Error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get Single Course by ID (with playlists and videos)
const getCourseById = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch course details
        const [courses] = await pool.query("SELECT * FROM courses WHERE id = ?", [id]);

        if (courses.length === 0) {
            return res.status(404).json({ message: "Course not found" });
        }

        const course = { ...courses[0] };
        course.video_url = signS3Url(course.video_url);

        // Fetch playlists for this course
        const [playlists] = await pool.query(
            "SELECT * FROM playlists WHERE course_id = ? ORDER BY order_index ASC, created_at ASC",
            [id]
        );

        // For each playlist, fetch its videos
        const playlistsWithVideos = await Promise.all(
            playlists.map(async (p) => {
                const [videos] = await pool.query(
                    `SELECT v.*, (SELECT COUNT(*) FROM quizzes q WHERE q.video_id = v.id) as hasQuiz 
                     FROM course_videos v 
                     WHERE v.playlist_id = ? 
                     ORDER BY v.order_index ASC, v.created_at ASC`,
                    [p.id]
                );

                // Sign video URLs
                const signedVideos = videos.map(v => ({
                    ...v,
                    video_url: signS3Url(v.video_url),
                    hasQuiz: parseInt(v.hasQuiz || 0) > 0
                }));


                return {
                    ...p,
                    videos: signedVideos
                };
            })
        );


        // Also fetch videos without playlists (legacy support)
        const [orphanedVideosResult] = await pool.query(
            `SELECT v.*, (SELECT COUNT(*) FROM quizzes q WHERE q.video_id = v.id) as hasQuiz 
             FROM course_videos v 
             WHERE v.course_id = ? AND v.playlist_id IS NULL 
             ORDER BY v.created_at ASC`,
            [id]
        );

        const orphanedVideos = orphanedVideosResult.map(v => ({
            ...v,
            video_url: signS3Url(v.video_url),
            hasQuiz: parseInt(v.hasQuiz) > 0
        }));

        res.status(200).json({
            course,
            playlists: playlistsWithVideos,
            orphanedVideos: orphanedVideos.length > 0 ? orphanedVideos : undefined
        });

    } catch (error) {
        console.error("Error fetching course details:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Secure HLS Manifest Proxy (Resolves Mixed Content issues)
const getManifest = async (req, res) => {
    const { targetType, targetId } = req.params;

    try {
        const videoIdentifier = `${targetType}_${targetId}`;
        const s3Key = `videos/hls/${videoIdentifier}/playlist.dat`;
        const params = {
            Bucket: BUCKET_NAME,
            Key: s3Key
        };

        const data = await s3.getObject(params).promise();
        let manifest = data.Body.toString();

        // 🛡️ PROTOCOL AWARENESS: Force HTTPS in production to prevent mixed content
        const host = req.get('host');
        const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
        const protocol = isLocal ? 'http' : 'https';

        const baseUrl = `${protocol}://${host}/api`;
        const keyUrl = `${baseUrl}/videos/key/${targetType}/${targetId}`;

        // 1. Replace the encryption key URI (More robust regex)
        manifest = manifest.replace(/URI="([^"]*)"/g, `URI="${keyUrl}"`);

        // 2. Resolve relative segment filenames to absolute S3 URLs
        const s3BaseUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/videos/hls/${videoIdentifier}`;

        // Process line by line for maximum safety against \r\n
        const lines = manifest.split(/\r?\n/);
        const transformedLines = lines.map(line => {
            const trimmedLine = line.trim();
            // If line is a segment (not a tag, and ends with .bin)
            if (trimmedLine && !trimmedLine.startsWith('#') && trimmedLine.endsWith('.bin')) {
                return `${s3BaseUrl}/${trimmedLine}`;
            }
            return line;
        });

        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.send(transformedLines.join('\n'));
    } catch (error) {
        console.error(`[Manifest Proxy] Error:`, error);
        res.status(500).send('Manifest unavailable');
    }
};

// Get Conversion Status for a Video
const getConversionStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const [videos] = await pool.query(
            "SELECT id, title, conversion_status, video_url FROM course_videos WHERE id = ?",
            [id]
        );

        if (videos.length === 0) {
            return res.status(404).json({ message: "Video not found" });
        }

        res.status(200).json({
            videoId: videos[0].id,
            title: videos[0].title,
            conversionStatus: videos[0].conversion_status,
            videoUrl: videos[0].video_url,
            isHLS: videos[0].video_url?.includes('.m3u8') || false
        });
    } catch (error) {
        console.error("Error fetching conversion status:", error);
        res.status(500).json({ message: "Server error" });
    }
};


// Secure Encryption Key Delivery
const getEncryptionKey = async (req, res) => {
    const { targetType, targetId } = req.params;

    try {
        console.log(`[Key Delivery] Fetching key for ${targetType} ID: ${targetId}`);

        // Construct S3 path for the key
        const s3Key = `videos/hls/${targetType}_${targetId}/video.key`;

        const params = {
            Bucket: BUCKET_NAME,
            Key: s3Key
        };

        // Fetch from S3
        const data = await s3.getObject(params).promise();

        // Send binary key (16 bytes)
        res.set('Content-Type', 'application/octet-stream');
        res.send(data.Body);

    } catch (error) {
        console.error(`[Key Delivery] Error fetching key for ${targetId}:`, error);
        if (error.code === 'NoSuchKey') {
            return res.status(404).send('Key not found');
        }
        res.status(500).send('Internal Server Error');
    }
};

module.exports = {
    createCourse,
    updateCourse,
    deleteCourse,
    publishCourse,
    uploadVideo,
    updateVideo,
    deleteVideo,
    getCourseVideos,
    getAllCourses,
    getCourseById,
    generatePresignedUrl,
    getConversionStatus,
    getEncryptionKey,
    getManifest,
    uploadMiddleware,
    signS3Url // Exported for use in other controllers
};
