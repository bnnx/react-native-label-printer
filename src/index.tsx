import LabelPrinter from './NativeLabelPrinter';

export function listBondedDevices() {
  return LabelPrinter.listBondedDevices();
}

export function connect(address: string) {
  return LabelPrinter.connect(address);
}

export function sendRaw(data: string) {
  return LabelPrinter.sendRaw(data);
}

export * from './TSPLBuilder';
export * from './CPCLBuilder';
