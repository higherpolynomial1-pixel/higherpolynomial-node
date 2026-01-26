const pool = require("../config/awsDb");
const AWS = require("aws-sdk");
const multer = require("multer");

// AWS Configuration
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
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

// Create a new course
const createCourse = async (req, res) => {
    try {
        const { title, description, price, category, createdBy } = req.body;

        let thumbnailUrl = null;
        let videoUrl = null;
        let notesUrl = null;

        if (req.files && req.files['thumbnail']) {
            thumbnailUrl = await uploadToS3(req.files['thumbnail'][0]);
        }

        if (req.files && req.files['video']) {
            videoUrl = await uploadToS3(req.files['video'][0]);
        }

        if (req.files && req.files['notes']) {
            notesUrl = await uploadToS3(req.files['notes'][0]);
        }

        const [result] = await pool.query(
            "INSERT INTO courses (title, description, price, thumbnail, category, video_url, notes_pdf, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [title, description, price, thumbnailUrl, category, videoUrl, notesUrl, createdBy]
        );

        res.status(201).json({
            message: "Course created",
            courseId: result.insertId,
            urls: { thumbnail: thumbnailUrl, video: videoUrl, notes: notesUrl }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Admin Upload Video
const uploadVideo = async (req, res) => {
    try {
        const { courseId, playlistId, title, description, duration, orderIndex } = req.body;

        // Files are handled by uploadMiddleware as req.files
        const videoFile = req.files && req.files['video'] ? req.files['video'][0] : null;
        const thumbnailFile = req.files && req.files['thumbnail'] ? req.files['thumbnail'][0] : null;
        const notesFile = req.files && req.files['notes'] ? req.files['notes'][0] : null;

        if (!videoFile) {
            return res.status(400).json({ message: "No video file provided" });
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

        // Upload all provided files to S3
        let videoUrl = await uploadToS3(videoFile);
        let thumbnailUrl = thumbnailFile ? await uploadToS3(thumbnailFile) : null;
        let notesUrl = notesFile ? await uploadToS3(notesFile) : null;

        // Save metadata to MySQL with playlist_id and new fields
        await pool.query(
            "INSERT INTO course_videos (course_id, playlist_id, title, description, video_url, thumbnail, notes_pdf, duration, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [courseId, playlistId, title, description || null, videoUrl, thumbnailUrl, notesUrl, duration || '00:00', orderIndex || 0]
        );

        res.status(201).json({
            message: "Video uploaded successfully",
            videoUrl,
            thumbnailUrl,
            notesUrl
        });

    } catch (error) {
        console.error("Video Upload Error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get Course Videos
const getCourseVideos = async (req, res) => {
    try {
        const { courseId } = req.params;

        const [videos] = await pool.query(
            "SELECT * FROM course_videos WHERE course_id = ?",
            [courseId]
        );

        res.status(200).json({ videos });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};

// Get All Courses
const getAllCourses = async (req, res) => {
    try {
        const { role } = req.query; // Admin can pass ?role=admin to see drafts
        let query = "SELECT * FROM courses";

        if (role !== 'admin') {
            query += " WHERE status = 'published'";
        }

        query += " ORDER BY created_at DESC";

        const [courses] = await pool.query(query);
        res.status(200).json({ courses });
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
        const { title, description, price, category } = req.body;

        const [existing] = await pool.query("SELECT * FROM courses WHERE id = ?", [id]);
        if (existing.length === 0) return res.status(404).json({ message: "Course not found" });

        const course = existing[0];
        let thumbnailUrl = course.thumbnail;
        let videoUrl = course.video_url;
        let notesUrl = course.notes_pdf;

        if (req.files && req.files['thumbnail']) {
            await deleteFromS3(course.thumbnail);
            thumbnailUrl = await uploadToS3(req.files['thumbnail'][0]);
        }

        if (req.files && req.files['video']) {
            await deleteFromS3(course.video_url);
            videoUrl = await uploadToS3(req.files['video'][0]);
        }

        if (req.files && req.files['notes']) {
            await deleteFromS3(course.notes_pdf);
            notesUrl = await uploadToS3(req.files['notes'][0]);
        }

        await pool.query(
            "UPDATE courses SET title = ?, description = ?, price = ?, thumbnail = ?, category = ?, video_url = ?, notes_pdf = ? WHERE id = ?",
            [title || course.title, description || course.description, price || course.price, thumbnailUrl, category || course.category, videoUrl, notesUrl, id]
        );

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
        const { title, description, duration, playlistId } = req.body;

        const [existing] = await pool.query("SELECT * FROM course_videos WHERE id = ?", [id]);
        if (existing.length === 0) return res.status(404).json({ message: "Video not found" });

        const video = existing[0];
        let videoUrl = video.video_url;
        let thumbnailUrl = video.thumbnail;
        let notesUrl = video.notes_pdf;

        if (req.files && req.files['video']) {
            await deleteFromS3(video.video_url);
            videoUrl = await uploadToS3(req.files['video'][0]);
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
            "UPDATE course_videos SET title = ?, description = ?, video_url = ?, thumbnail = ?, notes_pdf = ?, duration = ?, playlist_id = ? WHERE id = ?",
            [title || video.title, description || video.description, videoUrl, thumbnailUrl, notesUrl, duration || video.duration, playlistId || video.playlist_id, id]
        );

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

// Get Single Course by ID (with playlists and videos)
const getCourseById = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch course details
        const [courses] = await pool.query("SELECT * FROM courses WHERE id = ?", [id]);

        if (courses.length === 0) {
            return res.status(404).json({ message: "Course not found" });
        }

        const course = courses[0];

        // Fetch playlists for this course
        const [playlists] = await pool.query(
            "SELECT * FROM playlists WHERE course_id = ? ORDER BY order_index ASC, created_at ASC",
            [id]
        );

        // For each playlist, fetch its videos
        const playlistsWithVideos = await Promise.all(
            playlists.map(async (playlist) => {
                const [videos] = await pool.query(
                    "SELECT * FROM course_videos WHERE playlist_id = ? ORDER BY order_index ASC, created_at ASC",
                    [playlist.id]
                );
                return {
                    ...playlist,
                    videos
                };
            })
        );

        // Also fetch videos without playlists (legacy support)
        const [orphanedVideos] = await pool.query(
            "SELECT * FROM course_videos WHERE course_id = ? AND playlist_id IS NULL ORDER BY created_at ASC",
            [id]
        );

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
    uploadMiddleware
};
