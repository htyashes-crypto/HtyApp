const path = require("node:path");
const fs = require("node:fs");
const { execSync } = require("node:child_process");

const CONFIG_FILE = "deepseek-config.json";

const ENV_VARS = [
  { name: "ANTHROPIC_BASE_URL", default: "https://api.deepseek.com/anthropic" },
  { name: "ANTHROPIC_AUTH_TOKEN", default: "" },
  { name: "ANTHROPIC_MODEL", default: "deepseek-v4-pro[1m]" },
  { name: "ANTHROPIC_DEFAULT_OPUS_MODEL", default: "deepseek-v4-pro" },
  { name: "ANTHROPIC_DEFAULT_SONNET_MODEL", default: "deepseek-v4-pro" },
  { name: "ANTHROPIC_DEFAULT_HAIKU_MODEL", default: "deepseek-v4-flash" },
  { name: "CLAUDE_CODE_SUBAGENT_MODEL", default: "deepseek-v4-pro" },
  { name: "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", default: "1" },
  { name: "CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK", default: "1" },
  { name: "CLAUDE_CODE_EFFORT_LEVEL", default: "max" }
];

function escapePS(arg) {
  return arg.replace(/'/g, "''");
}

function buildSetCommands(vars) {
  return vars.map(([n, v]) =>
    `[Environment]::SetEnvironmentVariable('${escapePS(n)}', '${escapePS(v)}', 'User')`
  ).join("; ");
}

function runPSScript(script) {
  if (process.platform !== "win32") return "";
  const stdout = execSync(
    `powershell -NoProfile -Command "${script}"`,
    { windowsHide: true, timeout: 30000 }
  );
  return stdout.toString("utf-8");
}

function buildRestoreCommands(names, previousEnv) {
  return names.map(n => {
    const escapedName = escapePS(n);
    if (Object.prototype.hasOwnProperty.call(previousEnv, n)) {
      return `[Environment]::SetEnvironmentVariable('${escapedName}', '${escapePS(previousEnv[n])}', 'User')`;
    }
    return `[Environment]::SetEnvironmentVariable('${escapedName}', $null, 'User')`;
  }).join("; ");
}

function readUserEnvVars(names) {
  if (process.platform !== "win32") return {};
  const parts = ["$result = @{}"];
  for (const name of names) {
    const n = escapePS(name);
    parts.push(
      `$v = [Environment]::GetEnvironmentVariable('${n}', 'User'); if ($null -ne $v) { $result['${n}'] = $v }`
    );
  }
  parts.push("$result | ConvertTo-Json -Compress");
  const stdout = runPSScript(parts.join("; ")).trim();
  if (!stdout || stdout === "null") return {};
  try {
    return JSON.parse(stdout);
  } catch {
    return {};
  }
}

function createDeepseekService({ appDataDir }) {
  return new DeepseekService(appDataDir);
}

class DeepseekService {
  constructor(appDataDir) {
    this.configPath = path.join(appDataDir, CONFIG_FILE);
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
      }
    } catch (err) {
      console.error("[DeepseekService] Failed to load config:", err);
    }
    return {
      apiKey: "",
      baseUrl: "https://api.deepseek.com/anthropic",
      model: "deepseek-v4-pro[1m]",
      opusModel: "deepseek-v4-pro",
      sonnetModel: "deepseek-v4-pro",
      haikuModel: "deepseek-v4-flash",
      subagentModel: "deepseek-v4-pro",
      enabled: false,
      previousEnv: {}
    };
  }

  saveConfigFile(config) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf-8");
    } catch (err) {
      console.error("[DeepseekService] Failed to save config:", err);
      throw err;
    }
  }

  getConfig() {
    return this.loadConfig();
  }

  saveConfig(args) {
    const config = this.loadConfig();
    if (args.apiKey !== undefined) config.apiKey = args.apiKey;
    if (args.baseUrl !== undefined) config.baseUrl = args.baseUrl;
    if (args.model !== undefined) config.model = args.model;
    if (args.opusModel !== undefined) config.opusModel = args.opusModel;
    if (args.sonnetModel !== undefined) config.sonnetModel = args.sonnetModel;
    if (args.haikuModel !== undefined) config.haikuModel = args.haikuModel;
    if (args.subagentModel !== undefined) config.subagentModel = args.subagentModel;
    this.saveConfigFile(config);
    return config;
  }

  enable() {
    const config = this.loadConfig();
    if (!config.apiKey) {
      throw new Error("请先设置 API Key");
    }

    const names = ENV_VARS.map(e => e.name);

    if (!config.enabled) {
      config.previousEnv = readUserEnvVars(names);
    }

    const vars = [
      ["ANTHROPIC_BASE_URL", config.baseUrl || "https://api.deepseek.com/anthropic"],
      ["ANTHROPIC_AUTH_TOKEN", config.apiKey],
      ["ANTHROPIC_MODEL", config.model || "deepseek-v4-pro[1m]"],
      ["ANTHROPIC_DEFAULT_OPUS_MODEL", config.opusModel || "deepseek-v4-pro"],
      ["ANTHROPIC_DEFAULT_SONNET_MODEL", config.sonnetModel || "deepseek-v4-pro"],
      ["ANTHROPIC_DEFAULT_HAIKU_MODEL", config.haikuModel || "deepseek-v4-flash"],
      ["CLAUDE_CODE_SUBAGENT_MODEL", config.subagentModel || "deepseek-v4-pro"],
      ["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1"],
      ["CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK", "1"],
      ["CLAUDE_CODE_EFFORT_LEVEL", "max"]
    ];

    runPSScript(buildSetCommands(vars));

    config.enabled = true;
    this.saveConfigFile(config);
    return { enabled: true };
  }

  disable() {
    const names = ENV_VARS.map(e => e.name);
    const config = this.loadConfig();
    const previousEnv = config.previousEnv || {};

    runPSScript(buildRestoreCommands(names, previousEnv));

    config.previousEnv = {};
    config.enabled = false;
    this.saveConfigFile(config);
    return { enabled: false };
  }

  invoke(command, args = {}) {
    switch (command) {
      case "deepseek_get_config":
        return this.getConfig();
      case "deepseek_save_config":
        return this.saveConfig(args);
      case "deepseek_enable":
        return this.enable();
      case "deepseek_disable":
        return this.disable();
      default:
        throw new Error(`unknown deepseek command: ${command}`);
    }
  }
}

module.exports = { createDeepseekService, ENV_VARS };
