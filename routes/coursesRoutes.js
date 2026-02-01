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
    uploadMiddleware
} = require("../controllers/coursesController");
const authMiddleware = require("../middleware/authMiddleware");

const coursesRouter = express.Router();

// Create a new course (with files)
coursesRouter.post("/courses", authMiddleware, uploadMiddleware, createCourse);

// Get all courses (Supports ?role=admin)
coursesRouter.get("/courses", getAllCourses);

// Get single course by ID
coursesRouter.get("/courses/:id", authMiddleware, getCourseById);

// Update Course
coursesRouter.put("/courses/:id", authMiddleware, uploadMiddleware, updateCourse);

// Delete Course
coursesRouter.delete("/courses/:id", authMiddleware, deleteCourse);

// Publish Course
coursesRouter.patch("/admin/courses/:id/publish", authMiddleware, publishCourse);

// Generate S3 Presigned URL
coursesRouter.get("/admin/generate-presigned-url", authMiddleware, generatePresignedUrl);

// Admin Upload Video (uses multer middleware)
coursesRouter.post("/admin/upload-video", authMiddleware, uploadMiddleware, uploadVideo);

// Update Video
coursesRouter.put("/admin/videos/:id", authMiddleware, uploadMiddleware, updateVideo);

// Delete Video
coursesRouter.delete("/admin/videos/:id", authMiddleware, deleteVideo);

// Get Videos for a Course
coursesRouter.get("/courses/:courseId/videos", authMiddleware, getCourseVideos);

module.exports = coursesRouter;
