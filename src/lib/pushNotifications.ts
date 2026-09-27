import { registerPlugin } from "@capacitor/core";

export interface PushNotificationSchema {
  title?: string;
  subtitle?: string;
  body?: string;
  id: string;
  badge?: number;
  data?: any;
  click_action?: string;
  link?: string;
  group?: string;
  groupSummary?: boolean;
}

export interface ActionPerformed {
  actionId: string;
  inputValue?: string;
  notification: PushNotificationSchema;
}

export interface Token {
  value: string;
}

export interface PushNotificationsPlugin {
  register(): Promise<void>;
  getDeliveredNotifications(): Promise<{ notifications: PushNotificationSchema[] }>;
  removeDeliveredNotifications(delivered: { notifications: PushNotificationSchema[] }): Promise<void>;
  removeAllDeliveredNotifications(): Promise<void>;
  createChannel(channel: any): Promise<void>;
  deleteChannel(args: { id: string }): Promise<void>;
  listChannels(): Promise<{ channels: any[] }>;
  checkPermissions(): Promise<{ receive: "prompt" | "prompt-with-rationale" | "granted" | "denied"; display?: string }>;
  requestPermissions(): Promise<{ receive: "prompt" | "prompt-with-rationale" | "granted" | "denied"; display?: string }>;
  addListener(eventName: "registration", listenerFunc: (token: Token) => void): Promise<any>;
  addListener(eventName: "registrationError", listenerFunc: (error: any) => void): Promise<any>;
  addListener(eventName: "pushNotificationReceived", listenerFunc: (notification: PushNotificationSchema) => void): Promise<any>;
  addListener(eventName: "pushNotificationActionPerformed", listenerFunc: (action: ActionPerformed) => void): Promise<any>;
  addListener(eventName: string, listenerFunc: (...args: any[]) => void): Promise<any>;
  removeAllListeners(): Promise<void>;
}

export class PushNotificationsWeb {
  async register(): Promise<void> {}
  async getDeliveredNotifications(): Promise<{ notifications: PushNotificationSchema[] }> {
    return { notifications: [] };
  }
  async removeDeliveredNotifications(): Promise<void> {}
  async removeAllDeliveredNotifications(): Promise<void> {}
  async createChannel(): Promise<void> {}
  async deleteChannel(): Promise<void> {}
  async listChannels(): Promise<{ channels: any[] }> {
    return { channels: [] };
  }
  async checkPermissions(): Promise<{ receive: "prompt" | "prompt-with-rationale" | "granted" | "denied"; display?: string }> {
    return { receive: "granted", display: "granted" };
  }
  async requestPermissions(): Promise<{ receive: "prompt" | "prompt-with-rationale" | "granted" | "denied"; display?: string }> {
    return { receive: "granted", display: "granted" };
  }
  async addListener(): Promise<any> {
    return { remove: async () => {} };
  }
  async removeAllListeners(): Promise<void> {}
}

export const PushNotifications = registerPlugin<PushNotificationsPlugin>("PushNotifications", {
  web: () => Promise.resolve(new PushNotificationsWeb()),
});
export default PushNotifications;
