import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  listBondedDevices(): Promise<{ name: string; address: string }[]>;
  connect(address: string): Promise<void>;
  sendRaw(data: string): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('LabelPrinter');
