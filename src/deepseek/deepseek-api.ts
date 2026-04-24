import { getDesktopBridge, isDesktopRuntime } from "../lib/desktop";

export interface DeepseekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  opusModel: string;
  sonnetModel: string;
  haikuModel: string;
  subagentModel: string;
  enabled: boolean;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = getDesktopBridge();
  if (!bridge) throw new Error("desktop runtime unavailable");
  return bridge.invoke<T>(command, args);
}

const mockConfig: DeepseekConfig = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com/anthropic",
  model: "deepseek-v4-pro[1m]",
  opusModel: "deepseek-v4-pro",
  sonnetModel: "deepseek-v4-pro",
  haikuModel: "deepseek-v4-flash",
  subagentModel: "deepseek-v4-pro",
  enabled: false
};

export const deepseekApi = {
  async getConfig(): Promise<DeepseekConfig> {
    return isDesktopRuntime()
      ? call<DeepseekConfig>("deepseek_get_config")
      : { ...mockConfig };
  },

  async saveConfig(config: Partial<DeepseekConfig>): Promise<DeepseekConfig> {
    return call<DeepseekConfig>("deepseek_save_config", config as Record<string, unknown>);
  },

  async enable(): Promise<{ enabled: boolean }> {
    return call<{ enabled: boolean }>("deepseek_enable");
  },

  async disable(): Promise<{ enabled: boolean }> {
    return call<{ enabled: boolean }>("deepseek_disable");
  }
};
