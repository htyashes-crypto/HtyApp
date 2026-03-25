import { useEffect, useState } from "react";
import { getDesktopBridge, type UpdateStatusEvent } from "../lib/desktop";

type UpdatePhase = "idle" | "available" | "downloading" | "downloaded" | "error";

export function UpdateNotification() {
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [version, setVersion] = useState("");
  const [percent, setPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.onUpdateStatus) return;

    const listener = bridge.onUpdateStatus((data: UpdateStatusEvent) => {
      switch (data.type) {
        case "available":
          setPhase("available");
          setVersion(data.version ?? "");
          setDismissed(false);
          break;
        case "downloading":
          setPhase("downloading");
          setPercent(Math.round(data.percent ?? 0));
          break;
        case "downloaded":
          setPhase("downloaded");
          setVersion(data.version ?? "");
          break;
        case "error":
          setPhase("error");
          setErrorMsg(data.message ?? "更新失败");
          break;
        case "not-available":
          setPhase("idle");
          break;
      }
    });

    return () => {
      bridge.removeUpdateStatus(listener);
    };
  }, []);

  if (phase === "idle" || dismissed) return null;

  const handleDownload = () => {
    const bridge = getDesktopBridge();
    bridge?.downloadUpdate();
    setPhase("downloading");
    setPercent(0);
  };

  const handleInstall = () => {
    const bridge = getDesktopBridge();
    bridge?.quitAndInstall();
  };

  return (
    <div style={styles.container}>
      {phase === "available" && (
        <>
          <span style={styles.text}>新版本 v{version} 可用</span>
          <button style={styles.btn} onClick={handleDownload}>下载更新</button>
          <button style={styles.dismissBtn} onClick={() => setDismissed(true)}>稍后</button>
        </>
      )}
      {phase === "downloading" && (
        <>
          <span style={styles.text}>正在下载更新... {percent}%</span>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressBar, width: `${percent}%` }} />
          </div>
        </>
      )}
      {phase === "downloaded" && (
        <>
          <span style={styles.text}>v{version} 已下载完成</span>
          <button style={styles.btn} onClick={handleInstall}>立即重启安装</button>
          <button style={styles.dismissBtn} onClick={() => setDismissed(true)}>稍后</button>
        </>
      )}
      {phase === "error" && (
        <>
          <span style={styles.text}>更新出错: {errorMsg}</span>
          <button style={styles.dismissBtn} onClick={() => setDismissed(true)}>关闭</button>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    bottom: 24,
    right: 24,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 18px",
    background: "rgba(15, 23, 34, 0.95)",
    border: "1px solid rgba(53, 184, 255, 0.3)",
    borderRadius: 12,
    zIndex: 9999,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
    backdropFilter: "blur(12px)",
  },
  text: {
    fontSize: 13,
    color: "#f3f7fb",
    whiteSpace: "nowrap",
  },
  btn: {
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    color: "#fff",
    background: "linear-gradient(135deg, #00c2a8, #35b8ff)",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  dismissBtn: {
    padding: "6px 12px",
    fontSize: 12,
    color: "#9fb0c2",
    background: "transparent",
    border: "1px solid rgba(126, 153, 182, 0.25)",
    borderRadius: 8,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  progressTrack: {
    width: 120,
    height: 6,
    background: "rgba(126, 153, 182, 0.18)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    background: "linear-gradient(90deg, #00c2a8, #35b8ff)",
    borderRadius: 3,
    transition: "width 0.3s ease",
  },
};
