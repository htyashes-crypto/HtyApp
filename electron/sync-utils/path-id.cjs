const crypto = require("node:crypto");
const path = require("node:path");

function buildPathId(p) {
  const normalized = normalizePath(p);
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

function normalizePath(p) {
  const full = path.resolve(p || "");
  return full.replace(/[\\/]+$/, "").toLowerCase();
}

module.exports = { buildPathId, normalizePath };
