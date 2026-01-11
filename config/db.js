


// const { Pool } = require("pg");
// require("dotenv").config();

// const pool = new Pool({
  // user: "default",
  // host: "ep-noisy-hall-a4a9kfy3-pooler.us-east-1.aws.neon.tech",
  // database: "verceldb",
  // password: "Ba7oTXuyE8iY",
  // port: 5432,
//   ssl: {
//     rejectUnauthorized: false,
//   },
// });

// // Log connection status
// pool.connect()
//   .then(() => console.log("Connected to PostgreSQL"))
//   .catch((err) => console.error("Connection error", err));

// module.exports = pool;


const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: "default",
  host: "ep-noisy-hall-a4a9kfy3-pooler.us-east-1.aws.neon.tech",
  database: "verceldb",
  password: "Ba7oTXuyE8iY",
  port: 5432,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Log connection status
pool.connect()
  .then(() => console.log("Connected to PostgreSQL"))
  .catch((err) => console.error("Connection error", err));

module.exports = pool;
