import type { DesktopBridge } from '@mindlink-agent/protocol';

declare global {
  interface Window {
    mindlink?: DesktopBridge;
  }
}

export {};
