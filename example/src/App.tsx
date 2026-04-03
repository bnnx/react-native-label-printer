import { useEffect, useState, useCallback } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  FlatList,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  check,
  request,
  requestMultiple,
  PERMISSIONS,
  RESULTS,
  openSettings,
} from 'react-native-permissions';
import {
  sendRaw,
  TSPLBuilder,
  useLabelPrinter,
} from '@bnnx/react-native-label-printer';

const DEMO_LABEL = {
  id: '006c2c24-b45d-4bf1-baae-2a94f40ebc38',
  name: 'My Store',
  description: 'Canvas Sneakers',
  size: '42',
  color: 'Black',
  price: '159.90',
  code: '0126/1-001-001',
};

type Device = {
  name: string;
  address: string;
  lastSeen?: number;
};

function usePermissions() {
  const [hasPermission, setHasPermission] = useState(true);

  const requestBluetoothPermission = useCallback(async () => {
    let granted = false;
    if (Platform.OS === 'ios') {
      const result = await check(PERMISSIONS.IOS.BLUETOOTH);
      if (result === RESULTS.GRANTED) granted = true;
      else
        granted =
          (await request(PERMISSIONS.IOS.BLUETOOTH)) === RESULTS.GRANTED;
    } else if (Platform.OS === 'android') {
      if (Platform.Version >= 31) {
        const statuses = await requestMultiple([
          PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
          PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
        ]);
        granted =
          statuses[PERMISSIONS.ANDROID.BLUETOOTH_SCAN] === RESULTS.GRANTED &&
          statuses[PERMISSIONS.ANDROID.BLUETOOTH_CONNECT] === RESULTS.GRANTED;
      } else {
        granted =
          (await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION)) ===
          RESULTS.GRANTED;
      }
    }

    setHasPermission(granted);
    return granted;
  }, []);

  return { hasPermission, requestBluetoothPermission };
}

