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

function setEnvVar(name, value) {
  if (process.platform === "win32") {
    const escapedValue = value.replace(/"/g, '\\"');
    execSync(
      `powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('${name}', '${escapedValue}', 'User')"`,
      { windowsHide: true }
    );
  }
}

function deleteEnvVar(name) {
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('${name}', $null, 'User')"`,
      { windowsHide: true }
    );
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
      enabled: false
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

    const values = {
      ANTHROPIC_BASE_URL: config.baseUrl || "https://api.deepseek.com/anthropic",
      ANTHROPIC_AUTH_TOKEN: config.apiKey,
      ANTHROPIC_MODEL: config.model || "deepseek-v4-pro[1m]",
      ANTHROPIC_DEFAULT_OPUS_MODEL: config.opusModel || "deepseek-v4-pro",
      ANTHROPIC_DEFAULT_SONNET_MODEL: config.sonnetModel || "deepseek-v4-pro",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: config.haikuModel || "deepseek-v4-flash",
      CLAUDE_CODE_SUBAGENT_MODEL: config.subagentModel || "deepseek-v4-pro",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: "1",
      CLAUDE_CODE_EFFORT_LEVEL: "max"
    };

    for (const [name, value] of Object.entries(values)) {
      setEnvVar(name, value);
    }

    config.enabled = true;
    this.saveConfigFile(config);
    return { enabled: true };
  }

  disable() {
    for (const env of ENV_VARS) {
      deleteEnvVar(env.name);
    }

    const config = this.loadConfig();
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
