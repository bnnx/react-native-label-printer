# @bnnx/react-native-label-printer

A React Native library for printing labels and receipts on **thermal printers** via **Classic Bluetooth (Android Only)** using **TSPL** or **CPCL** command sets.

> ⚠️ **Note:** This library currently supports **Android only**. iOS support is planned for future releases.

## 🎯 Purpose

This library provides a simple, low-level bridge to communicate with Bluetooth thermal printers. It focuses on maintaining a focused, reliable connection and sending raw command strings to the device. It is **not** a high-level layout engine, but rather a driver to send your custom commands.

## ✅ What this library DOES

- **Connect/Disconnect**: Manages the connection lifecycle with paired Bluetooth devices.
- **Send Raw Data**: Sends raw strings (TSPL/CPCL commands) directly to the printer socket.
- **TSPL Builder**: Includes a helper utility (`TSPLBuilder`) to generating TSPL command strings fluently.
- **Error Handling**: Provides feedback on connection failures and transmission errors.

## ❌ What this library DOES NOT DO

- **No Pairing/Scanning**: You must pair the printer in Android Settings first. This library only lists _already bonded_ devices.
- **No Permission Management**: Your app is responsible for requesting `BLUETOOTH_CONNECT` and other necessary runtime permissions.
- **No Image Processing**: Currently does not convert images to hex/binary for printing.
- **No Encoding Magic**: Sends strings as UTF-8 bytes. Most thermal printers do not support UTF-8 directly. You must use standard ASCII or handle code pages manually (e.g., `CODEPAGE 1252`).

## 📦 Installation

```sh
yarn add @bnnx/react-native-label-printer
# or
npm install @bnnx/react-native-label-printer
```

### Android Setup

Since this library uses Bluetooth, you need to add permissions to your `AndroidManifest.xml`.

**For Android 12+ (API 31+):**

```xml
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
```

**For Android 11 and below:**

```xml
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
```

> **Important:** Your React Native app is responsible for requesting these permissions at runtime using a library like `react-native-permissions` before calling any method from this library.

## 🚀 Usage

### 1. Listing & Connecting

This library only works with devices that are **already paired** in the Android Bluetooth settings.

```typescript
import {
  listBondedDevices,
  connect,
  disconnect,
} from '@bnnx/react-native-label-printer';

// 1. List paired devices
const devices = await listBondedDevices();
console.log(devices);
// Output: [{ name: "Printer_01", address: "00:11:22:33:44:55" }]

// 2. Connect to a device
try {
  await connect('00:11:22:33:44:55');
  console.log('Connected or already connected!');
} catch (e) {
  console.error('Connection failed', e);
}

// 3. Disconnect when done
await disconnect();
```

### 2. Printing with TSPLBuilder

Use the included `TSPLBuilder` to construct label commands easily.

```typescript
import { TSPLBuilder, sendRaw } from '@bnnx/react-native-label-printer';

const command = new TSPLBuilder()
  .size(50, 30) // Label size: 50mm x 30mm
  .gap(2) // Gap: 2mm
  .clear() // Clear buffer
  .text(10, 10, 'Product Name')
  .text(10, 50, 'Price: $19.99')
  .barcode(10, 90, '12345678', '128', 50)
  .qrCode(200, 10, 'https://example.com')
  .print(1) // Print 1 copy
  .build();

try {
  await sendRaw(command);
  console.log('Print command sent!');
} catch (e) {
  console.error('Failed to send data (Check connection)', e);
}
```

### 3. Printing Raw Strings (CPCL / ESC/POS)

If you already have a command string (e.g., CPCL or ZPL), you can send it directly:

```typescript
import { sendRaw } from '@bnnx/react-native-label-printer';

const cpclCommand = `
! 0 200 200 210 1
TEXT 4 0 30 40 Hello CPCL
PRINT
`;

await sendRaw(cpclCommand);
```

### ⚠️ A Note on multiple labels

To print multiple labels at once, simply concatenate the command strings. This is much faster than calling `sendRaw` multiple times.

```typescript
const label1 = new TSPLBuilder()...build();
const label2 = new TSPLBuilder()...build();

// Efficient: Send all at once
await sendRaw(label1 + label2);
```

## 📖 API Reference

### `listBondedDevices()`

Returns a promise resolving to an array of bonded devices.

- **Returns**: `Promise<{ name: string, address: string }[]>`

### `connect(address: string)`

Connects to the specified Bluetooth MAC address. If another device is connected, it _disconnects_ specifically within the native module scope before connecting the new one.

- **Throws**: Error if connection fails or permission is denied.

### `disconnect()`

Closes the active Bluetooth socket. Always robust to call, even if already disconnected.

### `sendRaw(data: string)`

Sends a string to the open socket.

- **Throws**: Error if not connected or if writing to the socket fails (e.g., printer turned off).

## 📱 Example App

This repository contains a full **example app** in the `/example` folder. It serves as "living documentation" demonstrating:

- How to list devices.
- How to manage connection state.
- How to handle printer errors.
- A recommended UI flow for printing.

To run it:

1. Clone the repo.
2. `yarn install`
3. `yarn example android`

## 🔮 Roadmap

- [ ] iOS Support (BLE/Classic constraints to be evaluated)
- [ ] CPCLBuilder helper

## 🤝 Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## 📄 License

MIT

---

Made with ❤️ for the React Native community.
