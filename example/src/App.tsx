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
import {
  listBondedDevices,
  connect,
  sendRaw,
  TSPLBuilder,
} from 'react-native-label-printer';
import {
  check,
  request,
  PERMISSIONS,
  RESULTS,
  openSettings,
} from 'react-native-permissions';

type Device = { name: string; address: string };

const PRODUCT = {
  id: '006c2c24-b45d-4bf1-baae-2a94f40ebc38',
  name: 'My Store',
  description: 'Jeans Pants',
  size: 'M',
  color: 'Blue',
  price: '159.90',
  code: '0126/1-001-001',
};

export default function App() {
  const [bondedDevices, setBondedDevices] = useState<Device[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const handleBlockedPermission = () => {
    Alert.alert(
      'Permission Required',
      'Bluetooth permission is required to list paired devices. Please enable it in settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: openSettings },
      ]
    );
  };

  const requestPermission = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return true;
    }

    const permission = PERMISSIONS.ANDROID.BLUETOOTH_CONNECT;
    const result = await check(permission);

    // TO-DO: validate when Android version < 12
    if (result === RESULTS.GRANTED || result === RESULTS.UNAVAILABLE) {
      return true;
    }

    if (result === RESULTS.DENIED || result === RESULTS.LIMITED) {
      const newResult = await request(permission);
      if (newResult === RESULTS.BLOCKED) {
        handleBlockedPermission();
      }
      return newResult === RESULTS.GRANTED;
    }

    if (result === RESULTS.BLOCKED) {
      handleBlockedPermission();
    }

    return false;
  }, []);

  const loadBondedDevices = useCallback(async () => {
    setIsLoading(true);
    setPermissionDenied(false);
    try {
      const hasPermission = await requestPermission();
      if (!hasPermission) {
        setPermissionDenied(true);
        return;
      }

      const result = await listBondedDevices();
      setBondedDevices(result);
    } catch {
      Alert.alert('Error', 'Failed to list devices');
    } finally {
      setIsLoading(false);
    }
  }, [requestPermission]);

  const handleConnect = async (device: Device) => {
    setIsConnecting(true);
    try {
      const hasPermission = await requestPermission();
      if (!hasPermission) return;

      await connect(device.address);
      Alert.alert('Success', `Connected to ${device.name}`);
    } catch {
      Alert.alert('Connection Failed', 'Could not connect to device');
    } finally {
      setIsConnecting(false);
    }
  };

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      const hasPermission = await requestPermission();
      if (!hasPermission) return;

      const command = new TSPLBuilder()
        .size(51, 30)
        .gap(2)
        .clear()
        .text(10, 220, PRODUCT.name, { rotation: 270 })
        .text(50, 220, PRODUCT.description, { rotation: 270 })
        .text(80, 220, `Size: ${PRODUCT.size}`, { rotation: 270 })
        .text(110, 220, `Color: ${PRODUCT.color}`, { rotation: 270 })
        .text(180, 220, '$ ', { rotation: 270 })
        .text(160, 190, PRODUCT.price, {
          rotation: 270,
          xMultiplication: 2,
          yMultiplication: 2,
        })
        .qrCode(220, 175, PRODUCT.id, {
          rotation: 270,
          cellWidth: 4,
        })
        .text(350, 205, PRODUCT.code, { rotation: 270 })
        .print(1)
        .build();

      await sendRaw(command);
      Alert.alert('Success', 'Printed successfully');
    } catch {
      Alert.alert('Print Failed', 'Could not print');
    } finally {
      setIsPrinting(false);
    }
  };

  useEffect(() => {
    loadBondedDevices();
  }, [loadBondedDevices]);

  const renderDevice = ({ item }: { item: Device }) => (
    <TouchableOpacity
      style={styles.deviceItem}
      onPress={() => handleConnect(item)}
      disabled={isConnecting}
    >
      <View>
        <Text style={styles.deviceName}>{item.name}</Text>
        <Text style={styles.deviceAddress}>{item.address}</Text>
      </View>
      <View style={styles.chevron}>
        <Text style={styles.chevronText}>Connect</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Paired Devices</Text>
        <TouchableOpacity
          onPress={handlePrint}
          disabled={isLoading || isConnecting || isPrinting}
          style={styles.refreshButton}
        >
          <Text style={styles.refreshText}>Print</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={loadBondedDevices}
          disabled={isLoading || isConnecting || isPrinting}
          style={styles.refreshButton}
        >
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#007AFF" />
        ) : bondedDevices.length === 0 ? (
          <View style={styles.emptyContainer}>
            {permissionDenied ? (
              <>
                <Text style={styles.emptyText}>Permission Required</Text>
                <Text style={styles.emptySubText}>
                  Bluetooth permission is denied. Please enable it in settings
                  to list devices.
                </Text>
                <TouchableOpacity
                  onPress={() => openSettings()}
                  style={styles.settingsButton}
                >
                  <Text style={styles.settingsButtonText}>Open Settings</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.emptyText}>No paired devices found.</Text>
                <Text style={styles.emptySubText}>
                  Pair a Bluetooth printer in Android settings first.
                </Text>
              </>
            )}
          </View>
        ) : (
          <FlatList
            data={bondedDevices}
            renderItem={renderDevice}
            keyExtractor={(item) => item.address}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      {isConnecting && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Connecting...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  refreshButton: {
    padding: 8,
  },
  refreshText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  deviceItem: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  deviceAddress: {
    fontSize: 12,
    color: '#8E8E93',
  },
  chevron: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chevronText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#AEAEB2',
    textAlign: 'center',
    marginBottom: 20,
  },
  settingsButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  settingsButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#000000',
    fontWeight: '500',
  },
});
