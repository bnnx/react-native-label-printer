package com.labelprinter

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue

@SuppressLint("MissingPermission")
class LabelPrinterModule(reactContext: ReactApplicationContext) :
  NativeLabelPrinterSpec(reactContext) {

  private var bluetoothAdapter: BluetoothAdapter? = null
  private var bluetoothGatt: BluetoothGatt? = null
  private var writeCharacteristic: BluetoothGattCharacteristic? = null

  private var connectPromise: Promise? = null
  private var sendPromise: Promise? = null

  @Volatile private var isWriting = false
  private var currentMtu = 23
  private val writeQueue = ConcurrentLinkedQueue<ByteArray>()

  init {
    val bluetoothManager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?
    bluetoothAdapter = bluetoothManager?.adapter
  }

  companion object {
    const val NAME = NativeLabelPrinterSpec.NAME
  }

  private val scanCallback = object : ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult) {
      val device = result.device
      val deviceName = device.name ?: result.scanRecord?.deviceName ?: ""
      val address = device.address

      var isLikelyPrinter = false

      if (deviceName.isNotEmpty()) {
        val printerPrefixes = listOf(
          "Printer", "MTP", "XP-", "Zebra", "RP-", "POS", "MP",
          "Label", "Thermal", "SP-", "PT-", "TM-", "GOOJPRRT", "LabelPrinter", "ZPT"
        )
        for (prefix in printerPrefixes) {
          if (deviceName.contains(prefix, ignoreCase = true)) {
            isLikelyPrinter = true
            break
          }
        }
      }

      if (!isLikelyPrinter) {
        val serviceUuids = result.scanRecord?.serviceUuids
        if (serviceUuids != null) {
          for (uuid in serviceUuids) {
            val uuidStr = uuid.uuid.toString().uppercase()
            if (uuidStr.contains("18F0") || uuidStr.contains("AFE0") ||
              uuidStr.contains("FF00") || uuidStr.contains("FEE7")) {
              isLikelyPrinter = true
              break
            }
          }
        }
      }

      if (isLikelyPrinter) {
        val map = Arguments.createMap()
        map.putString("name", if (deviceName.isEmpty()) "Unknown Printer" else deviceName)
        map.putString("address", address)
        reactApplicationContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("onPrinterFound", map)
      }
    }
  }

  private val gattCallback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_CONNECTED) {
        gatt.discoverServices()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
          gatt.requestMtu(512)
        }
      } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        closeGatt()
      }
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      if (status == BluetoothGatt.GATT_SUCCESS) {
        var found = false
        for (service in gatt.services) {
          for (char in service.characteristics) {
            val props = char.properties
            if ((props and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0 ||
                (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
              writeCharacteristic = char
              found = true
              break
            }
          }
          if (found) break
        }

        if (found) {
          connectPromise?.resolve(true)
          connectPromise = null
        } else {
          connectPromise?.reject("NO_CHARACTERISTIC", "Could not find a writable characteristic")
          connectPromise = null
          closeGatt()
        }
      } else {
        connectPromise?.reject("DISCOVER_FAILED", "Failed to discover services")
        connectPromise = null
        closeGatt()
      }
    }

    override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
      if (status == BluetoothGatt.GATT_SUCCESS) {
        currentMtu = mtu
      }
    }

    override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      if (status != BluetoothGatt.GATT_SUCCESS) {
        isWriting = false
        writeQueue.clear()
        sendPromise?.reject("WRITE_FAILED", "Write failed with status $status")
        sendPromise = null
        return
      }

      val writeType = characteristic.writeType
      if (writeType == BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE) {
        Handler(Looper.getMainLooper()).postDelayed({
          if (isWriting) {
            sendNextChunkInQueue()
          }
        }, 10)
      } else {
        sendNextChunkInQueue()
      }
    }
  }

  override fun startScan() {
    if (bluetoothAdapter == null) return
    val scanner = bluetoothAdapter!!.bluetoothLeScanner ?: return
    try {
      scanner.startScan(scanCallback)
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }

  override fun stopScan() {
    if (bluetoothAdapter == null) return
    val scanner = bluetoothAdapter!!.bluetoothLeScanner ?: return
    try {
      scanner.stopScan(scanCallback)
    } catch (e: Exception) {}
  }

  override fun connect(address: String, promise: Promise) {
    if (bluetoothAdapter == null) {
      promise.reject("BLUETOOTH_UNAVAILABLE", "Bluetooth is not supported")
      return
    }

    try {
      val device = bluetoothAdapter!!.getRemoteDevice(address)
      closeGatt()
      
      connectPromise = promise
      
      val handler = Handler(Looper.getMainLooper())
      val timeoutRunnable = Runnable {
        if (connectPromise != null) {
          closeGatt()
          connectPromise?.reject("CONNECT_TIMEOUT", "Connection timed out (printer may be off or out of range).")
          connectPromise = null
        }
      }
      handler.postDelayed(timeoutRunnable, 5000)

      Handler(Looper.getMainLooper()).post {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          bluetoothGatt = device.connectGatt(reactApplicationContext, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        } else {
          bluetoothGatt = device.connectGatt(reactApplicationContext, false, gattCallback)
        }
      }
    } catch (e: Exception) {
      promise.reject("CONNECTION_FAILED", "Failed: ${e.message}")
    }
  }

  override fun disconnect(promise: Promise) {
    try {
      closeGatt()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ERROR", "Failed to disconnect: ${e.message}")
    }
  }

  override fun sendRaw(data: String, promise: Promise) {
    if (bluetoothGatt == null || writeCharacteristic == null) {
      promise.reject("NOT_CONNECTED", "Printer is not connected")
      return
    }

    if (isWriting) {
      promise.reject("BUSY", "Already writing data")
      return
    }

    isWriting = true
    sendPromise = promise
    
    // Cap write size to 150 bytes to avoid printer firmware issues with large single BLE writes.
    // Many cheap BLE thermal printers cannot reliably process payloads > ~180 bytes.
    val maxMtu = Math.max(20, currentMtu - 3)
    val chunkSize = Math.min(150, maxMtu)

    // Split on line boundaries to avoid breaking TSPL commands across BLE writes.
    // The printer firmware cannot reassemble commands split across separate writes.
    writeQueue.clear()
    var currentChunk = ByteArray(0)
    
    for (line in data.split("\n")) {
      if (line.isEmpty()) continue
      
      val lineBytes = (line + "\n").toByteArray(Charsets.UTF_8)
      
      // If adding this line would exceed max, flush the current chunk first
      if (currentChunk.isNotEmpty() && currentChunk.size + lineBytes.size > chunkSize) {
        writeQueue.add(currentChunk)
        currentChunk = ByteArray(0)
      }
      
      // If a single line is larger than chunkSize, send it as its own chunk
      if (lineBytes.size > chunkSize) {
        writeQueue.add(lineBytes)
      } else {
        currentChunk = currentChunk + lineBytes
      }
    }
    
    // Flush remaining data
    if (currentChunk.isNotEmpty()) {
      writeQueue.add(currentChunk)
    }

    sendNextChunkInQueue()
  }

  @Suppress("DEPRECATION")
  private fun sendNextChunkInQueue() {
    val chunk = writeQueue.poll()
    if (chunk == null) {
      isWriting = false
      sendPromise?.resolve(true)
      sendPromise = null
      return
    }

    val char = writeCharacteristic ?: return

    val props = char.properties
    val writeType = if ((props and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0) {
      BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
    } else {
      BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
    }

    val success = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
      val result = bluetoothGatt?.writeCharacteristic(char, chunk, writeType)
      result == android.bluetooth.BluetoothStatusCodes.SUCCESS
    } else {
      char.value = chunk
      char.writeType = writeType
      bluetoothGatt?.writeCharacteristic(char) ?: false
    }

    if (!success) {
      isWriting = false
      writeQueue.clear()
      sendPromise?.reject("WRITE_FAILED", "Failed to initiate write characteristic")
      sendPromise = null
    }
  }

  private fun closeGatt() {
    val address = bluetoothGatt?.device?.address
    try {
      bluetoothGatt?.disconnect()
      bluetoothGatt?.close()
    } catch (e: Exception) {}
    bluetoothGatt = null
    writeCharacteristic = null
    isWriting = false
    writeQueue.clear()
    currentMtu = 23
    
    connectPromise?.reject("DISCONNECTED", "Disconnected prematurely")
    connectPromise = null
    sendPromise?.reject("DISCONNECTED", "Disconnected during write")
    sendPromise = null

    if (address != null) {
      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("onPrinterDisconnected", address)
    }
  }

  override fun addListener(eventName: String) {}

  override fun removeListeners(count: Double) {}
}
