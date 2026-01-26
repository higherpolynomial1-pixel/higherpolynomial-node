const express = require("express");
const {
    createPlaylist,
    getCoursePlaylists,
    getPlaylistById,
    updatePlaylist,
    deletePlaylist
} = require("../controllers/playlistController");

const playlistRouter = express.Router();

// Create a new playlist
playlistRouter.post("/playlists", createPlaylist);

// Get all playlists for a specific course
playlistRouter.get("/courses/:courseId/playlists", getCoursePlaylists);

// Get single playlist with videos
playlistRouter.get("/playlists/:id", getPlaylistById);

// Update playlist
playlistRouter.put("/playlists/:id", updatePlaylist);

// Delete playlist
playlistRouter.delete("/playlists/:id", deletePlaylist);

module.exports = playlistRouter;
