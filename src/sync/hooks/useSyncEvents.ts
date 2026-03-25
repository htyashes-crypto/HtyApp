import { useEffect } from "react";
import { getDesktopBridge } from "../../lib/desktop";

export function useSyncEvent(channel: string, callback: (data: unknown) => void) {
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const listener = bridge.onSyncEvent(channel, callback);
    return () => {
      bridge.removeSyncEvent(channel, listener);
    };
  }, [channel, callback]);
}
