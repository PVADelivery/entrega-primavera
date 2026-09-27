import { registerPlugin } from "@capacitor/core";

export interface LocalNotificationDescriptor {
  id: number;
}

export interface LocalNotificationSchema {
  title: string;
  body: string;
  id: number;
  sound?: string;
  attachments?: any[];
  actionTypeId?: string;
  extra?: any;
  iconColor?: string;
  smallIcon?: string;
  largeIcon?: string;
  channelId?: string;
  schedule?: any;
  ongoing?: boolean;
  autoCancel?: boolean;
  silent?: boolean;
}

export interface ScheduleOptions {
  notifications: LocalNotificationSchema[];
}

export interface ScheduleResult {
  notifications: LocalNotificationDescriptor[];
}

export interface PermissionStatus {
  display: "prompt" | "prompt-with-rationale" | "granted" | "denied";
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  sound?: string;
  importance?: number;
  visibility?: number;
  lights?: boolean;
  lightColor?: string;
  vibration?: boolean;
}

export interface ListChannelsResult {
  channels: Channel[];
}

export interface EnabledResult {
  value: boolean;
}

export interface LocalNotificationsPlugin {
  schedule(options: ScheduleOptions): Promise<ScheduleResult>;
  requestPermissions(): Promise<PermissionStatus>;
  checkPermissions(): Promise<PermissionStatus>;
  cancel(options: { notifications: LocalNotificationDescriptor[] }): Promise<void>;
  getPending(): Promise<{ notifications: any[] }>;
  registerActionTypes(options: { types: any[] }): Promise<void>;
  areEnabled(): Promise<EnabledResult>;
  createChannel(channel: Channel): Promise<void>;
  deleteChannel(args: { id: string }): Promise<void>;
  listChannels(): Promise<ListChannelsResult>;
  removeAllDeliveredNotifications(): Promise<void>;
  removeDeliveredNotifications(delivered: { notifications: LocalNotificationDescriptor[] }): Promise<void>;
  getDeliveredNotifications(): Promise<{ notifications: any[] }>;
  addListener(eventName: string, listenerFunc: (...args: any[]) => void): Promise<any>;
  removeAllListeners(): Promise<void>;
}

export class LocalNotificationsWeb {
  async schedule(options: ScheduleOptions): Promise<ScheduleResult> {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      for (const notif of options.notifications || []) {
        try {
          new Notification(notif.title, {
            body: notif.body,
            data: notif.extra,
            tag: String(notif.id),
          });
        } catch {}
      }
    }
    return {
      notifications: (options.notifications || []).map((n) => ({ id: n.id })),
    };
  }

  async requestPermissions(): Promise<PermissionStatus> {
    if (typeof window !== "undefined" && "Notification" in window) {
      const res = await Notification.requestPermission();
      return { display: res === "granted" ? "granted" : "denied" };
    }
    return { display: "granted" };
  }

  async checkPermissions(): Promise<PermissionStatus> {
    if (typeof window !== "undefined" && "Notification" in window) {
      return { display: Notification.permission === "granted" ? "granted" : "denied" };
    }
    return { display: "granted" };
  }

  async cancel(_options: { notifications: LocalNotificationDescriptor[] }): Promise<void> {
    return;
  }

  async getPending(): Promise<{ notifications: any[] }> {
    return { notifications: [] };
  }

  async registerActionTypes(_options: { types: any[] }): Promise<void> {
    return;
  }

  async areEnabled(): Promise<EnabledResult> {
    return { value: true };
  }

  async createChannel(_channel: Channel): Promise<void> {
    return;
  }

  async deleteChannel(_args: { id: string }): Promise<void> {
    return;
  }

  async listChannels(): Promise<ListChannelsResult> {
    return { channels: [] };
  }

  async removeAllDeliveredNotifications(): Promise<void> {
    return;
  }

  async removeDeliveredNotifications(_delivered: { notifications: LocalNotificationDescriptor[] }): Promise<void> {
    return;
  }

  async getDeliveredNotifications(): Promise<{ notifications: any[] }> {
    return { notifications: [] };
  }

  async addListener(_eventName: string, _listenerFunc: (...args: any[]) => void): Promise<any> {
    return { remove: async () => {} };
  }

  async removeAllListeners(): Promise<void> {
    return;
  }
}

export const LocalNotifications = registerPlugin<LocalNotificationsPlugin>("LocalNotifications", {
  web: () => Promise.resolve(new LocalNotificationsWeb()),
});

export default LocalNotifications;
