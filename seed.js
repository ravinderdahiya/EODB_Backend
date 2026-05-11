import prisma from "./src/config/db.js";
import bcrypt from "bcrypt";

async function upsertFrontendRuntimeUrls() {
  const frontendRuntimeUrls = [
    {
      name: "VITE_HSAC_ORIGIN",
      url: "https://hsac.org.in",
      description: "HSAC origin host used by frontend proxy and map services",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_HSAC_DEV_PROXY",
      url: "/hsac",
      description: "Vite dev proxy prefix rewriting to HSAC origin",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_HSAC_MAP_SERVICE_PATH",
      url: "/server/rest/services/EODB/EODB_HR23/MapServer",
      description: "MapServer service path appended to HSAC origin",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_HSAC_DOTNET_PROXY_URL",
      url: "http://hsac.org.in/DotNet/proxy.ashx",
      description: "HSAC DotNet proxy for ArcGIS authenticated requests",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_HSAC_DOTNET_PROXY_DEV_URL",
      url: "/__hsac_proxy__",
      description: "Local development proxy path used by frontend",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_ASMX_BASE_PATH",
      url: "/LandOwnerAPI/getownername.asmx",
      description: "Base ASMX path for land-record services",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_ARCGIS_API_KEY",
      url: "your_arcgis_api_key_here",
      description: "ArcGIS API key (replace with real key in production)",
      category: "frontend_runtime_config",
      isActive: false,
    },
    {
      name: "VITE_ARCGIS_GEOCODER_URL",
      url: "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer",
      description: "ArcGIS world geocoder endpoint",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_ARCGIS_IMAGERY_URL",
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
      description: "ArcGIS imagery basemap service",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_ARCGIS_REFERENCE_URL",
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer",
      description: "ArcGIS reference labels service for hybrid basemap",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_ARCGIS_TOPO_URL",
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer",
      description: "ArcGIS topographic basemap service",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_ARCGIS_STREETS_URL",
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer",
      description: "ArcGIS streets basemap service",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_HARYANA_BOUNDARY_URL",
      url: "https://services1.arcgis.com/qN3V93cYGMKQCOxL/arcgis/rest/services/HARYANA_BOUNDARY/FeatureServer/0",
      description: "Haryana boundary feature service",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_HSACGGM_ASSETS_URL",
      url: "https://hsacggm.in/server/rest/services/Onemap_Haryana/Government_Assets/MapServer",
      description: "HSACGGM government assets map service",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_NHAI_ROADS_URL",
      url: "https://onemapggm.gmda.gov.in/server/rest/services/NHAI_All/MapServer",
      description: "NHAI roads map service",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_HARYANA_ROADS_URL",
      url: "https://hsacggm.in/server/rest/services/Onemap_Haryana/Haryana_Roads/MapServer",
      description: "Haryana roads map service",
      category: "frontend_runtime_config",
      isActive: true,
    },
    {
      name: "VITE_GA_MEASUREMENT_ID",
      url: "G-9FFKJ7J9CL",
      description: "Google Analytics measurement ID used by frontend telemetry",
      category: "frontend_runtime_config",
      isActive: true,
    },
  ];

  for (const entry of frontendRuntimeUrls) {
    const existing = await prisma.apiUrl.findFirst({
      where: { name: entry.name },
    });

    if (existing) {
      await prisma.apiUrl.update({
        where: { id: existing.id },
        data: {
          url: entry.url,
          description: entry.description,
          category: entry.category,
          isActive: entry.isActive,
        },
      });
      console.log(`Updated config URL: ${entry.name}`);
    } else {
      await prisma.apiUrl.create({ data: entry });
      console.log(`Created config URL: ${entry.name}`);
    }
  }
}

async function main() {
  console.log("Starting seed...");

  const adminEmail = "admin@harsac.gov.in";
  const adminPassword = "admin123";
  const adminMobile = "9999999999";
  const adminFullname = "Super Admin";

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log("⚠️  Admin user already exists, updating...");
    
    // Update existing admin to superadmin role
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await prisma.user.update({
      where: { email: adminEmail },
      data: {
        password: hashedPassword,
        role: "superadmin",
        fullname: adminFullname,
        mobile: adminMobile,
      },
    });
    console.log("✅ Admin updated to superadmin role");
  } else {
    // Create new superadmin
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        fullname: adminFullname,
        email: adminEmail,
        password: hashedPassword,
        mobile: adminMobile,
        role: "superadmin",
      },
    });
    console.log("✅ Superadmin created successfully!");
  }

  // Create additional admin users if needed
  const adminUsers = [
    { email: "admin1@harsac.gov.in", fullname: "Admin One", password: "admin123", mobile: "8888888881" },
    { email: "admin2@harsac.gov.in", fullname: "Admin Two", password: "admin123", mobile: "8888888882" },
  ];

  for (const adminUser of adminUsers) {
    const existing = await prisma.user.findUnique({
      where: { email: adminUser.email },
    });

    if (!existing) {
      const hashedPassword = await bcrypt.hash(adminUser.password, 10);
      await prisma.user.create({
        data: {
          fullname: adminUser.fullname,
          email: adminUser.email,
          password: hashedPassword,
          mobile: adminUser.mobile,
          role: "admin",
        },
      });
      console.log(`✅ Admin user ${adminUser.email} created`);
    }
  }

  await upsertFrontendRuntimeUrls();
  console.log("Seed completed");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
