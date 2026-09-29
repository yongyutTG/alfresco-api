const { env: config } = require("../config/env");

//ฟังชันจัดการข้อมูลข้อผิดพลาดอย่างปลอดภัย
function safeErrorData(err) {
  const data = err.response?.data;
  if (!data) return err.message;
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data.status || data.message || data.exception) return data;
  return { message: err.message, contentType: err.response?.headers?.["content-type"] };
}
//ฟังชันจัดการข้อผิดพลาดและส่ง response กลับไปยัง client
function handleError(res, message, err) {
  const status = err.statusCode || err.response?.status || 500;
  const payload = { message, status };

  if (config.nodeEnv !== "production") {
    payload.error = safeErrorData(err);
  }

  res.status(status).json(payload);
}
//ฟังชันจัดการ route ที่ไม่พบ
function notFound(req, res) {
  res.status(404).json({ message: "Route not found" });
}

module.exports = {
  handleError,
  notFound,
  safeErrorData,
};
