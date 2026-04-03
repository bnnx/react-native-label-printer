# @bnnx/react-native-label-printer

A React Native library for discovering, connecting to, and printing labels on Bluetooth Low Energy (BLE) thermal printers. Built on the New Architecture (TurboModules) with native support for TSPL commands.

## Key Features

- **TurboModule Architecture** — High-performance JSI bridge, no legacy Bridge overhead.
- **Cross-Platform BLE** — Full Bluetooth LE implementation for both iOS (CoreBluetooth) and Android (BluetoothGatt).
- **MTU-Aware Chunking** — Android transmissions are natively paced and chunked to prevent buffer overflows.
- **Automatic Disconnection Detection** — Native event emitters notify when the printer goes out of range or is powered off.
- **Modern Permissions** — Ready for Android 12+ (`neverForLocation`), no GPS permission needed to print.
- **Built-in TSPL Builder** — Chainable API for text, barcodes, QR codes, and more.
- **React Hook** — `useLabelPrinter` hook manages scanning, connection state, and device cleanup automatically.

## Tech Stack

- **Framework**: React Native 0.73+ (TurboModules / New Architecture)
- **TypeScript**: Full type definitions
- **Android**: Kotlin, `BluetoothLeScanner` + `BluetoothGatt`
- **iOS**: Objective-C++, `CoreBluetooth`

---

## Prerequisites

- React Native `0.73.0` or higher with New Architecture enabled
- iOS 13+ / Android 6+ (API 23)

## Getting Started

### 1. Installation

```bash
yarn add @bnnx/react-native-label-printer
```

### 2. iOS Setup

Add the following to `ios/YourAppName/Info.plist`:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>This app requires Bluetooth to connect to and print labels.</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>This app requires Bluetooth to connect to and print labels.</string>
```

Install CocoaPods:

```bash
cd ios
RCT_NEW_ARCH_ENABLED=1 pod install
cd ..
```

### 3. Android Setup

Add the following permissions to `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Android 11 and lower -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />

<!-- Android 12+ -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
```

Make sure your app requests these runtime permissions before scanning. A library like `react-native-permissions` is recommended.

---

## API Reference

### Native Functions

| Function | Description |
| --- | --- |
| `startScan()` | Starts BLE scanning for nearby thermal printers. Matches by known name prefixes and service UUIDs. |
| `stopScan()` | Stops the current BLE scan. |
| `connect(address: string): Promise<void>` | Connects to a printer by its address (MAC on Android, UUID on iOS). Handles MTU negotiation and characteristic discovery automatically. Times out after 5 seconds. |
| `disconnect(): Promise<void>` | Disconnects from the currently connected printer. |
| `sendRaw(data: string): Promise<void>` | Sends a raw UTF-8 string to the connected printer. Automatically chunks data based on the negotiated MTU. |

### Events

| Event | Callback | Description |
| --- | --- | --- |
| `onPrinterFound` | `(printer: { name: string; address: string }) => void` | Fired when a printer is discovered during scanning. |
| `onPrinterDisconnected` | `(address: string) => void` | Fired when the connected printer is turned off or goes out of range. |

### `useLabelPrinter` Hook

The recommended way to use this library. Manages scanning, connection, and device lifecycle automatically.

```tsx
import { useLabelPrinter } from '@bnnx/react-native-label-printer';

const {
  devices,          // Device[] — discovered printers
  isScanning,       // boolean
  connectedDevice,  // Device | null
  isConnecting,     // boolean
  startScan,        // () => void — clears list and starts scanning
  stopScan,         // () => void
  connect,          // (address: string) => Promise<void>
  disconnect,       // () => Promise<void>
} = useLabelPrinter({
  cleanupIntervalMs: 2000,  // How often stale devices are removed (default: 2000)
  deviceTimeoutMs: 10000,   // Max age before a device is removed. 0 to disable (default: 10000)
});
```

**`Device` type:**

```typescript
type Device = {
  name: string;
  address: string;
  lastSeen?: number;
};
```

---

## Usage Example

A complete scanning, connecting, and printing flow:

```tsx
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { sendRaw, TSPLBuilder, useLabelPrinter } from '@bnnx/react-native-label-printer';

export default function PrinterDemo() {
  const { devices, connectedDevice, startScan, connect, disconnect } = useLabelPrinter();

  const handleConnect = async (address: string) => {
    if (connectedDevice) await disconnect();
    await connect(address);
  };

  const handlePrint = async () => {
    const payload = new TSPLBuilder()
      .size(50, 30)
      .gap(2)
      .clear()
      .text(10, 10, 'Hello World!')
      .barcode(10, 50, '12345678', '128', 40)
      .qrCode(250, 10, 'https://example.com', { cellWidth: 4 })
      .print(1)
      .build();

    await sendRaw(payload);
  };

  return (
    <View style={{ flex: 1, paddingTop: 50 }}>
      <TouchableOpacity onPress={() => startScan()}>
        <Text>SCAN</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={handlePrint} disabled={!connectedDevice}>
        <Text>PRINT LABEL</Text>
      </TouchableOpacity>

      {devices.map((p) => (
        <TouchableOpacity key={p.address} onPress={() => handleConnect(p.address)}>
          <Text>{p.name} - {p.address}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
```

---

## TSPLBuilder

Chainable builder for constructing TSPL command payloads.

```typescript
const payload = new TSPLBuilder()
  .size(width, height)                          // Label dimensions (mm)
  .gap(gapSize, offsetMm?)                      // Gap between labels (mm)
  .cls()                                        // Clear image buffer (alias: .clear())
  .codePage(value)                              // Set code page (e.g. "1252" for Latin-1)
  .direction(0 | 1)                             // Print direction
  .reference(x, y)                              // Reference point
  .density(0-15)                                // Print density
  .speed(value)                                 // Print speed
  .feed(mm)                                     // Feed paper
  .text(x, y, content, options?)                // Draw text
  .barcode(x, y, content, type?, height?, options?)  // Draw barcode
  .qrCode(x, y, content, options?)              // Draw QR code
  .box(x, y, xEnd, yEnd, thickness?)            // Draw box
  .print(copies)                                // Print command
  .build();                                     // Build final string
```

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT
