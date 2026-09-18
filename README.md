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
| `sendRaw(data: string): Promise<void>` | Sends a raw UTF-8 string to the connected printer. Automatically chunks data on line boundaries based on the negotiated MTU. |
| `sendBytes(bytes: Uint8Array): Promise<void>` | Sends binary data (bitmaps, ESC/POS raster) to the connected printer. Chunks the payload in fixed-size BLE writes. |

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
  .bitmap(x, y, monoBitmap, mode?)              // Draw a MonoBitmap (binary); mode: 'overwrite' | 'or' | 'xor'
  .print(copies)                                // Print command
  .build();                                     // Build final string (text-only labels)
```

Labels that contain a bitmap are binary, so build them with `buildBytes()` and send with `sendBytes()`:

```typescript
import { TSPLBuilder, sendBytes } from '@bnnx/react-native-label-printer';

const bytes = new TSPLBuilder()
  .size(50, 30)
  .gap(2)
  .cls()
  .bitmap(0, 0, bitmap)
  .print(1)
  .buildBytes();

await sendBytes(bytes);
```

## ESCPOSBuilder

Chainable builder for ESC/POS receipt printers. It is focused on raster printing: render the label as a `MonoBitmap` and send it as `GS v 0` raster graphics.

```typescript
import { ESCPOSBuilder, sendBytes } from '@bnnx/react-native-label-printer';

const bytes = new ESCPOSBuilder()
  .initialize()                                 // ESC @
  .align('left' | 'center' | 'right')           // ESC a n
  .leftMargin(dots)                             // GS L nL nH (0-65535)
  .heat({ maxDots?, heatingTime?, heatingInterval? }) // ESC 7 n1 n2 n3
  .density(level, breakTime?)                   // DC2 # n (experimental, see below)
  .raster(monoBitmap, { bandHeight? })          // GS v 0 (streamed in bands, default 64 rows)
  .feed(lines)                                  // ESC d n (split when > 255)
  .feedDots(dots)                               // ESC J n (split when > 255)
  .formFeed()                                   // FF
  .labelFeed()                                  // GS FF (label firmware only)
  .raw(bytes)                                   // Arbitrary bytes
  .build();                                     // Uint8Array

await sendBytes(bytes);
```

`heat()` controls darkness on generic 58mm printers: a lower `heatingTime` (3-255, default 80) prints lighter and reduces dot gain. `maxDots` (0-255, default 7) and `heatingInterval` (0-255, default 2) rarely need to change.

`density()` sends `DC2 #`, which some generic firmwares implement but has not been verified on a real printer yet. Treat it as experimental and prefer `heat()`.

Every numeric parameter is validated: out-of-range or non-integer values throw a `RangeError` instead of silently producing a different command.

## MonoBitmap

Both builders accept a `MonoBitmap`: one byte per pixel, row-major (`width * height` bytes), any non-zero value is black. Create one with `createMonoBitmap(width, height)` (both must be integers >= 1) and draw into `data` with your own renderer. For 58mm paper at 203 dpi the printable width is 384 dots (48 bytes per row).

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT
