"use strict";

const app = require("./app");
const { open, close } = require("./db/connection");

function startServer(options = {}) {
  const port = options.port || process.env.PORT || 3000;
  const host = options.host || "127.0.0.1";

  open();

  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      console.log(`RentLedger running at http://${host}:${port}`);
      resolve({ port, host, server });
    });
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

module.exports = { app, startServer, close };
