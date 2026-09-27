import { registerPlugin } from "@capacitor/core";

export interface AppState {
  isActive: boolean;
}

export interface AppInfo {
  name: string;
  id: string;
  build: string;
  version: string;
}

export interface AppPlugin {
  exitApp(): Promise<void>;
  getInfo(): Promise<AppInfo>;
  getState(): Promise<AppState>;
  getLaunchUrl(): Promise<{ url: string } | undefined>;
  minimizeApp(): Promise<void>;
  addListener(eventName: "appStateChange", listenerFunc: (state: AppState) => void): Promise<any>;
  addListener(eventName: "appUrlOpen", listenerFunc: (data: any) => void): Promise<any>;
  addListener(eventName: "appRestoredResult", listenerFunc: (data: any) => void): Promise<any>;
  addListener(eventName: "backButton", listenerFunc: (data: { canGoBack: boolean }) => void): Promise<any>;
  addListener(eventName: string, listenerFunc: (...args: any[]) => void): Promise<any>;
  removeAllListeners(): Promise<void>;
}

export class AppWeb {
  async exitApp() {}
  async getInfo(): Promise<AppInfo> {
    return { name: "MT 24 Horas", id: "app", build: "1", version: "1.0.0" };
  }
  async getState(): Promise<AppState> {
    return { isActive: typeof document !== "undefined" ? !document.hidden : true };
  }
  async getLaunchUrl() {
    return undefined;
  }
  async minimizeApp() {}
  async addListener(_eventName: string, _listenerFunc: any) {
    return { remove: async () => {} };
  }
  async removeAllListeners() {}
}

export const App = registerPlugin<AppPlugin>("App", {
  web: () => Promise.resolve(new AppWeb()),
});

export default App;
