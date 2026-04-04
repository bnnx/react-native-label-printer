#import "LabelPrinter.h"
#import <CoreBluetooth/CoreBluetooth.h>

@interface LabelPrinter () <CBCentralManagerDelegate, CBPeripheralDelegate>

@property (nonatomic, strong) CBCentralManager *centralManager;
@property (nonatomic, strong) NSMutableDictionary<NSString *, CBPeripheral *> *discoveredPeripherals;
@property (nonatomic, strong) CBPeripheral *connectedPeripheral;
@property (nonatomic, strong) CBCharacteristic *writeCharacteristic;

@property (nonatomic, strong) RCTPromiseResolveBlock connectResolve;
@property (nonatomic, strong) RCTPromiseRejectBlock connectReject;

@property (nonatomic, strong) RCTPromiseResolveBlock sendResolve;
@property (nonatomic, strong) RCTPromiseRejectBlock sendReject;

@property (nonatomic, assign) BOOL isWriting;
@property (nonatomic, strong) NSMutableArray<NSData *> *writeQueue;

@end

@implementation LabelPrinter

RCT_EXPORT_MODULE()

- (instancetype)init {
  self = [super init];
  if (self) {
    _centralManager = [[CBCentralManager alloc] initWithDelegate:self queue:dispatch_get_main_queue()];
    _discoveredPeripherals = [NSMutableDictionary new];
    _writeQueue = [NSMutableArray new];
  }
  return self;
}

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[@"onPrinterFound", @"onPrinterDisconnected", @"onBluetoothStateChange"];
}

- (void)startScan {
  if (self.centralManager.state == CBManagerStatePoweredOn) {
    [self.centralManager scanForPeripheralsWithServices:nil options:@{ CBCentralManagerScanOptionAllowDuplicatesKey: @YES }];
  }
}

- (void)stopScan {
  [self.centralManager stopScan];
}

- (void)connect:(NSString *)address resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  CBPeripheral *peripheral = self.discoveredPeripherals[address];
  if (!peripheral) {
    NSUUID *uuid = [[NSUUID alloc] initWithUUIDString:address];
    if (uuid) {
      NSArray *peripherals = [self.centralManager retrievePeripheralsWithIdentifiers:@[uuid]];
      if (peripherals.count > 0) {
        peripheral = peripherals.firstObject;
      }
    }
  }

  if (!peripheral) {
    reject(@"NOT_FOUND", @"Printer not found in scan results", nil);
    return;
  }

  [self closeConnection];
  self.connectResolve = resolve;
  self.connectReject = reject;
  self.connectedPeripheral = peripheral;
  self.connectedPeripheral.delegate = self;
  
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(5.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      if (self.connectReject) {
          [self.centralManager cancelPeripheralConnection:peripheral];
          self.connectReject(@"CONNECT_TIMEOUT", @"Connection timed out (printer may be off or out of range).", nil);
          self.connectResolve = nil;
          self.connectReject = nil;
      }
  });

  [self.centralManager connectPeripheral:peripheral options:nil];
}

- (void)disconnect:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [self closeConnection];
  resolve(@(YES));
}

- (void)isBluetoothEnabled:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  BOOL isEnabled = (self.centralManager.state == CBManagerStatePoweredOn);
  resolve(@(isEnabled));
}

