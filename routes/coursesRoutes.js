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
    uploadMiddleware
} = require("../controllers/coursesController");

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

// Admin Upload Video (uses multer middleware)
coursesRouter.post("/admin/upload-video", uploadMiddleware, uploadVideo);

// Update Video
coursesRouter.put("/admin/videos/:id", uploadMiddleware, updateVideo);

// Delete Video
coursesRouter.delete("/admin/videos/:id", deleteVideo);

// Get Videos for a Course
coursesRouter.get("/courses/:courseId/videos", getCourseVideos);

module.exports = coursesRouter;
