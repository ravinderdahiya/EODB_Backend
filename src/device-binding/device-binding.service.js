import { Prisma } from "@prisma/client";
import prisma from "../config/db.js";
import { getRequestDeviceIdentity } from "../utils/device-identity.utils.js";

const DEFAULT_BOUND_ROLES = ["cm", "director","vip"];
const DEVICE_BINDING_TABLE = "authorized_devices";

const parseRoleSet = () => {
  const raw = String(process.env.DEVICE_BINDING_ROLES || "").trim();
  if (!raw) return new Set(DEFAULT_BOUND_ROLES);

  const roles = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return new Set(roles.length ? roles : DEFAULT_BOUND_ROLES);
};

const DEVICE_BOUND_ROLE_SET = parseRoleSet();

const normalizeRole = (value) => String(value || "").trim().toLowerCase();

const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && String(value || "").trim().startsWith("+91")) return `+91${digits.slice(-10)}`;
  return String(value || "").trim() || null;
};

const buildMobileCandidates = (value) => {
  const normalized = normalizePhone(value);
  if (!normalized) return [];

  const candidates = new Set([normalized]);
  const digits = normalized.replace(/\D/g, "");
  if (digits.length >= 10) {
    candidates.add(digits.slice(-10));
  }
  return [...candidates];
};

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

const normalizeText = (value, maxLength = 255) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
};

let ensureTablePromise = null;

const ensureDeviceBindingTable = async () => {
  if (ensureTablePromise) return ensureTablePromise;

  ensureTablePromise = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${DEVICE_BINDING_TABLE} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES "User"(id) ON DELETE CASCADE,
        mobile VARCHAR(20),
        role VARCHAR(64) NOT NULL,
        device_id VARCHAR(120),
        device_imei VARCHAR(64),
        device_info TEXT,
        device_label VARCHAR(150),
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by INTEGER,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT authorized_devices_identifier_check CHECK (device_id IS NOT NULL OR device_imei IS NOT NULL)
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_authorized_devices_role_active
      ON ${DEVICE_BINDING_TABLE}(role, is_active);
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_authorized_devices_user
      ON ${DEVICE_BINDING_TABLE}(user_id);
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_authorized_devices_mobile
      ON ${DEVICE_BINDING_TABLE}(mobile);
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_authorized_devices_device
      ON ${DEVICE_BINDING_TABLE}(device_id, device_imei);
    `);
  })();

  return ensureTablePromise;
};

const mapBindingRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  mobile: row.mobile,
  role: row.role,
  deviceId: row.device_id,
  deviceImei: row.device_imei,
  deviceInfo: row.device_info,
  deviceLabel: row.device_label,
  notes: row.notes,
  isActive: row.is_active,
  createdBy: row.created_by,
  lastUsedAt: row.last_used_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getScopedRecordCount = async ({ userId, mobileCandidates = [], role }) => {
  const filters = [Prisma.sql`role = ${role}`, Prisma.sql`is_active = TRUE`];
  const scopeFilters = [];

  if (userId) scopeFilters.push(Prisma.sql`user_id = ${userId}`);
  if (mobileCandidates.length) {
    scopeFilters.push(Prisma.sql`mobile IN (${Prisma.join(mobileCandidates)})`);
  }

  if (scopeFilters.length) {
    filters.push(Prisma.sql`(${Prisma.join(scopeFilters, Prisma.sql` OR `)})`);
  } else {
    return 0;
  }

  const whereSql = Prisma.sql`WHERE ${Prisma.join(filters, Prisma.sql` AND `)}`;

  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM authorized_devices
    ${whereSql}
  `;

  return Number(rows?.[0]?.count || 0);
};

