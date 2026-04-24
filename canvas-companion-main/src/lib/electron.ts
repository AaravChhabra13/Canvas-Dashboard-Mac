// Electron bridge — only available when running inside the packaged app.
type ElectronAPI = {
  isElectron: boolean;
  syncAssignments: (payload: {
    assignments: Array<{ id: string; title: string; course: string; due: string | null }>;
    completed: string[];
  }) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  openExternal: (url: string) => void;
};

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export const electron = (typeof window !== "undefined" ? window.electron : undefined) ?? null;
export const isElectron = !!electron?.isElectron;
