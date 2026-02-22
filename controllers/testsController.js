const pool = require('../config/awsDb');

exports.createOrUpdateQuiz = async (req, res) => {
    const { videoId, title, questions } = req.body;

    if (!videoId || !questions || !Array.isArray(questions)) {
        return res.status(400).json({ message: "Invalid quiz data" });
    }

    try {
        // Check if quiz already exists for this video
        const [existing] = await pool.query('SELECT id FROM quizzes WHERE video_id = ?', [videoId]);
        let quizId;

        if (existing.length > 0) {
            quizId = existing[0].id;
            await pool.query('UPDATE quizzes SET title = ? WHERE id = ?', [title, quizId]);
            // Delete old questions
            await pool.query('DELETE FROM quiz_questions WHERE quiz_id = ?', [quizId]);
        } else {
            const [result] = await pool.query('INSERT INTO quizzes (video_id, title) VALUES (?, ?)', [videoId, title]);
            quizId = result.insertId;
        }

        // Insert new questions
        for (const q of questions) {
            await pool.query(
                'INSERT INTO quiz_questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [quizId, q.questionText, q.optionA, q.optionB, q.optionC, q.optionD, q.correctOption]
            );
        }

        res.status(200).json({ message: "Quiz saved successfully", quizId });
    } catch (error) {
        console.error("Error saving quiz:", error);
        res.status(500).json({ message: "Error saving quiz" });
    }
};

exports.getQuizByVideoId = async (req, res) => {
    const { videoId } = req.params;

    try {
        const [quizzes] = await pool.query('SELECT * FROM quizzes WHERE video_id = ?', [videoId]);
        if (quizzes.length === 0) {
            return res.status(404).json({ message: "No quiz found for this video" });
        }

        const quiz = quizzes[0];
        const [questions] = await pool.query('SELECT id, question_text as questionText, option_a as optionA, option_b as optionB, option_c as optionC, option_d as optionD, correct_option as correctOption FROM quiz_questions WHERE quiz_id = ?', [quiz.id]);

        res.status(200).json({ ...quiz, questions });
    } catch (error) {
        console.error("Error fetching quiz:", error);
        res.status(500).json({ message: "Error fetching quiz" });
    }
};

exports.submitQuizAttempt = async (req, res) => {
    const { quizId, userId, answers } = req.body; // answers is an object { questionId: 'A', ... }

    try {
        const [questions] = await pool.query('SELECT id, correct_option FROM quiz_questions WHERE quiz_id = ?', [quizId]);

        let correctCount = 0;
        const totalCount = questions.length;
        const results = [];

        for (const q of questions) {
            const isCorrect = answers[q.id] === q.correct_option;
            if (isCorrect) correctCount++;
            results.push({
                questionId: q.id,
                userAnswer: answers[q.id],
                correctAnswer: q.correct_option,
                isCorrect
            });
        }

        const score = Math.round((correctCount / totalCount) * 100);
        const isPassed = score >= 70; // 70% passing threshold

        // Record attempt
        await pool.query(
            'INSERT INTO user_quiz_attempts (user_id, quiz_id, score, is_passed) VALUES (?, ?, ?, ?)',
            [userId, quizId, score, isPassed]
        );

        if (isPassed) {
            // Update video progress
            const [quiz] = await pool.query('SELECT video_id FROM quizzes WHERE id = ?', [quizId]);
            const videoId = quiz[0].video_id;

            await pool.query(
                'INSERT INTO user_video_progress (user_id, video_id, is_completed) VALUES (?, ?, true) ON DUPLICATE KEY UPDATE is_completed = true, completed_at = CURRENT_TIMESTAMP',
                [userId, videoId]
            );
        }

        res.status(200).json({
            score,
            isPassed,
            correctCount,
            totalCount,
            results
        });
    } catch (error) {
        console.error("Error submitting quiz:", error);
        res.status(500).json({ message: "Error submitting quiz" });
    }
};

exports.getVideoProgress = async (req, res) => {
    const { userId, videoId } = req.params;

    try {
        const [progress] = await pool.query(
            'SELECT is_completed FROM user_video_progress WHERE user_id = ? AND video_id = ?',
            [userId, videoId]
        );

        res.status(200).json({
            isCompleted: progress.length > 0 ? progress[0].is_completed : false
        });
    } catch (error) {
        console.error("Error fetching progress:", error);
        res.status(500).json({ message: "Error fetching progress" });
    }
};

exports.deleteQuiz = async (req, res) => {
    const { id } = req.params;

    try {
        // Delete related questions first (FK should handle but being explicit)
        await pool.query('DELETE FROM quiz_questions WHERE quiz_id = ?', [id]);
        await pool.query('DELETE FROM quizzes WHERE id = ?', [id]);

        res.status(200).json({ message: "Quiz deleted successfully" });
    } catch (error) {
        console.error("Error deleting quiz:", error);
        res.status(500).json({ message: "Error deleting quiz" });
    }
};

