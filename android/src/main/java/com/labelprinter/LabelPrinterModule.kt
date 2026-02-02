package com.labelprinter

import com.facebook.react.bridge.ReactApplicationContext

class LabelPrinterModule(reactContext: ReactApplicationContext) :
  NativeLabelPrinterSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeLabelPrinterSpec.NAME
  }
}
