const mysql = require('mysql2');

const pool = mysql.createPool({
   host: 'database-2.c5gw3tlosw5e.us-east-2.rds.amazonaws.com',
  port: 3306,
  user: 'admin',
  password: 'admin123',
  database: 'smalempa',
});
module.exports = pool.promise();
