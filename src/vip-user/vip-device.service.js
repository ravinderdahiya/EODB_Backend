import prisma from "../config/db.js";

const normalizeDeviceId = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : null;
};

const normalizeDeviceImei = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 64) : null;
};

let ensureColumnsPromise = null;

export const ensureVipDeviceColumns = async () => {
  if (ensureColumnsPromise) return ensureColumnsPromise;

  ensureColumnsPromise = (async () => {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE vip_users
      ADD COLUMN IF NOT EXISTS device_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS device_imei VARCHAR(64),
      ADD COLUMN IF NOT EXISTS device_label VARCHAR(150),
      ADD COLUMN IF NOT EXISTS device_info TEXT
    `);
  })();

  return ensureColumnsPromise;
};

export const normalizeVipDeviceInput = ({ deviceId, deviceImei, deviceLabel, deviceInfo } = {}) => ({
  deviceId: normalizeDeviceId(deviceId),
  deviceImei: normalizeDeviceImei(deviceImei),
  deviceLabel: typeof deviceLabel === "string" && deviceLabel.trim() ? deviceLabel.trim().slice(0, 150) : null,
  deviceInfo: typeof deviceInfo === "string" && deviceInfo.trim() ? deviceInfo.trim().slice(0, 500) : null,
});

export const isVipDeviceAuthorized = (vipRow, incomingIdentity = {}) => {
  const configuredDeviceId = normalizeDeviceId(vipRow?.deviceId || vipRow?.device_id);
  const configuredDeviceImei = normalizeDeviceImei(vipRow?.deviceImei || vipRow?.device_imei);

  const providedDeviceId = normalizeDeviceId(incomingIdentity?.deviceId);
  const providedDeviceImei = normalizeDeviceImei(incomingIdentity?.deviceImei);

  const hasConfiguredBinding = Boolean(configuredDeviceId || configuredDeviceImei);
  if (!hasConfiguredBinding) {
    return { ok: false, reason: "VIP device not configured" };
  }

  if (!providedDeviceId && !providedDeviceImei) {
    return { ok: false, reason: "Device identity missing in request" };
  }

  if (configuredDeviceImei && providedDeviceImei && configuredDeviceImei === providedDeviceImei) {
    return { ok: true };
  }

  if (configuredDeviceId && providedDeviceId && configuredDeviceId === providedDeviceId) {
    return { ok: true };
  }

  return { ok: false, reason: "Device mismatch for VIP user" };
};