export default function App() {
  const { hasPermission, requestBluetoothPermission } = usePermissions();
  const {
    devices,
    isScanning,
    connectedDevice,
    isConnecting,
    startScan: startScanningBase,
    connect: handleConnect,
    disconnect: handleDisconnect,
  } = useLabelPrinter({
    cleanupIntervalMs: 2000,
    deviceTimeoutMs: 10000,
  });

  const [isPrinting, setIsPrinting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const startScanning = useCallback(async () => {
    const granted = await requestBluetoothPermission();
    if (!granted) return false;
    startScanningBase();
    return true;
  }, [requestBluetoothPermission, startScanningBase]);

  const toggleConnection = async (device: Device) => {
    if (connectedDevice?.address === device.address) {
      await handleDisconnect();
      return;
    }
    const granted = await requestBluetoothPermission();
    if (!granted) return;
    await handleConnect(device.address);
  };

  useEffect(() => {
    startScanning().then((started) => {
      setPermissionDenied(!started);
    });
  }, [startScanning]);

  const handleManualScan = async () => {
    const started = await startScanning();
    setPermissionDenied(!started);
  };

  const handlePrint = async () => {
    if (!connectedDevice) return;

    setIsPrinting(true);
    try {
      const verticalLabelCommand = new TSPLBuilder()
        .size(50, 30)
        .gap(2)
        .clear()
        .text(10, 220, DEMO_LABEL.name, { rotation: 270 })
        .text(50, 220, DEMO_LABEL.description, { rotation: 270 })
        .text(80, 220, `Size: ${DEMO_LABEL.size}`, { rotation: 270 })
        .text(110, 220, `Price: $${DEMO_LABEL.price}`, { rotation: 270 })
        .qrCode(160, 175, DEMO_LABEL.id, {
          rotation: 270,
          cellWidth: 4,
        })
        .barcode(310, 210, DEMO_LABEL.code, '128', 40, { rotation: 270 })
        .print(1)
        .build();

      const horizontalLabelCommand = new TSPLBuilder()
        .size(50, 30)
        .gap(2)
        .clear()
        .text(10, 10, DEMO_LABEL.name)
        .text(10, 50, DEMO_LABEL.description)
        .text(10, 80, `Size: ${DEMO_LABEL.size}`)
        .text(10, 110, `Price: $${DEMO_LABEL.price}`)
        .qrCode(250, 10, DEMO_LABEL.id, {
          cellWidth: 4,
        })
        .barcode(220, 140, DEMO_LABEL.code, '128', 40)
        .print(1)
        .build();

      const payload = verticalLabelCommand + horizontalLabelCommand;
      await sendRaw(payload);
    } catch {
      Alert.alert('Print Error', 'Lost connection to printer.');
      await toggleConnection(connectedDevice);
    } finally {
      setIsPrinting(false);
    }
  };

  const renderDevice = ({ item }: { item: Device }) => {
    const isConnected = connectedDevice?.address === item.address;
    const isOtherConnected = !!connectedDevice && !isConnected;

    return (
      <TouchableOpacity
        style={[
          styles.deviceItem,
          isConnected && styles.deviceItemActive,
          isOtherConnected && styles.deviceItemDisabled,
        ]}
        onPress={() => toggleConnection(item)}
        disabled={isConnecting || isOtherConnected}
        activeOpacity={0.7}
      >
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{item.name}</Text>
          <Text style={styles.deviceAddress}>{item.address}</Text>
        </View>

        {isConnected && (
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Connected</Text>
          </View>
        )}

        {!isConnected && !isOtherConnected && (
          <Text style={styles.connectLink}>Connect</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Label Printer</Text>
          <Text style={styles.subtitle}>Bluetooth Thermal Print Demo</Text>
        </View>

        {connectedDevice && (
          <TouchableOpacity
            onPress={handlePrint}
            disabled={isPrinting}
            style={[
              styles.actionButton,
              styles.printButton,
              isPrinting && styles.buttonDisabled,
            ]}
          >
            {isPrinting ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.printButtonText}>Print</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.content}>
        {isScanning && (
          <View style={styles.scanningIndicator}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.scanningText}>
              Searching for nearby printers...
            </Text>
          </View>
        )}

        {devices.length === 0 && !isScanning ? (
          <View style={styles.centerContainer}>
            {permissionDenied || !hasPermission ? (
              <>
                <Text style={styles.emptyTitle}>Permission Denied</Text>
                <Text style={styles.emptyText}>
                  Enable Bluetooth Connect to find printers.
                </Text>
                <TouchableOpacity
                  onPress={() => openSettings()}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Open Settings</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>No Devices Found</Text>
                <Text style={styles.emptyText}>
                  Ensure location and bluetooth are enabled, then scan again.
                </Text>
                <TouchableOpacity
                  onPress={handleManualScan}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Reload</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <FlatList
            data={devices}
            renderItem={renderDevice}
            keyExtractor={(item) => item.address}
            contentContainerStyle={styles.list}
          />
        )}
      </View>

      {isConnecting && (
        <View style={styles.overlay}>
          <View style={styles.overlayBox}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.overlayText}>Connecting...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },
  header: {
    padding: 24,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  title: { fontSize: 22, fontWeight: '800', color: '#000' },
  subtitle: { fontSize: 13, color: '#8E8E93', fontWeight: '500', marginTop: 2 },
  content: { flex: 1 },
  list: { padding: 20 },
  deviceItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3.84,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  deviceItemActive: { borderColor: '#34C759', backgroundColor: '#F2FFF5' },
  deviceItemDisabled: { opacity: 0.5 },
  deviceInfo: { flex: 1 },
  deviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  deviceAddress: {
    fontSize: 12,
    color: '#8E8E93',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  connectLink: { color: '#007AFF', fontWeight: '600', fontSize: 14 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFF',
    marginRight: 6,
  },
  statusText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  printButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    minWidth: 80,
    alignItems: 'center',
  },
  printButtonText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  secondaryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#E5F1FF',
    borderRadius: 12,
  },
  secondaryButtonText: { color: '#007AFF', fontWeight: '600' },
  actionButton: {},
  buttonDisabled: { opacity: 0.7 },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayBox: {
    backgroundColor: '#FFF',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  overlayText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  scanningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#E5F1FF',
    borderBottomWidth: 1,
    borderBottomColor: '#D1E5FF',
  },
  scanningText: {
    marginLeft: 10,
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
  },
});
