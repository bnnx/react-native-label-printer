import LabelPrinter from './NativeLabelPrinter';

export function listBondedDevices() {
  return LabelPrinter.listBondedDevices();
}

export function connect(address: string) {
  return LabelPrinter.connect(address);
}
