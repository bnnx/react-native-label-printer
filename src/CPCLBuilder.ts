/**
 * CPCL Text Options
 */
export interface CPCLTextOptions {
  /** Font type/name (e.g. "7", "5", "4", "0", "DEFAULT"). Default "7" (small) */
  font?: string;
  /** Font size/style index (often 0) */
  size?: number;
  /** Rotation: not strictly part of basic TEXT cmd, usually via SETMAG or BARCODE */
  rotation?: number;
}

/**
 * CPCL Barcode Options
 */
export interface CPCLBarcodeOptions {
  /** Narrow bar width */
  width?: number;
  /** Wide-to-narrow ratio */
  ratio?: number;
}

/**
 * CPCL QR Code Options
 */
export interface CPCLQrCodeOptions {
  /** Module size/width (1-32) */
  cellWidth?: number;
}

/**
 * CPCL Label Builder
 * Helper class to construct CPCL command strings for mobile thermal printers (Zebra, HoneyWell, etc).
 * Follows the Builder pattern for fluent chaining.
 */
export class CPCLBuilder {
  private _commands: string[] = [];
  private _height: number = 200;
  private _quantity: number = 1;
  private _offset: number = 0;

  /**
   * Start a new label definition
   * Syntax: ! <offset> <horizontal_resolution> <vertical_resolution> <height> <quantity>
   * @param height Label height in dots
   * @param offset Horizontal offset in dots (default 0)
   * @param quantity Number of copies (default 1)
   */
  setup(height: number, offset: number = 0, quantity: number = 1): CPCLBuilder {
    this._height = height;
    this._offset = offset;
    this._quantity = quantity;
    // 200 dpi is standard for most mobile printers.
    // The command is: ! <offset> <x-res> <y-res> <height> <qty>
    this._commands.push(`! ${offset} 200 200 ${height} ${quantity}`);
    return this;
  }

  /**
   * Set page width (printable area)
   * Syntax: PAGE-WIDTH <width>
   * @param width Width in dots
   */
  pageWidth(width: number): CPCLBuilder {
    this._commands.push(`PAGE-WIDTH ${width}`);
    return this;
  }

  /**
   * Set Character Set / Codepage
   * Syntax: COUNTRY/CODEPAGE parameters may vary by firmware.
   * Standard CPCL often handles ASCII or specific encoding commands.
   * For many printers: ENCODING UTF-8 or COUNTRY LATIN9 (similar to 1252)
   * This method uses the generic "COUNTRY" command or encoding command if supported.
   *
   * @param value Encoding/Country value (e.g. "LATIN9", "UTF-8", "CP1252")
   */
  encoding(value: string): CPCLBuilder {
    this._commands.push(`COUNTRY ${value}`);
    return this;
  }

  /**
   * Clear buffer/screen - CPCL doesn't usually have a direct "CLS" like TSPL,
   * but starting a new label with "!" basically resets.
   * Kept for API compatibility/consistency properly.
   */
  clear(): CPCLBuilder {
    this._commands = [];
    if (this._height > 0) {
      this._commands.push(
        `! ${this._offset} 200 200 ${this._height} ${this._quantity}`
      );
    }
    return this;
  }

  /**
   * Draw Text
   * Syntax: TEXT <font> <size> <x> <y> <data>
   * or T <font> <size> <x> <y> <data>
   *
   * @param x X pos in dots
   * @param y Y pos in dots
   * @param content Text content
   * @param options Font options
   */
  text(
    x: number,
    y: number,
    content: string,
    options?: CPCLTextOptions
  ): CPCLBuilder {
    const font = options?.font || '7'; // 7 is a common standard font in CPCL
    const size = options?.size || 0;

    // Basic Syntax: TEXT {font} {size} {x} {y} {data}
    this._commands.push(`TEXT ${font} ${size} ${x} ${y} ${content}`);
    return this;
  }

  /**
   * Draw Barcode
   * Syntax: BARCODE <type> <width> <ratio> <height> <x> <y> <data>
   *
   * @param x X pos
   * @param y Y pos
   * @param content Data
   * @param type Symbology (e.g. "128", "39", "EAN13"). Default "128"
   * @param height Height in dots
   * @param options width/ratio
   */
  barcode(
    x: number,
    y: number,
    content: string,
    type: string = '128',
    height: number = 50,
    options?: CPCLBarcodeOptions
  ): CPCLBuilder {
    const w = options?.width || 1;
    const r = options?.ratio || 1;
    // CPCL: BARCODE {type} {width} {ratio} {height} {x} {y} {data}
    this._commands.push(
      `BARCODE ${type} ${w} ${r} ${height} ${x} ${y} ${content}`
    );
    return this;
  }

  /**
   * Draw QR Code
   * Syntax: BARCODE QR <x> <y> M 2 U <size>
   *
   * @param x X pos
   * @param y Y pos
   * @param content Data
   * @param options size (multiplication factor)
   */
  qrCode(
    x: number,
    y: number,
    content: string,
    options?: CPCLQrCodeOptions
  ): CPCLBuilder {
    const size = options?.cellWidth || 6;
    // Syntax variant: BARCODE QR {x} {y} M 2 U {size}
    this._commands.push(`BARCODE QR ${x} ${y} M 2 U ${size}`);
    this._commands.push(`MA,${content}`);
    this._commands.push('ENDQR');
    return this;
  }

  /**
   * Draw Box (Line drawing)
   * Syntax: BOX <x> <y> <x_end> <y_end> <thickness>
   */
  box(
    x: number,
    y: number,
    xEnd: number,
    yEnd: number,
    thickness: number = 1
  ): CPCLBuilder {
    this._commands.push(`BOX ${x} ${y} ${xEnd} ${yEnd} ${thickness}`);
    return this;
  }

  /**
   * Print command
   * Syntax: PRINT or FORM
   */
  print(): CPCLBuilder {
    this._commands.push('PRINT');
    return this;
  }

  /**
   * Feed paper command (advance)
   * Syntax: POSTFEED <scroll_length>
   * @param dots Dots to feed
   */
  feed(dots: number): CPCLBuilder {
    this._commands.push(`POSTFEED ${dots}`);
    return this;
  }

  /**
   * Build the final raw string
   */
  build(): string {
    return this._commands.join('\r\n') + '\r\n';
  }
}
