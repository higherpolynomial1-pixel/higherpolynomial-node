const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    user: "admin",
    host: "database-1.cyrkso46ad7j.us-east-1.rds.amazonaws.com",
    database: "higerpolynomial",
    password: "OFp5iOQDXeUYnE5hi9L7",
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

module.exports = pool;