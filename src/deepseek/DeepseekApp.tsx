import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldOff, Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { deepseekApi } from "./deepseek-api";
import { toast } from "../state/toast-store";

const ENV_VAR_LIST = [
  { name: "ANTHROPIC_BASE_URL", from: "baseUrl" },
  { name: "ANTHROPIC_AUTH_TOKEN", from: "apiKey", masked: true },
  { name: "ANTHROPIC_MODEL", from: "model" },
  { name: "ANTHROPIC_DEFAULT_OPUS_MODEL", from: "opusModel" },
  { name: "ANTHROPIC_DEFAULT_SONNET_MODEL", from: "sonnetModel" },
  { name: "ANTHROPIC_DEFAULT_HAIKU_MODEL", from: "haikuModel" },
  { name: "CLAUDE_CODE_SUBAGENT_MODEL", from: "subagentModel" },
  { name: "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", fixed: "1" },
  { name: "CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK", fixed: "1" },
  { name: "CLAUDE_CODE_EFFORT_LEVEL", fixed: "max" }
];

export function DeepseekApp() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com/anthropic");
  const [model, setModel] = useState("deepseek-v4-pro[1m]");
  const [opusModel, setOpusModel] = useState("deepseek-v4-pro");
  const [sonnetModel, setSonnetModel] = useState("deepseek-v4-pro");
  const [haikuModel, setHaikuModel] = useState("deepseek-v4-flash");
  const [subagentModel, setSubagentModel] = useState("deepseek-v4-pro");
  const [showKey, setShowKey] = useState(false);

  const configQuery = useQuery({
    queryKey: ["deepseek-config"],
    queryFn: deepseekApi.getConfig
  });

  useEffect(() => {
    if (configQuery.data) {
      const c = configQuery.data;
      setApiKey(c.apiKey || "");
      setBaseUrl(c.baseUrl || "https://api.deepseek.com/anthropic");
      setModel(c.model || "deepseek-v4-pro[1m]");
      setOpusModel(c.opusModel || "deepseek-v4-pro");
      setSonnetModel(c.sonnetModel || "deepseek-v4-pro");
      setHaikuModel(c.haikuModel || "deepseek-v4-flash");
      setSubagentModel(c.subagentModel || "deepseek-v4-pro");
    }
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      deepseekApi.saveConfig({
        apiKey,
        baseUrl,
        model,
        opusModel,
        sonnetModel,
        haikuModel,
        subagentModel
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deepseek-config"] });
      toast("success", t("deepseek.configSaved"));
    },
    onError: (err: Error) => {
      toast("error", `${t("deepseek.saveFailed")}: ${err.message}`);
    }
  });

  const enableMutation = useMutation({
    mutationFn: deepseekApi.enable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deepseek-config"] });
      toast("success", t("deepseek.enabled"));
    },
    onError: (err: Error) => {
      toast("error", `${t("deepseek.enableFailed")}: ${err.message}`);
    }
  });

  const disableMutation = useMutation({
    mutationFn: deepseekApi.disable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deepseek-config"] });
      toast("success", t("deepseek.disabled"));
    },
    onError: (err: Error) => {
      toast("error", `${t("deepseek.disableFailed")}: ${err.message}`);
    }
  });

  const enabled = configQuery.data?.enabled ?? false;
  const isSaving = saveMutation.isPending;
  const isToggling = enableMutation.isPending || disableMutation.isPending;

  function getEnvValue(env: (typeof ENV_VAR_LIST)[number]) {
    if ("fixed" in env) return env.fixed;
    const localValues: Record<string, string> = {
      baseUrl,
      apiKey,
      model,
      opusModel,
      sonnetModel,
      haikuModel,
      subagentModel
    };
    const val = localValues[env.from!];
    if (env.masked && val) return "****" + val.slice(-4);
    return val || "";
  }

  return (
    <div className="deepseek-app">
      <div className="deepseek-app__header">
        <h2 className="deepseek-app__title">{t("deepseek.title")}</h2>
        <p className="deepseek-app__desc">{t("deepseek.description")}</p>
      </div>

      <div className="deepseek-app__body">
        <div className="deepseek-card">
          <div className="deepseek-card__header">
            <h3>{t("deepseek.apiKey")}</h3>
          </div>
          <div className="deepseek-card__body">
            <div className="deepseek-field">
              <div className="deepseek-input-row">
                <input
                  type={showKey ? "text" : "password"}
                  className="deepseek-input deepseek-input--key"
                  placeholder={t("deepseek.apiKeyPlaceholder")}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <button
                  className="deepseek-btn-icon"
                  onClick={() => setShowKey(!showKey)}
                  type="button"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="deepseek-hint">{t("deepseek.apiKeyHint")}</p>
            </div>
          </div>
        </div>

        <div className="deepseek-card">
          <div className="deepseek-card__header">
            <h3>Endpoint & Models</h3>
          </div>
          <div className="deepseek-card__body deepseek-card__body--grid">
            <div className="deepseek-field">
              <label>{t("deepseek.baseUrl")}</label>
              <input
                className="deepseek-input"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
              <p className="deepseek-hint">{t("deepseek.baseUrlHint")}</p>
            </div>
            <div className="deepseek-field">
              <label>{t("deepseek.model")}</label>
              <input
                className="deepseek-input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <p className="deepseek-hint">{t("deepseek.modelHint")}</p>
            </div>
            <div className="deepseek-field">
              <label>{t("deepseek.opusModel")}</label>
              <input
                className="deepseek-input"
                value={opusModel}
                onChange={(e) => setOpusModel(e.target.value)}
              />
              <p className="deepseek-hint">{t("deepseek.opusModelHint")}</p>
            </div>
            <div className="deepseek-field">
              <label>{t("deepseek.sonnetModel")}</label>
              <input
                className="deepseek-input"
                value={sonnetModel}
                onChange={(e) => setSonnetModel(e.target.value)}
              />
              <p className="deepseek-hint">{t("deepseek.sonnetModelHint")}</p>
            </div>
            <div className="deepseek-field">
              <label>{t("deepseek.haikuModel")}</label>
              <input
                className="deepseek-input"
                value={haikuModel}
                onChange={(e) => setHaikuModel(e.target.value)}
              />
              <p className="deepseek-hint">{t("deepseek.haikuModelHint")}</p>
            </div>
            <div className="deepseek-field">
              <label>{t("deepseek.subagentModel")}</label>
              <input
                className="deepseek-input"
                value={subagentModel}
                onChange={(e) => setSubagentModel(e.target.value)}
              />
              <p className="deepseek-hint">{t("deepseek.subagentModelHint")}</p>
            </div>
          </div>
        </div>

        <div className="deepseek-card">
          <div className="deepseek-card__header">
            <h3>{t("deepseek.envVarsTitle")}</h3>
            <span className="deepseek-hint">{t("deepseek.envVarsHint")}</span>
          </div>
          <div className="deepseek-card__body">
            <div className="deepseek-env-list">
              {ENV_VAR_LIST.map((env) => (
                <div key={env.name} className="deepseek-env-item">
                  <code className="deepseek-env-name">{env.name}</code>
                  <span className="deepseek-env-eq">=</span>
                  <code className="deepseek-env-value">{getEnvValue(env)}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="deepseek-app__actions">
        <button
          className="deepseek-btn deepseek-btn--save"
          onClick={() => saveMutation.mutate()}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 size={16} className="deepseek-spin" /> : null}
          {t("deepseek.saveConfig")}
        </button>

        <button
          className={`deepseek-btn deepseek-btn--toggle ${enabled ? "is-enabled" : ""}`}
          onClick={() => (enabled ? disableMutation.mutate() : enableMutation.mutate())}
          disabled={isToggling}
        >
          {isToggling ? (
            <Loader2 size={18} className="deepseek-spin" />
          ) : enabled ? (
            <Shield size={18} />
          ) : (
            <ShieldOff size={18} />
          )}
          <span>
            {isToggling
              ? enabled
                ? t("deepseek.disabling")
                : t("deepseek.enabling")
              : enabled
                ? t("deepseek.enabled")
                : t("deepseek.disabled")}
          </span>
          {!isToggling && (
            <span className={`deepseek-status-dot ${enabled ? "is-on" : ""}`} />
          )}
        </button>

        <div className="deepseek-status">
          {configQuery.data?.enabled ? (
            <>
              <CheckCircle2 size={16} className="deepseek-icon-ok" />
              <span>{t("deepseek.enableToggleDesc")}</span>
            </>
          ) : (
            <>
              <XCircle size={16} className="deepseek-icon-off" />
              <span>{t("deepseek.enableToggleDesc")}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
