#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <coap-simple.h>
#include <ArduinoJson.h>

Adafruit_INA219 ina219;
WiFiUDP udp;
Coap coap(udp);

const char* ssid = "MiWa";
const char* password = "pumchiu123";
IPAddress serverIp(10, 81, 127, 149);// ip máy chạy server // Q: 240, T: 149 
const int serverPort = 5683;
const char* device_id = "ESP32";

unsigned long lastSend = 0;
unsigned long lastPrint = 0;

// ----------------------
// Callback cho CoAP /control
// ----------------------
void callback_control(CoapPacket &packet, IPAddress ip, int port) {
int len = packet.payloadlen;
char buf[32];
memset(buf, 0, sizeof(buf));
memcpy(buf, packet.payload, len > 31 ? 31 : len);
Serial.printf("Lệnh nhận: %s\n", buf);

if (strcmp(buf, "LED_ON") == 0) {
digitalWrite(5, HIGH);
Serial.println("LED bật");
} else if (strcmp(buf, "LED_OFF") == 0) {
digitalWrite(5, LOW);
Serial.println("LED tắt");
}
}

// ----------------------
// 2️⃣ Gửi dữ liệu an toàn (UDP không ACK)
// ----------------------
void safeSendCoAP() {
float busVoltage = ina219.getBusVoltage_V();
float current = ina219.getCurrent_mA();
float power = ina219.getPower_mW();

StaticJsonDocument<128> doc;
doc["device_id"] = device_id;
doc["voltage"] = busVoltage;
doc["current"] = current;
doc["power"] = power;

char payload[128];
serializeJson(doc, payload);

Serial.print("Gửi CoAP: ");
Serial.println(payload);

// Gửi gói tin, bắt lỗi tránh crash
bool ok = false;
for (int i = 0; i < 3 && !ok; i++) {
if (WiFi.status() == WL_CONNECTED) {
coap.put(serverIp, serverPort, "sensor/data", payload);
ok = true;
} else {
Serial.println("Mất Wi-Fi, thử lại...");
WiFi.reconnect();
delay(500);
}
}
}

// ----------------------
// Setup
// ----------------------
void setup() {
Serial.begin(115200);
pinMode(5, OUTPUT);
digitalWrite(5, HIGH);
Serial.printf("Kết nối Wi-Fi tới %s\n", ssid);
WiFi.begin(ssid, password);
int retry = 0;
while (WiFi.status() != WL_CONNECTED && retry < 30) {
delay(500);
Serial.print(".");
retry++;
}

if (WiFi.status() == WL_CONNECTED) {
Serial.println("\nWi-Fi connected");
//Serial.print("IP: ");
//Serial.println(WiFi.localIP());
} else {
Serial.println("\n Không thể kết nối Wi-Fi!");
}

ina219.begin();

// Khởi tạo CoAP
coap.server(callback_control, "control");
coap.start();
Serial.println("ESP32 sẵn sàng gửi CoAP");
}

// ----------------------
// Loop chính
// ----------------------
void loop() {
// chống crash coap.loop()
try {
coap.loop();
} catch (...) {
Serial.println(" Lỗi trong coap.loop(), bỏ qua.");
}

// gửi dữ liệu mỗi 2s
if (millis() - lastSend > 2000) {
safeSendCoAP();
lastSend = millis();
}


}