const getMatchingBindingRow = async ({
  userId,
  mobileCandidates = [],
  role,
  deviceId,
  deviceImei,
}) => {
  const filters = [Prisma.sql`role = ${role}`, Prisma.sql`is_active = TRUE`];
  const scopeFilters = [];

  if (userId) scopeFilters.push(Prisma.sql`user_id = ${userId}`);
  if (mobileCandidates.length) {
    scopeFilters.push(Prisma.sql`mobile IN (${Prisma.join(mobileCandidates)})`);
  }
  if (!scopeFilters.length) return null;

  filters.push(Prisma.sql`(${Prisma.join(scopeFilters, Prisma.sql` OR `)})`);

  const idFilters = [];
  if (deviceImei) idFilters.push(Prisma.sql`device_imei = ${deviceImei}`);
  if (deviceId) idFilters.push(Prisma.sql`device_id = ${deviceId}`);
  if (!idFilters.length) return null;

  filters.push(Prisma.sql`(${Prisma.join(idFilters, Prisma.sql` OR `)})`);

  const whereSql = Prisma.sql`WHERE ${Prisma.join(filters, Prisma.sql` AND `)}`;

  const rows = await prisma.$queryRaw`
    SELECT id, user_id, mobile, role, device_id, device_imei, device_info, device_label, notes, is_active, created_by, last_used_at, created_at, updated_at
    FROM authorized_devices
    ${whereSql}
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  return rows?.[0] ? mapBindingRow(rows[0]) : null;
};

const markBindingUsed = async (bindingId, deviceInfo = null) => {
  await prisma.$executeRaw`
    UPDATE authorized_devices
    SET
      last_used_at = NOW(),
      updated_at = NOW(),
      device_info = COALESCE(${deviceInfo}, device_info)
    WHERE id = ${bindingId}
  `;
};

const resolveUserContext = async ({ userId, mobile, role }) => {
  const normalizedRole = normalizeRole(role);
  const normalizedMobile = normalizePhone(mobile);
  let resolvedUser = null;

  if (userId) {
    resolvedUser = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { id: true, mobile: true, role: true },
    });
  } else if (normalizedMobile) {
    const mobileCandidates = buildMobileCandidates(normalizedMobile);
    if (mobileCandidates.length) {
      resolvedUser = await prisma.user.findFirst({
        where: {
          OR: mobileCandidates.map((candidate) => ({ mobile: candidate })),
        },
        select: { id: true, mobile: true, role: true },
      });
    }
  }

  const effectiveRole = normalizeRole(resolvedUser?.role || normalizedRole);
  return {
    role: effectiveRole,
    user: resolvedUser,
    mobile: normalizedMobile || resolvedUser?.mobile || null,
  };
};

export const getBoundRoles = () => [...DEVICE_BOUND_ROLE_SET];

export const isRoleDeviceBound = (role) => DEVICE_BOUND_ROLE_SET.has(normalizeRole(role));

export const enforceDeviceBindingForUser = async ({ req, res, user, mobile }) => {
  await ensureDeviceBindingTable();

  const role = normalizeRole(user?.role);
  if (!isRoleDeviceBound(role)) return true;

  const identity = getRequestDeviceIdentity(req);
  const deviceId = normalizeDeviceId(identity.deviceId);
  const deviceImei = normalizeDeviceImei(identity.deviceImei);
  const deviceInfo = normalizeText(identity.deviceInfo, 500);

  if (!deviceId && !deviceImei) {
    res.status(400).json({
      message: "Device identity required for this role",
      hint: "Provide deviceId or deviceImei in login payload",
    });
    return false;
  }

  const mobileCandidates = buildMobileCandidates(mobile || user?.mobile);
  const scopedCount = await getScopedRecordCount({
    userId: user?.id || null,
    mobileCandidates,
    role,
  });

  if (scopedCount === 0) {
    res.status(403).json({
      message: "No authorized device configured for this account",
      role,
    });
    return false;
  }

  const match = await getMatchingBindingRow({
    userId: user?.id || null,
    mobileCandidates,
    role,
    deviceId,
    deviceImei,
  });

  if (!match) {
    res.status(403).json({
      message: "This device is not authorized for portal access",
      role,
    });
    return false;
  }

  await markBindingUsed(match.id, deviceInfo);
  return true;
};

export const listAuthorizedDevices = async ({
  page = 1,
  pageSize = 20,
  search = "",
  role = "",
  active,
}) => {
  await ensureDeviceBindingTable();

  const currentPage = Math.max(Number(page) || 1, 1);
  const currentPageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const skip = (currentPage - 1) * currentPageSize;

  const filters = [];
  const normalizedSearch = normalizeText(search, 120);
  const normalizedRole = normalizeRole(role);

  if (normalizedRole) {
    filters.push(Prisma.sql`role = ${normalizedRole}`);
  }

  if (typeof active === "boolean") {
    filters.push(Prisma.sql`is_active = ${active}`);
  }

  if (normalizedSearch) {
    const like = `%${normalizedSearch}%`;
    filters.push(
      Prisma.sql`(
        COALESCE(device_label, '') ILIKE ${like}
        OR COALESCE(device_id, '') ILIKE ${like}
        OR COALESCE(device_imei, '') ILIKE ${like}
        OR COALESCE(mobile, '') ILIKE ${like}
        OR COALESCE(notes, '') ILIKE ${like}
      )`
    );
  }

  const whereSql = filters.length
    ? Prisma.sql`WHERE ${Prisma.join(filters, Prisma.sql` AND `)}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw`
    SELECT id, user_id, mobile, role, device_id, device_imei, device_info, device_label, notes, is_active, created_by, last_used_at, created_at, updated_at
    FROM authorized_devices
    ${whereSql}
    ORDER BY updated_at DESC
    OFFSET ${skip}
    LIMIT ${currentPageSize}
  `;

  const countRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM authorized_devices
    ${whereSql}
  `;

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows.map(mapBindingRow),
    pagination: {
      page: currentPage,
      pageSize: currentPageSize,
      total,
      totalPages: Math.max(Math.ceil(total / currentPageSize), 1),
    },
  };
};

export const createAuthorizedDevice = async ({
  userId,
  mobile,
  role,
  deviceId,
  deviceImei,
  deviceInfo,
  deviceLabel,
  notes,
  isActive = true,
  createdBy,
}) => {
  await ensureDeviceBindingTable();

  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const normalizedDeviceImei = normalizeDeviceImei(deviceImei);
  if (!normalizedDeviceId && !normalizedDeviceImei) {
    throw new Error("Either deviceId or deviceImei is required");
  }

  const context = await resolveUserContext({ userId, mobile, role });
  const normalizedRole = normalizeRole(context.role || role);

  if (!normalizedRole) {
    throw new Error("Role is required");
  }

  if (!isRoleDeviceBound(normalizedRole)) {
    throw new Error(`Role '${normalizedRole}' is not configured for device binding`);
  }

  const resolvedUserId = context.user?.id || (Number.isFinite(Number(userId)) ? Number(userId) : null);
  const resolvedMobile = context.mobile || null;

  const duplicateFilters = [
    Prisma.sql`role = ${normalizedRole}`,
    Prisma.sql`is_active = TRUE`,
  ];
  const scopeFilters = [];
  if (resolvedUserId) scopeFilters.push(Prisma.sql`user_id = ${resolvedUserId}`);
  const mobileCandidates = buildMobileCandidates(resolvedMobile);
  if (mobileCandidates.length) {
    scopeFilters.push(Prisma.sql`mobile IN (${Prisma.join(mobileCandidates)})`);
  }
  if (!scopeFilters.length) {
    throw new Error("Provide valid userId or mobile for device binding");
  }
  duplicateFilters.push(Prisma.sql`(${Prisma.join(scopeFilters, Prisma.sql` OR `)})`);

  const identityFilters = [];
  if (normalizedDeviceImei) identityFilters.push(Prisma.sql`device_imei = ${normalizedDeviceImei}`);
  if (normalizedDeviceId) identityFilters.push(Prisma.sql`device_id = ${normalizedDeviceId}`);
  duplicateFilters.push(Prisma.sql`(${Prisma.join(identityFilters, Prisma.sql` OR `)})`);

  const duplicateWhereSql = Prisma.sql`WHERE ${Prisma.join(duplicateFilters, Prisma.sql` AND `)}`;

  const existingRows = await prisma.$queryRaw`
    SELECT id
    FROM authorized_devices
    ${duplicateWhereSql}
    LIMIT 1
  `;

  if (existingRows.length) {
    throw new Error("Device binding already exists for this user/role");
  }

  const rows = await prisma.$queryRaw`
    INSERT INTO authorized_devices (
      user_id,
      mobile,
      role,
      device_id,
      device_imei,
      device_info,
      device_label,
      notes,
      is_active,
      created_by,
      created_at,
      updated_at
    )
    VALUES (
      ${resolvedUserId},
      ${resolvedMobile},
      ${normalizedRole},
      ${normalizedDeviceId},
      ${normalizedDeviceImei},
      ${normalizeText(deviceInfo, 500)},
      ${normalizeText(deviceLabel, 150)},
      ${normalizeText(notes, 1000)},
      ${Boolean(isActive)},
      ${createdBy ? Number(createdBy) : null},
      NOW(),
      NOW()
    )
    RETURNING id, user_id, mobile, role, device_id, device_imei, device_info, device_label, notes, is_active, created_by, last_used_at, created_at, updated_at
  `;

  return mapBindingRow(rows[0]);
};

export const toggleAuthorizedDevice = async (id) => {
  await ensureDeviceBindingTable();

  const deviceId = Number(id);
  if (!Number.isFinite(deviceId) || deviceId <= 0) {
    throw new Error("Invalid binding id");
  }

  const rows = await prisma.$queryRaw`
    UPDATE authorized_devices
    SET
      is_active = NOT is_active,
      updated_at = NOW()
    WHERE id = ${deviceId}
    RETURNING id, user_id, mobile, role, device_id, device_imei, device_info, device_label, notes, is_active, created_by, last_used_at, created_at, updated_at
  `;

  if (!rows.length) {
    throw new Error("Binding not found");
  }

  return mapBindingRow(rows[0]);
};

export const deleteAuthorizedDevice = async (id) => {
  await ensureDeviceBindingTable();

  const deviceId = Number(id);
  if (!Number.isFinite(deviceId) || deviceId <= 0) {
    throw new Error("Invalid binding id");
  }

  const rows = await prisma.$queryRaw`
    DELETE FROM authorized_devices
    WHERE id = ${deviceId}
    RETURNING id
  `;

  return rows.length > 0;
};