- (void)sendRaw:(NSString *)data resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  if (!self.connectedPeripheral || !self.writeCharacteristic) {
    reject(@"NOT_CONNECTED", @"Printer is not connected", nil);
    return;
  }
  
  if (self.isWriting) {
    reject(@"BUSY", @"Already sending data", nil);
    return;
  }
  
  self.isWriting = YES;
  self.sendResolve = resolve;
  self.sendReject = reject;
  
  CBCharacteristicWriteType type = CBCharacteristicWriteWithResponse;
  if ((self.writeCharacteristic.properties & CBCharacteristicPropertyWrite) != 0) {
      type = CBCharacteristicWriteWithResponse;
  } else if ((self.writeCharacteristic.properties & CBCharacteristicPropertyWriteWithoutResponse) != 0) {
      type = CBCharacteristicWriteWithoutResponse;
  }
  
  NSUInteger reportedMax = [self.connectedPeripheral maximumWriteValueLengthForType:type];
  // Cap write size to avoid printer firmware issues with large single BLE writes.
  // Many cheap BLE thermal printers cannot reliably process payloads > ~180 bytes
  // in a single write, causing data at the end (e.g. QR codes) to be silently dropped.
  NSUInteger maxLen = MIN(reportedMax, 150);
  if (maxLen < 20) maxLen = 20;
  
  [self.writeQueue removeAllObjects];
  
  // Split on line boundaries to ensure each BLE write contains only complete TSPL commands.
  NSArray<NSString *> *lines = [data componentsSeparatedByString:@"\n"];
  NSMutableData *currentChunk = [NSMutableData new];
  
  for (NSString *line in lines) {
    if (line.length == 0) continue;
    
    NSData *lineData = [[line stringByAppendingString:@"\n"] dataUsingEncoding:NSUTF8StringEncoding];
    
    if (currentChunk.length > 0 && currentChunk.length + lineData.length > maxLen) {
      [self.writeQueue addObject:[currentChunk copy]];
      currentChunk = [NSMutableData new];
    }
    
    if (lineData.length > maxLen) {
      [self.writeQueue addObject:lineData];
    } else {
      [currentChunk appendData:lineData];
    }
  }
  
  if (currentChunk.length > 0) {
    [self.writeQueue addObject:[currentChunk copy]];
  }
  
  [self sendNextChunk];
}

- (void)sendNextChunk {
  if (self.writeQueue.count == 0) {
    self.isWriting = NO;

    if (self.sendResolve) {
      self.sendResolve(@(YES));
      self.sendResolve = nil;
      self.sendReject = nil;
    }
    return;
  }
  
  NSData *chunk = self.writeQueue.firstObject;
  [self.writeQueue removeObjectAtIndex:0];
  
  CBCharacteristicWriteType type = CBCharacteristicWriteWithResponse;
  if ((self.writeCharacteristic.properties & CBCharacteristicPropertyWrite) != 0) {
      type = CBCharacteristicWriteWithResponse;
  } else if ((self.writeCharacteristic.properties & CBCharacteristicPropertyWriteWithoutResponse) != 0) {
      type = CBCharacteristicWriteWithoutResponse;
  }
  

  [self.connectedPeripheral writeValue:chunk forCharacteristic:self.writeCharacteristic type:type];
  
  if (type == CBCharacteristicWriteWithoutResponse) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(10 * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
      if (self.isWriting) {
        [self sendNextChunk];
      }
    });
  }
}

- (void)closeConnection {
  NSString *address = nil;
  if (self.connectedPeripheral) {
    address = self.connectedPeripheral.identifier.UUIDString;
    [self.centralManager cancelPeripheralConnection:self.connectedPeripheral];
  }
  self.connectedPeripheral = nil;
  self.writeCharacteristic = nil;
  self.isWriting = NO;
  [self.writeQueue removeAllObjects];
  
  if (self.connectReject) {
    self.connectReject(@"DISCONNECTED", @"Disconnected", nil);
    self.connectReject = nil;
    self.connectResolve = nil;
  }
  
  if (self.sendReject) {
    self.sendReject(@"DISCONNECTED", @"Disconnected during send", nil);
    self.sendReject = nil;
    self.sendResolve = nil;
  }
  
  if (address) {
    [self sendEventWithName:@"onPrinterDisconnected" body:address];
  }
}

#pragma mark - CBCentralManagerDelegate

- (void)centralManagerDidUpdateState:(CBCentralManager *)central {
  BOOL isEnabled = (central.state == CBManagerStatePoweredOn);
  [self sendEventWithName:@"onBluetoothStateChange" body:@(isEnabled)];
}

