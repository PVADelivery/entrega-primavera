import { registerPlugin } from "@capacitor/core";

export enum Style {
  Dark = "DARK",
  Light = "LIGHT",
  Default = "DEFAULT",
}

export interface StatusBarPlugin {
  setStyle(options: { style: Style }): Promise<void>;
  setBackgroundColor(options: { color: string }): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  getInfo(): Promise<{ visible: boolean; style: Style; color?: string; overlays?: boolean }>;
  setOverlaysWebView(options: { overlay: boolean }): Promise<void>;
}

export class StatusBarWeb {
  async setStyle(_options: { style: Style }) {}
  async setBackgroundColor(_options: { color: string }) {}
  async show() {}
  async hide() {}
  async getInfo() {
    return { visible: true, style: Style.Default };
  }
  async setOverlaysWebView(_options: { overlay: boolean }) {}
}

export const StatusBar = registerPlugin<StatusBarPlugin>("StatusBar", {
  web: () => Promise.resolve(new StatusBarWeb()),
});

export default StatusBar;
