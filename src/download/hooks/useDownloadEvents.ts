import { useEffect } from "react";
import { getDesktopBridge } from "../../lib/desktop";

export function useDownloadEvent(channel: string, callback: (data: unknown) => void) {
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const listener = bridge.onDownloadEvent(channel, callback);
    return () => {
      bridge.removeDownloadEvent(channel, listener);
    };
  }, [channel, callback]);
}
