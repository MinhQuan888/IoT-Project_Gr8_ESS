// database.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Kết nối hoặc tạo DB file
const db = new sqlite3.Database(path.join(__dirname, "iot_data.db"), (err) => {
  if (err) return console.error("Lỗi mở DB:", err);
  console.log("SQLite DB đã sẵn sàng!");
});

// Tạo bảng sensor_data (nếu chưa có)
db.run(`
  CREATE TABLE IF NOT EXISTS sensor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT,
    voltage TEXT,
    current TEXT,
    power TEXT,
    relay TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Tạo bảng settings để lưu ngưỡng
db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    voltageMin REAL DEFAULT 2,
    voltageMax REAL DEFAULT 5,
    current REAL DEFAULT 5
  )
`);

// Chèn giá trị mặc định nếu bảng trống
db.get("SELECT COUNT(*) AS count FROM settings", (err, row) => {
  if (err) return console.error("Lỗi truy vấn settings:", err);
  if (!row || row.count === 0) {
    db.run(`INSERT INTO settings (id, voltageMin, voltageMax, current) VALUES (1, 2, 5, 5)`);
    console.log("Đã tạo bản ghi mặc định trong settings.");
  }
});

module.exports = db;
