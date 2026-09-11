import { buildSnapshot } from "@/lib/backup";

interface DesktopBridge {
  isDesktop: boolean;
  saveLocalSnapshot: (snapshot: unknown) => Promise<{ path: string; savedAt: string; sizeBytes: number }>;
  getLocalDataPath: () => Promise<string>;
  openLocalDataFolder: () => Promise<string>;
}

declare global {
  interface Window {
    oriDesktop?: DesktopBridge;
  }
}

export const isDesktopApp = (): boolean => window.oriDesktop?.isDesktop === true;

export async function saveDesktopSnapshot(): Promise<boolean> {
  const bridge = window.oriDesktop;
  if (!bridge) return false;
  await bridge.saveLocalSnapshot(buildSnapshot());
  return true;
}

export function startDesktopAutoBackup(): () => void {
  if (!isDesktopApp()) return () => undefined;
  const save = (): void => {
    void saveDesktopSnapshot().catch((error: unknown) => {
      console.error("[desktop-backup] local save failed", error);
    });
  };
  const initial = window.setTimeout(save, 15_000);
  const interval = window.setInterval(save, 5 * 60_000);
  window.addEventListener("focus", save);
  return () => {
    window.clearTimeout(initial);
    window.clearInterval(interval);
    window.removeEventListener("focus", save);
  };
}
