require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");


const userRouter = require("./routes/userRoutes");
const coursesRouter = require("./routes/coursesRoutes");
const playlistRouter = require("./routes/playlistRoutes");



// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/", (req, res) => {
  res.json({ message: "HigherPolynomia API is running" });
});

app.use("/api", userRouter);

//courses Routes
app.use("/api", coursesRouter);

//playlist Routes
app.use("/api", playlistRouter);

// Start the server (Only if not in Vercel environment)
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

module.exports = app;
