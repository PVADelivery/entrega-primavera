import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mt24horasexpress.entregador',
  appName: 'MT 24horas express Entregador',
  webDir: 'dist/client',
  server: {
    url: 'https://entregador.mt24horasexpress.com',
    cleartext: true
  }
};

export default config;