- (void)centralManager:(CBCentralManager *)central didDiscoverPeripheral:(CBPeripheral *)peripheral advertisementData:(NSDictionary<NSString *,id> *)advertisementData RSSI:(NSNumber *)RSSI {
  BOOL isLikelyPrinter = NO;

  NSString *deviceName = peripheral.name;
  if (!deviceName) {
      deviceName = advertisementData[CBAdvertisementDataLocalNameKey];
  }

  if (deviceName && deviceName.length > 0) {
    NSArray *printerPrefixes = @[
      @"Printer", @"MTP", @"XP-", @"Zebra", @"RP-", @"POS", @"MP",
      @"Label", @"Thermal", @"SP-", @"PT-", @"TM-", @"GOOJPRRT", @"LabelPrinter", @"ZPT"
    ];

    for (NSString *prefix in printerPrefixes) {
      if ([deviceName rangeOfString:prefix options:NSCaseInsensitiveSearch].location != NSNotFound) {
        isLikelyPrinter = YES;
        break;
      }
    }
  }

  if (!isLikelyPrinter) {
    NSArray<CBUUID *> *serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey];
    if (serviceUUIDs) {
      for (CBUUID *uuid in serviceUUIDs) {
        NSString *uuidStr = [uuid.UUIDString uppercaseString];
        if ([uuidStr containsString:@"18F0"] || [uuidStr containsString:@"AFE0"] ||
            [uuidStr containsString:@"FF00"] || [uuidStr containsString:@"FEE7"]) {
          isLikelyPrinter = YES;
          break;
        }
      }
    }
  }

  if (isLikelyPrinter) {
    [self.discoveredPeripherals setObject:peripheral forKey:peripheral.identifier.UUIDString];
    
    NSString *address = peripheral.identifier.UUIDString;
    [self sendEventWithName:@"onPrinterFound" body:@{
      @"name": deviceName ?: @"Unknown Printer",
      @"address": address
    }];
  }
}

- (void)centralManager:(CBCentralManager *)central didConnectPeripheral:(CBPeripheral *)peripheral {
  [peripheral discoverServices:nil];
}

- (void)centralManager:(CBCentralManager *)central didFailToConnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error {
  if (self.connectReject) {
    self.connectReject(@"CONNECT_ERROR", error.localizedDescription, nil);
    self.connectReject = nil;
    self.connectResolve = nil;
  }
  [self closeConnection];
}

- (void)centralManager:(CBCentralManager *)central didDisconnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error {
  [self closeConnection];
}

#pragma mark - CBPeripheralDelegate

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverServices:(NSError *)error {
  if (error) {
    [self closeConnection];
    return;
  }
  for (CBService *service in peripheral.services) {
    [peripheral discoverCharacteristics:nil forService:service];
  }
}

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverCharacteristicsForService:(CBService *)service error:(NSError *)error {
  if (error) return;
  
  BOOL found = NO;
  for (CBCharacteristic *charac in service.characteristics) {
    if (charac.properties & CBCharacteristicPropertyWrite ||
        charac.properties & CBCharacteristicPropertyWriteWithoutResponse) {
      self.writeCharacteristic = charac;
      found = YES;
      break;
    }
  }
  
  if (found && self.connectResolve) {
    self.connectResolve(@(YES));
    self.connectResolve = nil;
    self.connectReject = nil;
  }
}
- (void)peripheral:(CBPeripheral *)peripheral didWriteValueForCharacteristic:(CBCharacteristic *)characteristic error:(NSError *)error {
  if (error) {

    self.isWriting = NO;
    [self.writeQueue removeAllObjects];
    if (self.sendReject) {
      self.sendReject(@"WRITE_ERROR", error.localizedDescription, nil);
      self.sendReject = nil;
      self.sendResolve = nil;
    }
    return;
  }
  

  [self sendNextChunk];
}

- (void)peripheralIsReadyToSendWriteWithoutResponse:(CBPeripheral *)peripheral {}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeLabelPrinterSpecJSI>(params);
}

@end
