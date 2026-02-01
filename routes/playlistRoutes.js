const express = require("express");
const {
    createPlaylist,
    getCoursePlaylists,
    getPlaylistById,
    updatePlaylist,
    deletePlaylist
} = require("../controllers/playlistController");

const authMiddleware = require("../middleware/authMiddleware");

const playlistRouter = express.Router();

// Create a new playlist
playlistRouter.post("/playlists", authMiddleware, createPlaylist);

// Get all playlists for a specific course
playlistRouter.get("/courses/:courseId/playlists", authMiddleware, getCoursePlaylists);

// Get single playlist with videos
playlistRouter.get("/playlists/:id", authMiddleware, getPlaylistById);

// Update playlist
playlistRouter.put("/playlists/:id", authMiddleware, updatePlaylist);

// Delete playlist
playlistRouter.delete("/playlists/:id", authMiddleware, deletePlaylist);

module.exports = playlistRouter;
