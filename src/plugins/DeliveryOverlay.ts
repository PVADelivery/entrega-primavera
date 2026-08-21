import { registerPlugin, PluginListenerHandle, Capacitor } from '@capacitor/core';

export interface IncomingCallOptions {
  details: string;
  deliveryId: string;
  storeName?: string;
  pickup?: string;
  dropoff?: string;
  fee?: string;
}

export interface DeliveryOverlayPlugin {
  requestOverlayPermission(): Promise<void>;
  requestBatteryOptimizationExemption(): Promise<{ ignoring: boolean; error?: string }>;
  startOverlay(): Promise<{ success: boolean; reason?: string }>;
  stopOverlay(): Promise<void>;
  dismissIncomingCall(): Promise<void>;
  testIncomingCall(options: IncomingCallOptions): Promise<void>;
  updateIncomingCall(options: IncomingCallOptions): Promise<void>;
  reportCallResult(options: { success: boolean; message?: string }): Promise<void>;
  saveDriverContext(options: { driverId: string; userToken: string }): Promise<void>;
  addListener(
    eventName: 'onCallResponse',
    listenerFunc: (response: { status: 'accepted' | 'rejected'; deliveryId: string }) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}

const DeliveryOverlayPluginRaw = registerPlugin<DeliveryOverlayPlugin>('DeliveryOverlay');

const hasPlugin = Capacitor.isPluginAvailable('DeliveryOverlay');

const safeCall = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  if (!hasPlugin) return fallback;
  try {
    return await fn();
  } catch (err: any) {
    if (err?.code === 'UNIMPLEMENTED' || String(err?.message || '').includes('not implemented')) {
      return fallback;
    }
    throw err;
  }
};

export const DeliveryOverlay: DeliveryOverlayPlugin = {
  requestOverlayPermission: () => safeCall(() => DeliveryOverlayPluginRaw.requestOverlayPermission(), undefined),
  requestBatteryOptimizationExemption: () => safeCall(() => DeliveryOverlayPluginRaw.requestBatteryOptimizationExemption(), { ignoring: true }),
  startOverlay: () => safeCall(() => DeliveryOverlayPluginRaw.startOverlay(), { success: false, reason: 'unimplemented' }),
  stopOverlay: () => safeCall(() => DeliveryOverlayPluginRaw.stopOverlay(), undefined),
  dismissIncomingCall: () => safeCall(() => DeliveryOverlayPluginRaw.dismissIncomingCall(), undefined),
  testIncomingCall: (options) => safeCall(() => DeliveryOverlayPluginRaw.testIncomingCall(options), undefined),
  updateIncomingCall: (options) => safeCall(() => DeliveryOverlayPluginRaw.updateIncomingCall(options), undefined),
  reportCallResult: (options) => safeCall(() => DeliveryOverlayPluginRaw.reportCallResult(options), undefined),
  saveDriverContext: (options) => safeCall(() => DeliveryOverlayPluginRaw.saveDriverContext(options), undefined),
  addListener: (eventName: any, listenerFunc: any) => {
    if (!hasPlugin) {
      return Promise.resolve({ remove: async () => {} }) as any;
    }
    try {
      const res = DeliveryOverlayPluginRaw.addListener(eventName, listenerFunc);
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
      return res;
    } catch {
      return Promise.resolve({ remove: async () => {} }) as any;
    }
  }
};

if (typeof window !== 'undefined') {
  (window as any).DeliveryOverlay = DeliveryOverlay;
}
