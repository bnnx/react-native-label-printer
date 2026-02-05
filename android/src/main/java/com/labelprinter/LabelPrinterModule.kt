package com.labelprinter

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.io.IOException
import java.util.UUID

class LabelPrinterModule(reactContext: ReactApplicationContext) :
  NativeLabelPrinterSpec(reactContext) {

  private var bluetoothAdapter: BluetoothAdapter? = null
  private var mmSocket: BluetoothSocket? = null

  init {
    val bluetoothManager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?
    bluetoothAdapter = bluetoothManager?.adapter
  }

  companion object {
    const val NAME = NativeLabelPrinterSpec.NAME
    private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
  }

  override fun listBondedDevices(promise: Promise) {
    if (bluetoothAdapter == null) {
      promise.reject("BLUETOOTH_UNAVAILABLE", "Bluetooth is not supported on this device")
      return
    }

    if (!hasPermission()) {
      promise.reject("PERMISSION_DENIED", "Bluetooth connect permission denied")
      return
    }

    try {
      val bondedDevices = bluetoothAdapter!!.bondedDevices
      val result = Arguments.createArray()

      bondedDevices.forEach { device ->
        val map = Arguments.createMap()
        map.putString("name", device.name ?: "Unknown")
        map.putString("address", device.address)
        result.pushMap(map)
      }

      promise.resolve(result)
    } catch (e: SecurityException) {
      promise.reject("PERMISSION_DENIED", "Permission denied: ${e.message}")
    } catch (e: Exception) {
      promise.reject("ERROR", e.message)
    }
  }

  override fun connect(address: String, promise: Promise) {
    if (bluetoothAdapter == null) {
      promise.reject("BLUETOOTH_UNAVAILABLE", "Bluetooth is not supported on this device")
      return
    }

    if (!hasPermission()) {
      promise.reject("PERMISSION_DENIED", "Bluetooth connect permission denied")
      return
    }

    Thread {
      try {
        val device = bluetoothAdapter!!.getRemoteDevice(address)
        
        closeSocket()

        val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
        socket.connect()
        mmSocket = socket
        promise.resolve(true)
      } catch (e: IOException) {
        closeSocket()
        promise.reject("CONNECTION_FAILED", "Could not connect to device: ${e.message}")
      } catch (e: Exception) {
        closeSocket()
        promise.reject("ERROR", "Unexpected error: ${e.message}")
      }
    }.start()
  }

  override fun disconnect(promise: Promise) {
    try {
      closeSocket()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ERROR", "Failed to disconnect: ${e.message}")
    }
  }

  override fun sendRaw(data: String, promise: Promise) {
    if (mmSocket == null || !mmSocket!!.isConnected) {
      promise.reject("NOT_CONNECTED", "Printer is not connected")
      return
    }

    if (!hasPermission()) {
      promise.reject("PERMISSION_DENIED", "Bluetooth connect permission denied")
      return
    }

    Thread {
      try {
        val outputStream = mmSocket!!.outputStream
        val bytes = data.toByteArray(Charsets.UTF_8)
        outputStream.write(bytes)
        outputStream.flush()
        promise.resolve(true)
      } catch (e: IOException) {
        closeSocket()
        promise.reject("PRINT_FAILED", "Failed to send data to printer: " + e.message)
      } catch (e: Exception) {
        promise.reject("ERROR", "Unexpected error: " + e.message)
      }
    }.start()
  }

  private fun hasPermission(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return true
    }
    return ActivityCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
  }

  private fun closeSocket() {
    try {
      mmSocket?.close()
    } catch (e: IOException) {}
    mmSocket = null
  }
}
