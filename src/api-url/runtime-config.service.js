export const UPSTREAM_CONFIG_KEYS = [
  "VITE_HSAC_ORIGIN",
  "VITE_HSAC_MAP_SERVICE_PATH",
  "VITE_HSAC_DOTNET_PROXY_URL",
  "VITE_ASMX_BASE_PATH",
  "VITE_ARCGIS_GEOCODER_URL",
  "VITE_HARYANA_BOUNDARY_URL",
  "VITE_HSACGGM_ASSETS_URL",
  "VITE_NHAI_ROADS_URL",
  "VITE_HARYANA_ROADS_URL",
  "VITE_ARCGIS_IMAGERY_URL",
  "VITE_ARCGIS_REFERENCE_URL",
  "VITE_ARCGIS_TOPO_URL",
  "VITE_ARCGIS_STREETS_URL",
  "VITE_OWNER_SEARCH_UPSTREAM_URL",
];

export const FRONTEND_LITERAL_KEYS = [
  "VITE_ARCGIS_API_KEY",
  "VITE_GA_MEASUREMENT_ID",
];

let ensurePromise = null;

function getUpstreamConfigDefaults() {
  return {
    VITE_HSAC_ORIGIN: process.env.HSAC_ORIGIN || "https://hsac.org.in",
    VITE_HSAC_MAP_SERVICE_PATH:
      process.env.HSAC_MAP_SERVICE_PATH || "/server/rest/services/EODB/EODB_HR23/MapServer",
    VITE_HSAC_DOTNET_PROXY_URL:
      process.env.HSAC_DOTNET_PROXY_URL ||
      process.env.VITE_HSAC_DOTNET_PROXY_URL ||
      "https://hsac.org.in/DotNet/proxy.ashx",
    VITE_ASMX_BASE_PATH: process.env.HSAC_ASMX_BASE_PATH || "/LandOwnerAPI/getownername.asmx",
    VITE_ARCGIS_GEOCODER_URL:
      "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer",
    VITE_HARYANA_BOUNDARY_URL:
      "https://services1.arcgis.com/qN3V93cYGMKQCOxL/arcgis/rest/services/HARYANA_BOUNDARY/FeatureServer/0",
    VITE_HSACGGM_ASSETS_URL:
      "https://hsacggm.in/server/rest/services/Onemap_Haryana/Government_Assets/MapServer",
    VITE_NHAI_ROADS_URL:
      "https://onemapggm.gmda.gov.in/server/rest/services/NHAI_All/MapServer",
    VITE_HARYANA_ROADS_URL:
      "https://hsacggm.in/server/rest/services/Onemap_Haryana/Haryana_Roads/MapServer",
    VITE_ARCGIS_IMAGERY_URL:
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
    VITE_ARCGIS_REFERENCE_URL:
      "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer",
    VITE_ARCGIS_TOPO_URL:
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer",
    VITE_ARCGIS_STREETS_URL:
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer",
    VITE_OWNER_SEARCH_UPSTREAM_URL:
      process.env.OWNER_API_ENDPOINT ||
      process.env.VITE_OWNER_SEARCH_UPSTREAM_URL ||
      "https://hsac.org.in/emissions/extract_land_record",
  };
}

function getRuntimeConfigSeedEntries() {
  const upstream = getUpstreamConfigDefaults();
  const entries = Object.entries(upstream).map(([name, url]) => ({
    name,
    url,
    description: `${name} runtime upstream configuration`,
    category: "upstream_runtime_config",
    isActive: true,
  }));

  entries.push({
    name: "VITE_ARCGIS_API_KEY",
    url: process.env.VITE_ARCGIS_API_KEY || "your_arcgis_api_key_here",
    description: "ArcGIS API key used by frontend",
    category: "frontend_runtime_config",
    isActive: Boolean(process.env.VITE_ARCGIS_API_KEY),
  });

  entries.push({
    name: "VITE_GA_MEASUREMENT_ID",
    url: process.env.VITE_GA_MEASUREMENT_ID || "G-9FFKJ7J9CL",
    description: "Google Analytics measurement id",
    category: "frontend_runtime_config",
    isActive: true,
  });

  return entries;
}

export async function ensureRuntimeConfigEntries(prisma, { force = false } = {}) {
  if (ensurePromise && !force) {
    return ensurePromise;
  }

  ensurePromise = (async () => {
    const seedEntries = getRuntimeConfigSeedEntries();
    const names = seedEntries.map((item) => item.name);

    const existing = await prisma.apiUrl.findMany({
      where: { name: { in: names } },
      select: { name: true },
    });

    const existingNames = new Set(existing.map((item) => item.name));
    const missingEntries = seedEntries.filter((item) => !existingNames.has(item.name));

    if (!missingEntries.length) {
      return { created: 0, total: seedEntries.length };
    }

    await prisma.$transaction(
      missingEntries.map((item) =>
        prisma.apiUrl.create({
          data: item,
        }),
      ),
    );

    return { created: missingEntries.length, total: seedEntries.length };
  })();

  return ensurePromise;
}
