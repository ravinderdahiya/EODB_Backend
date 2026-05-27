const safeTrimmedString = (value, maxLength = 255) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

export const getRequestDeviceIdentity = (req) => {
  const body = req?.body || {};
  const headers = req?.headers || {};

  const deviceId =
    safeTrimmedString(body.deviceId, 120) ||
    safeTrimmedString(headers["x-device-id"], 120);

  const deviceImei =
    safeTrimmedString(body.deviceImei, 64) ||
    safeTrimmedString(body.imei, 64) ||
    safeTrimmedString(headers["x-device-imei"], 64);

  const deviceInfo =
    safeTrimmedString(body.deviceInfo, 500) ||
    safeTrimmedString(headers["x-device-info"], 500);

  return {
    deviceId,
    deviceImei,
    deviceInfo,
  };
};
