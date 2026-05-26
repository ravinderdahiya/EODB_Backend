import { Prisma } from "@prisma/client";
import prisma from "../config/db.js";

const ADMIN_ROLES = new Set(["admin", "superadmin"]);

const normalizePhone = (value) => {
  const input = `${value || ""}`.trim();
  if (!input) return null;

  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && input.startsWith("+91")) return `+91${digits.slice(-10)}`;
  return null;
};

const toBooleanOrUndefined = (value) => {
  if (value === true || value === false) return value;
  if (typeof value !== "string") return undefined;
  const lower = value.trim().toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  return undefined;
};

const parseId = (value) => {
  const id = Number.parseInt(`${value || ""}`, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const mapVipRow = (row) => ({
  id: row.id,
  mobile: row.mobile,
  notes: row.notes,
  isActive: row.isActive,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const selectColumnsSql = Prisma.sql`
  id,
  mobile,
  notes,
  "isActive",
  "createdAt",
  "updatedAt"
`;

const getVipById = async (id) => {
  const rows = await prisma.$queryRaw`
    SELECT ${selectColumnsSql}
    FROM vip_users
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ? mapVipRow(rows[0]) : null;
};

const getVipByMobile = async (mobile) => {
  const rows = await prisma.$queryRaw`
    SELECT ${selectColumnsSql}
    FROM vip_users
    WHERE mobile = ${mobile}
    LIMIT 1
  `;
  return rows[0] ? mapVipRow(rows[0]) : null;
};

const getEffectiveRole = async (userId, fallbackRole = null) => {
  if (!userId) return `${fallbackRole || ""}`.toLowerCase().trim();

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  return `${dbUser?.role || fallbackRole || ""}`.toLowerCase().trim();
};

const ensureAdminAccess = async (req, res) => {
  if (!req.user?.id) {
    res.status(401).json({ message: "Authentication required" });
    return false;
  }

  const role = await getEffectiveRole(req.user.id, req.user.role);
  if (!ADMIN_ROLES.has(role)) {
    res.status(403).json({ message: "Access denied - admin role required" });
    return false;
  }

  return true;
};

export const createVipUser = async (req, res) => {
  try {
    const hasAccess = await ensureAdminAccess(req, res);
    if (!hasAccess) return;

    const mobile = normalizePhone(req.body?.mobile || req.body?.phone);
    if (!mobile) {
      return res.status(400).json({ message: "Valid mobile number is required" });
    }

    const existing = await getVipByMobile(mobile);
    if (existing) {
      return res.status(409).json({ message: "VIP number already exists" });
    }

    const notes = `${req.body?.notes || ""}`.trim() || null;
    const isActive = toBooleanOrUndefined(req.body?.isActive);

    const rows = await prisma.$queryRaw`
      INSERT INTO vip_users (mobile, notes, "isActive", "createdAt", "updatedAt")
      VALUES (${mobile}, ${notes}, ${isActive ?? true}, NOW(), NOW())
      RETURNING ${selectColumnsSql}
    `;

    return res.status(201).json({
      message: "VIP user created successfully",
      data: mapVipRow(rows[0]),
    });
  } catch (error) {
    console.error("Create VIP User Error:", error.message);
    return res.status(500).json({ message: "Unable to create VIP user" });
  }
};

export const getVipUsers = async (req, res) => {
  try {
    const hasAccess = await ensureAdminAccess(req, res);
    if (!hasAccess) return;

    const search = `${req.query?.search || ""}`.trim();
    const active = toBooleanOrUndefined(req.query?.active);

    const filters = [];
    if (active !== undefined) {
      filters.push(Prisma.sql`"isActive" = ${active}`);
    }

    if (search) {
      const like = `%${search}%`;
      filters.push(Prisma.sql`(mobile ILIKE ${like} OR COALESCE(notes, '') ILIKE ${like})`);
    }

    const whereSql = filters.length
      ? Prisma.sql`WHERE ${Prisma.join(filters, Prisma.sql` AND `)}`
      : Prisma.empty;

    const rows = await prisma.$queryRaw`
      SELECT ${selectColumnsSql}
      FROM vip_users
      ${whereSql}
      ORDER BY "createdAt" DESC
    `;

    const vipUsers = rows.map(mapVipRow);

    return res.json({
      message: "VIP users fetched successfully",
      count: vipUsers.length,
      data: vipUsers,
    });
  } catch (error) {
    console.error("Get VIP Users Error:", error.message);
    return res.status(500).json({ message: "Unable to fetch VIP users" });
  }
};

export const getVipUserById = async (req, res) => {
  try {
    const hasAccess = await ensureAdminAccess(req, res);
    if (!hasAccess) return;

    const id = parseId(req.params?.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid VIP user id" });
    }

    const vipUser = await getVipById(id);
    if (!vipUser) {
      return res.status(404).json({ message: "VIP user not found" });
    }

    return res.json({
      message: "VIP user fetched successfully",
      data: vipUser,
    });
  } catch (error) {
    console.error("Get VIP User Error:", error.message);
    return res.status(500).json({ message: "Unable to fetch VIP user" });
  }
};

export const updateVipUser = async (req, res) => {
  try {
    const hasAccess = await ensureAdminAccess(req, res);
    if (!hasAccess) return;

    const id = parseId(req.params?.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid VIP user id" });
    }

    const existing = await getVipById(id);
    if (!existing) {
      return res.status(404).json({ message: "VIP user not found" });
    }

    const nextMobileRaw = req.body?.mobile || req.body?.phone;
    const nextMobile = nextMobileRaw ? normalizePhone(nextMobileRaw) : undefined;
    if (nextMobileRaw && !nextMobile) {
      return res.status(400).json({ message: "Invalid mobile number format" });
    }

    const nextNotes = req.body?.notes;
    const nextIsActive = toBooleanOrUndefined(req.body?.isActive);

    if (nextMobile && nextMobile !== existing.mobile) {
      const duplicate = await getVipByMobile(nextMobile);
      if (duplicate) {
        return res.status(409).json({ message: "VIP number already exists" });
      }
    }

    const updatedMobile = nextMobile || existing.mobile;
    const updatedNotes = nextNotes !== undefined
      ? (`${nextNotes || ""}`.trim() || null)
      : existing.notes;
    const updatedIsActive = nextIsActive !== undefined ? nextIsActive : existing.isActive;

    const rows = await prisma.$queryRaw`
      UPDATE vip_users
      SET mobile = ${updatedMobile},
          notes = ${updatedNotes},
          "isActive" = ${updatedIsActive},
          "updatedAt" = NOW()
      WHERE id = ${id}
      RETURNING ${selectColumnsSql}
    `;

    return res.json({
      message: "VIP user updated successfully",
      data: mapVipRow(rows[0]),
    });
  } catch (error) {
    console.error("Update VIP User Error:", error.message);
    return res.status(500).json({ message: "Unable to update VIP user" });
  }
};

export const toggleVipUserStatus = async (req, res) => {
  try {
    const hasAccess = await ensureAdminAccess(req, res);
    if (!hasAccess) return;

    const id = parseId(req.params?.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid VIP user id" });
    }

    const existing = await getVipById(id);
    if (!existing) {
      return res.status(404).json({ message: "VIP user not found" });
    }

    const rows = await prisma.$queryRaw`
      UPDATE vip_users
      SET "isActive" = ${!existing.isActive},
          "updatedAt" = NOW()
      WHERE id = ${id}
      RETURNING ${selectColumnsSql}
    `;

    const vipUser = mapVipRow(rows[0]);
    return res.json({
      message: `VIP user ${vipUser.isActive ? "activated" : "deactivated"} successfully`,
      data: vipUser,
    });
  } catch (error) {
    console.error("Toggle VIP User Status Error:", error.message);
    return res.status(500).json({ message: "Unable to toggle VIP user status" });
  }
};

export const deleteVipUser = async (req, res) => {
  try {
    const hasAccess = await ensureAdminAccess(req, res);
    if (!hasAccess) return;

    const id = parseId(req.params?.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid VIP user id" });
    }

    const existing = await getVipById(id);
    if (!existing) {
      return res.status(404).json({ message: "VIP user not found" });
    }

    await prisma.$executeRaw`
      DELETE FROM vip_users
      WHERE id = ${id}
    `;

    return res.json({ message: "VIP user deleted successfully" });
  } catch (error) {
    console.error("Delete VIP User Error:", error.message);
    return res.status(500).json({ message: "Unable to delete VIP user" });
  }
};
