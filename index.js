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
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

const allowedOrigins = [
  "https://higherpolynomial.com",
  "https://www.higherpolynomial.com",
  "https://higherpolynomial-react.vercel.app",
  "https://higherpolynomial-node.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

// Manual CORS Middleware (Top-level)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Set the origin if it matches the whitelist, otherwise fallback safely
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Non-browser requests
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    // Other origins - still return one of ours to prevent blocking but warn
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  res.setHeader('Vary', 'Origin');

  // Handle Preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

app.use(bodyParser.json());

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
