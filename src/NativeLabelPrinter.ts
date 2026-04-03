import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  startScan(): void;
  stopScan(): void;
  connect(address: string): Promise<void>;
  disconnect(): Promise<void>;
  sendRaw(data: string): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('LabelPrinter');
