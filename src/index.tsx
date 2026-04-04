import { NativeEventEmitter } from 'react-native';
import LabelPrinter from './NativeLabelPrinter';

const eventEmitter = new NativeEventEmitter(LabelPrinter as any);

export function startScan() {
  LabelPrinter.startScan();
}

export function stopScan() {
  LabelPrinter.stopScan();
}

export function onPrinterFound(
  callback: (printer: { name: string; address: string }) => void
) {
  return eventEmitter.addListener('onPrinterFound', callback as any);
}

export function onPrinterDisconnected(callback: (address: string) => void) {
  return eventEmitter.addListener('onPrinterDisconnected', callback as any);
}

export function onBluetoothStateChange(callback: (isEnabled: boolean) => void) {
  return eventEmitter.addListener('onBluetoothStateChange', callback as any);
}

export function connect(address: string) {
  return LabelPrinter.connect(address);
}

export function disconnect() {
  return LabelPrinter.disconnect();
}

export function sendRaw(data: string) {
  return LabelPrinter.sendRaw(data);
}

export function isBluetoothEnabled(): Promise<boolean> {
  return LabelPrinter.isBluetoothEnabled();
}

export * from './TSPLBuilder';
export * from './hooks';
