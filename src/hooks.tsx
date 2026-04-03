import { useState, useEffect, useCallback, useRef } from 'react';
import {
  startScan,
  stopScan,
  onPrinterFound,
  onPrinterDisconnected,
  connect,
  disconnect,
} from './index';

export type Device = {
  name: string;
  address: string;
  lastSeen?: number;
};

export type UseLabelPrinterOptions = {
  /** How often the cleanup interval runs (default: 2000ms) */
  cleanupIntervalMs?: number;
  /** How old a device's last footprint must be to be removed. Put 0 to disable cleanup (default: 10000ms) */
  deviceTimeoutMs?: number;
};

export function useLabelPrinter(options?: UseLabelPrinterOptions) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const connectedDeviceRef = useRef<Device | null>(null);

  const cleanupIntervalMs = options?.cleanupIntervalMs ?? 2000;
  const deviceTimeoutMs = options?.deviceTimeoutMs ?? 10000;

  const handleStartScan = useCallback(() => {
    setDevices([]);
    setIsScanning(true);
    startScan();
  }, []);

  const handleStopScan = useCallback(() => {
    setIsScanning(false);
    stopScan();
  }, []);

  const handleConnect = async (address: string) => {
    setIsConnecting(true);
    try {
      await connect(address);
      const connected = devices.find((d) => d.address === address) || {
        name: 'Unknown',
        address,
      };
      setConnectedDevice(connected);
      connectedDeviceRef.current = connected;
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsConnecting(true);
    try {
      setConnectedDevice(null);
      connectedDeviceRef.current = null;
      await disconnect();
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    const subFound = onPrinterFound((printer) => {
      setDevices((prev) => {
        const now = Date.now();
        const exists = prev.find((p) => p.address === printer.address);
        if (!exists) return [...prev, { ...printer, lastSeen: now }];
        return prev.map((p) =>
          p.address === printer.address ? { ...p, lastSeen: now } : p
        );
      });
    });

    const subDisconnected = onPrinterDisconnected((address: string) => {
      if (connectedDeviceRef.current?.address === address) {
        setConnectedDevice(null);
        connectedDeviceRef.current = null;
      }
    });

    const cleanupInterval = setInterval(() => {
      if (deviceTimeoutMs <= 0) return; // Opt-out

      const now = Date.now();
      setDevices((prev) =>
        prev.filter((p) => {
          if (connectedDeviceRef.current?.address === p.address) return true;
          return now - (p.lastSeen || now) < deviceTimeoutMs;
        })
      );
    }, cleanupIntervalMs);

    return () => {
      subFound.remove();
      subDisconnected.remove();
      clearInterval(cleanupInterval);
      stopScan();
      setIsScanning(false);
    };
  }, [cleanupIntervalMs, deviceTimeoutMs]);

  return {
    devices,
    isScanning,
    connectedDevice,
    isConnecting,
    startScan: handleStartScan,
    stopScan: handleStopScan,
    connect: handleConnect,
    disconnect: handleDisconnect,
  };
}
