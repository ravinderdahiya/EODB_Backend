import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FRONTEND_CONFIG_KEYS = [
  "VITE_HSAC_ORIGIN",
  "VITE_HSAC_DEV_PROXY",
  "VITE_HSAC_MAP_SERVICE_PATH",
  "VITE_HSAC_DOTNET_PROXY_URL",
  "VITE_ASMX_BASE_PATH",
  "VITE_ARCGIS_API_KEY",
  "VITE_ARCGIS_GEOCODER_URL",
  "VITE_HARYANA_BOUNDARY_URL",
  "VITE_HSACGGM_ASSETS_URL",
  "VITE_NHAI_ROADS_URL",
  "VITE_HARYANA_ROADS_URL",
];

// ✅ Create new API URL
export const createApiUrl = async (req, res) => {
  try {
    const { name, url, description, category } = req.body;

    if (!name || !url) {
      return res.status(400).json({ 
        error: "Name and URL are required" 
      });
    }

    const apiUrl = await prisma.apiUrl.create({
      data: {
        name,
        url,
        description: description || null,
        category: category || null,
        isActive: true,
      },
    });

    res.status(201).json({
      message: "API URL created successfully",
      data: apiUrl,
    });
  } catch (error) {
    console.error("❌ Error creating API URL:", error.message);
    res.status(500).json({ error: "Failed to create API URL" });
  }
};

// ✅ Get all API URLs
export const getAllApiUrls = async (req, res) => {
  try {
    const { category, active } = req.query;

    const where = {};
    
    if (category) {
      where.category = category;
    }
    
    if (active !== undefined) {
      where.isActive = active === "true";
    }

    const apiUrls = await prisma.apiUrl.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      message: "API URLs fetched successfully",
      count: apiUrls.length,
      data: apiUrls,
    });
  } catch (error) {
    console.error("❌ Error fetching API URLs:", error.message);
    res.status(500).json({ error: "Failed to fetch API URLs" });
  }
};

// ✅ Get single API URL by ID
export const getApiUrlById = async (req, res) => {
  try {
    const { id } = req.params;

    const apiUrl = await prisma.apiUrl.findUnique({
      where: { id: parseInt(id) },
    });

    if (!apiUrl) {
      return res.status(404).json({ error: "API URL not found" });
    }

    res.json({
      message: "API URL fetched successfully",
      data: apiUrl,
    });
  } catch (error) {
    console.error("❌ Error fetching API URL:", error.message);
    res.status(500).json({ error: "Failed to fetch API URL" });
  }
};

// ✅ Update API URL
export const updateApiUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, description, category, isActive } = req.body;

    const existing = await prisma.apiUrl.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existing) {
      return res.status(404).json({ error: "API URL not found" });
    }

    const apiUrl = await prisma.apiUrl.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name }),
        ...(url && { url }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({
      message: "API URL updated successfully",
      data: apiUrl,
    });
  } catch (error) {
    console.error("❌ Error updating API URL:", error.message);
    res.status(500).json({ error: "Failed to update API URL" });
  }
};

// ✅ Delete API URL
export const deleteApiUrl = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.apiUrl.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existing) {
      return res.status(404).json({ error: "API URL not found" });
    }

    await prisma.apiUrl.delete({
      where: { id: parseInt(id) },
    });

    res.json({
      message: "API URL deleted successfully",
    });
  } catch (error) {
    console.error("❌ Error deleting API URL:", error.message);
    res.status(500).json({ error: "Failed to delete API URL" });
  }
};

// ✅ Toggle API URL active status
export const toggleApiUrlStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.apiUrl.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existing) {
      return res.status(404).json({ error: "API URL not found" });
    }

    const apiUrl = await prisma.apiUrl.update({
      where: { id: parseInt(id) },
      data: {
        isActive: !existing.isActive,
      },
    });

    res.json({
      message: `API URL ${apiUrl.isActive ? "activated" : "deactivated"} successfully`,
      data: apiUrl,
    });
  } catch (error) {
    console.error("❌ Error toggling API URL status:", error.message);
    res.status(500).json({ error: "Failed to toggle API URL status" });
  }
};

// ✅ Get all unique categories
export const getCategories = async (req, res) => {
  try {
    const categories = await prisma.apiUrl.findMany({
      select: { category: true },
      distinct: ["category"],
      where: {
        category: { not: null },
      },
    });

    res.json({
      message: "Categories fetched successfully",
      data: categories.map((c) => c.category).filter(Boolean),
    });
  } catch (error) {
    console.error("❌ Error fetching categories:", error.message);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
};

export const getFrontendRuntimeConfig = async (req, res) => {
  try {
    const entries = await prisma.apiUrl.findMany({
      where: {
        name: { in: FRONTEND_CONFIG_KEYS },
        isActive: true,
      },
      select: {
        name: true,
        url: true,
      },
    });

    const config = {};
    for (const key of FRONTEND_CONFIG_KEYS) {
      config[key] = process.env[key] || "";
    }

    for (const item of entries) {
      config[item.name] = item.url;
    }

    res.json({
      message: "Frontend runtime config fetched successfully",
      data: config,
    });
  } catch (error) {
    console.error("Error fetching frontend runtime config:", error.message);
    res.status(500).json({ error: "Failed to fetch frontend runtime config" });
  }
};
