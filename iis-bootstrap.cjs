// iisnode loads CommonJS entrypoints more reliably than ESM entrypoints.
// Keep backend source as ESM and bridge via dynamic import.
process.chdir(__dirname);

import("./src/server.js").catch((err) => {
  // Ensure startup errors are visible in iisnode diagnostics.
  console.error("FATAL: failed to import ESM server entrypoint:", err);
  process.exit(1);
});
