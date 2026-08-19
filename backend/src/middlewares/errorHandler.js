function safeErrorData(err) {
  const data = err.response?.data;

  if (!data) {
    return err.message;
  }

  if (typeof data === "string") {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  if (data.status || data.message || data.exception) {
    return data;
  }

  return {
    message: err.message,
    contentType: err.response?.headers?.["content-type"],
  };
}

// รูปแบบกลางสำหรับตอบ error ทุก route
function handleError(res, message, err) {
  const status = err.response?.status || 500;

  res.status(status).json({
    message,
    status,
    error: safeErrorData(err),
  });
}

module.exports = {
  handleError,
};
