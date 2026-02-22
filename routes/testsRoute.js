const express = require('express');
const router = express.Router();
const testsController = require('../controllers/testsController');

// Admin routes
router.post('/quizzes', testsController.createOrUpdateQuiz);
router.delete('/quizzes/:id', testsController.deleteQuiz);

// User routes
router.get('/videos/:videoId/quiz', testsController.getQuizByVideoId);
router.post('/quizzes/submit', testsController.submitQuizAttempt);
router.get('/users/:userId/videos/:videoId/progress', testsController.getVideoProgress);

module.exports = router;
