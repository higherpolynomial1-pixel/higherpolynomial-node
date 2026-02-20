const express = require("express");
const {
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
    uploadMiddleware
} = require("../controllers/coursesController");
const authMiddleware = require("../middleware/authMiddleware");

const coursesRouter = express.Router();

// Create a new course (with files)
coursesRouter.post("/courses", uploadMiddleware, createCourse);

// Get all courses (Supports ?role=admin)
coursesRouter.get("/courses", getAllCourses);

// Get single course by ID
coursesRouter.get("/courses/:id", getCourseById);

// Update Course
coursesRouter.put("/courses/:id", uploadMiddleware, updateCourse);

// Delete Course
coursesRouter.delete("/courses/:id", deleteCourse);

// Publish Course
coursesRouter.patch("/admin/courses/:id/publish", publishCourse);

// Generate S3 Presigned URL
coursesRouter.get("/admin/generate-presigned-url", generatePresignedUrl);

// Admin Upload Video (uses multer middleware)
coursesRouter.post("/admin/upload-video", uploadMiddleware, uploadVideo);

// Update Video
coursesRouter.put("/admin/videos/:id", uploadMiddleware, updateVideo);

// Delete Video
coursesRouter.delete("/admin/videos/:id", deleteVideo);

// Get Videos for a Course
coursesRouter.get("/courses/:courseId/videos", getCourseVideos);

// Get Conversion Status for a Video
coursesRouter.get("/admin/videos/:id/conversion-status", getConversionStatus);

// Secure Encryption Key Delivery (proxied from S3)
coursesRouter.get("/videos/key/:targetType/:targetId", authMiddleware, getEncryptionKey);

// HLS Manifest Proxy (Resolves Mixed Content)
coursesRouter.get("/videos/manifest/:targetType/:targetId", authMiddleware, getManifest);

module.exports = coursesRouter;
