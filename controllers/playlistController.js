const pool = require("../config/awsDb");

/**
 * Create a new playlist for a course
 */
const createPlaylist = async (req, res) => {
    try {
        const { courseId, title, description, orderIndex } = req.body;

        // Validate required fields
        if (!courseId || !title) {
            return res.status(400).json({
                message: "courseId and title are required"
            });
        }

        // Check if course exists
        const [course] = await pool.query(
            "SELECT id FROM courses WHERE id = ?",
            [courseId]
        );

        if (course.length === 0) {
            return res.status(404).json({ message: "Course not found" });
        }

        // Insert playlist
        const [result] = await pool.query(
            "INSERT INTO playlists (course_id, title, description, order_index) VALUES (?, ?, ?, ?)",
            [courseId, title, description || null, orderIndex || 0]
        );

        res.status(201).json({
            message: "Playlist created successfully",
            playlist: {
                id: result.insertId,
                courseId,
                title,
                description,
                orderIndex: orderIndex || 0
            }
        });
    } catch (error) {
        console.error("Error creating playlist:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * Get all playlists for a specific course
 */
const getCoursePlaylists = async (req, res) => {
    try {
        const { courseId } = req.params;

        const [playlists] = await pool.query(
            "SELECT * FROM playlists WHERE course_id = ? ORDER BY order_index ASC, created_at ASC",
            [courseId]
        );

        res.status(200).json({ playlists });
    } catch (error) {
        console.error("Error fetching playlists:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * Get a single playlist with its videos
 */
const getPlaylistById = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch playlist details
        const [playlists] = await pool.query(
            "SELECT * FROM playlists WHERE id = ?",
            [id]
        );

        if (playlists.length === 0) {
            return res.status(404).json({ message: "Playlist not found" });
        }

        const playlist = playlists[0];

        // Fetch videos in this playlist
        const [videos] = await pool.query(
            "SELECT * FROM course_videos WHERE playlist_id = ? ORDER BY order_index ASC, created_at ASC",
            [id]
        );

        res.status(200).json({
            playlist,
            videos
        });
    } catch (error) {
        console.error("Error fetching playlist:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * Update playlist details
 */
const updatePlaylist = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, orderIndex } = req.body;

        // Check if playlist exists
        const [existing] = await pool.query(
            "SELECT id FROM playlists WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: "Playlist not found" });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (title !== undefined) {
            updates.push("title = ?");
            values.push(title);
        }
        if (description !== undefined) {
            updates.push("description = ?");
            values.push(description);
        }
        if (orderIndex !== undefined) {
            updates.push("order_index = ?");
            values.push(orderIndex);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: "No fields to update" });
        }

        values.push(id);

        await pool.query(
            `UPDATE playlists SET ${updates.join(", ")} WHERE id = ?`,
            values
        );

        res.status(200).json({ message: "Playlist updated successfully" });
    } catch (error) {
        console.error("Error updating playlist:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * Delete a playlist (cascades to videos)
 */
const deletePlaylist = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.query(
            "DELETE FROM playlists WHERE id = ?",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Playlist not found" });
        }

        res.status(200).json({
            message: "Playlist deleted successfully (associated videos also removed)"
        });
    } catch (error) {
        console.error("Error deleting playlist:", error);
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = {
    createPlaylist,
    getCoursePlaylists,
    getPlaylistById,
    updatePlaylist,
    deletePlaylist
};
