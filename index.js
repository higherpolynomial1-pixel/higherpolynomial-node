require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");


const userRouter = require("./routes/userRoutes");
const coursesRouter = require("./routes/coursesRoutes");
const playlistRouter = require("./routes/playlistRoutes");
const doubtRouter = require("./routes/doubtRoutes");
const testsRouter = require("./routes/testsRoute");
const counselingRouter = require("./routes/counselingRoutes");




// Initialize Express app
const app = express();
app.set('trust proxy', 1); // Enable trusting Vercel/proxies for correct protocol (HTTPS)
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
const allowedOrigins = [
  "https://higherpolynomial.com",
  "https://www.higherpolynomial.com",
  "https://higherpolynomial-react.vercel.app",
  "https://higherpolynomial-node.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        // Still allow for now to prevent blocking other environments, 
        // but log it for debugging
        console.warn(`CORS Warning: Origin ${origin} not in whitelist`);
        callback(null, true);
      }
    },
    credentials: true,
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

//doubt Routes
app.use("/api", doubtRouter);

//test/quiz Routes
app.use("/api", testsRouter);

//counseling Routes
app.use("/api", counselingRouter);

// Start the server (Only if not in Vercel environment)
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

module.exports = app;
