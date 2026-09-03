const express = require("express");
const path = require("path");
const fs = require("fs");
const { PORT, HOST, PROFILE_DIR, DB_PATH } = require("./config");
const { lanUrls } = require("./lib/utils");
const { getDb } = require("./db");
const apiRoutes = require("./routes");

const app = express();
app.use(express.json());

// Initialize SQLite database schema
getDb();

// Mount API routes
app.use("/api", apiRoutes);

// Serve Client SPA (if built)
const dist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("[server unhandled error]", err);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`RecapApp aktif di http://localhost:${PORT}`);
  for (const ip of lanUrls()) {
    console.log(`  HP (Wi-Fi sama): http://${ip}:${PORT}`);
  }
  console.log(`Profil sesi: ${PROFILE_DIR} · DB: ${DB_PATH}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[PERINGATAN] Port ${PORT} sedang digunakan oleh proses lain!`);
    console.error(`- Matikan proses node lama yang masih aktif di background.`);
    console.error(`- Atau jalankan pada port lain: PORT=${PORT + 1} npm run serve\n`);
  } else {
    console.error("[Server listen error]", err);
  }
  process.exit(1);
});