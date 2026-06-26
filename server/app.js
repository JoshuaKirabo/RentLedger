"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
const { CLIENT_ROOT, SHARED_ROOT } = require("./config/paths");
const apiRoutes = require("./routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", apiRoutes);

app.get("/js/phone.js", (_req, res) => {
  res.sendFile(path.join(SHARED_ROOT, "phone.js"));
});

app.use(express.static(CLIENT_ROOT));

module.exports = app;
