/* ==========================================
 IoT Bridge Server — CoAP (UDP) <-> WebSocket (TCP)
========================================== */
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const coap = require("coap");
const db = require("./database"); // Gọi DB
const app = express();
const httpPort = 3000;
const coapPort = 5683;

app.use(express.json());
app.use(express.static(path.join(__dirname, "web")));


// THÊM ĐOẠN NÀY NGAY SAU ĐÂY:
app.get("/api/settings", (req, res) => {
  db.get("SELECT * FROM settings ORDER BY id DESC LIMIT 1", (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || {}); // gửi về frontend
  });
});



// API lưu cài đặt mới từ Dashboard
app.post("/api/settings", (req, res) => {
  const { current, voltageMin, voltageMax } = req.body;

  if (isNaN(current) || isNaN(voltageMin) || isNaN(voltageMax)) {
    return res.status(400).json({ error: "Thông số không hợp lệ!" });
  }

  // Ghi vào DB
  db.run(
    "INSERT INTO settings (current, voltageMin, voltageMax) VALUES (?, ?, ?)",
    [current, voltageMin, voltageMax],
    function (err) {
      if (err) {
        console.error("Lỗi lưu settings:", err);
        return res.status(500).json({ error: err.message });
      }

      console.log("Đã lưu settings mới vào DB:", {
        current,
        voltageMin,
        voltageMax,
      });

      // Cập nhật lại thresholds đang dùng (để áp dụng ngay)
      thresholds = {
        current,
        voltageMin,
        voltageMax,
      };

      // Gửi thresholds mới cho tất cả dashboard đang mở
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "threshold_update",
              thresholds,
            })
          );
        }
      });

      res.json({ success: true });
    }
  );
});


let currentData = {
  device_id: "",
  voltage: 0,
  current: 0,
  power: 0,
  relay: "off"
};

// Biến thresholds mặc định (sẽ được cập nhật từ DB khi server khởi động)
let thresholds = {
  voltageMin: 2,
  voltageMax: 5,
  current: 5
};

// Đọc settings từ DB khi khởi động
db.get("SELECT * FROM settings ORDER BY id DESC LIMIT 1", (err, row) => {
  if (err) return console.error("Lỗi đọc settings:", err);
  if (row) {
    thresholds = {
      voltageMin: row.voltageMin,
      voltageMax: row.voltageMax,
      current: row.current
    };
    console.log("Thresholds tải từ DB:", thresholds);
  }
});

// ========================= HTTP + WebSocket =========================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("Dashboard connected");
  ws.send(JSON.stringify({ type: "init", data: currentData, thresholds }));

  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message);
      console.log("Từ Dashboard:", msg);

      // Điều khiển bật/tắt tải
      if (msg.command === "toggle_load" && esp32Ip) {
        const payload = msg.state.toLowerCase() === "on" ? "LED_ON" : "LED_OFF";
        const req = coap.request({
          host: esp32Ip,
          port: coapPort,
          pathname: "/control",
          method: "POST",
          confirmable: false,
        });
        req.write(payload);
        req.end();
        console.log(`Gửi CoAP đến ESP32 (${esp32Ip}): ${payload}`);
      }

      // Cập nhật threshold từ dashboard
      else if (msg.command === "update_threshold") {
        if (msg.voltageMin !== undefined) thresholds.voltageMin = msg.voltageMin;
        if (msg.voltageMax !== undefined) thresholds.voltageMax = msg.voltageMax;
        if (msg.current !== undefined) thresholds.current = msg.current;

        // Lưu vào  lần DB để sau vẫn còn
     db.run(
  `
  INSERT INTO settings (id, voltageMin, voltageMax, current)
  VALUES (1, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    voltageMin = excluded.voltageMin,
    voltageMax = excluded.voltageMax,
    current = excluded.current
  `,
    [thresholds.voltageMin, thresholds.voltageMax, thresholds.current],
    (err) => {
      if (err) console.error("Lỗi lưu settings:", err);
      else console.log("Đã lưu threshold mới:", thresholds);
    }
);

      }
    } catch (err) {
      console.error("Lỗi xử lý WS:", err);
    }
  });
});

// ========================= CoAP SERVER =========================
const coapServer = coap.createServer();
let esp32Ip = null;

coapServer.on("request", (req, res) => {
  const from = req.rsinfo?.address || "unknown";
  if ((req.method === "PUT" || req.method === "POST") && req.url === "/sensor/data") {
    try {
      const json = JSON.parse(req.payload.toString());
      esp32Ip = req.rsinfo.address;

      currentData = {
        device_id: json.d || json.device_id || "",
        voltage: parseFloat(json.v || json.voltage || 0),
        current: parseFloat(json.c || json.current || 0),
        power: parseFloat(json.p || json.power || 0),
        relay: "on"
      };

      console.log(`📡 Dữ liệu từ ${esp32Ip}:`, currentData);

      //Kiểm tra ngưỡng
      if (
        currentData.current >= thresholds.current ||
        currentData.voltage <= thresholds.voltageMin ||
        currentData.voltage >= thresholds.voltageMax
      ) {
        console.log("Vượt ngưỡng! → Gửi LED_OFF");
        const reqOff = coap.request({
          host: esp32Ip,
          port: coapPort,
          pathname: "/control",
          method: "POST",
          confirmable: false,
        });
        reqOff.write("LED_OFF");
        reqOff.end();
        currentData.relay = "off";
      }

      // Lưu DB
      db.run(
        `INSERT INTO sensor_data (device_id, voltage, current, power, relay)
         VALUES (?, ?, ?, ?, ?)`,
        [
          currentData.device_id,
          currentData.voltage,
          currentData.current,
          currentData.power,
          currentData.relay,
        ],
        (err) => {
          if (err) console.error("Lỗi lưu DB:", err);
        }
      );

      // Gửi realtime đến dashboard
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(currentData));
        }
      });

      res.end("OK");
    } catch (err) {
      console.error("Lỗi JSON:", err);
      res.code = "4.00";
      res.end("Invalid JSON");
    }
  } else {
    res.code = "4.04";
    res.end("Not found");
  }
});

// ========================= KHỞI ĐỘNG =========================
server.listen(httpPort, () =>
  console.log(`WebSocket + HTTP chạy tại: http://localhost:${httpPort}`)
);
coapServer.listen(coapPort, () =>
  console.log(`CoAP Server đang chạy tại cổng ${coapPort}`)
);
