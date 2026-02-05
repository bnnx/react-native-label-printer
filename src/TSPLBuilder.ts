/**
 * TSPL Text Options
 */
export interface TSPLTextOptions {
  /** Font name (e.g. "0"-"8", "TSS24.BF2", "ROMAN.TTF"). Default "0" */
  font?: string;
  /** Rotation in degrees (0, 90, 180, 270) */
  rotation?: 0 | 90 | 180 | 270;
  /** Horizontal multiplication (1-10) */
  xMultiplication?: number;
  /** Vertical multiplication (1-10) */
  yMultiplication?: number;
}

/**
 * TSPL Barcode Options
 */
export interface TSPLBarcodeOptions {
  /** Human readable (true/false) */
  humanReadable?: boolean;
  /** Rotation in degrees (0, 90, 180, 270) */
  rotation?: 0 | 90 | 180 | 270;
  /** Narrow bar width in dots */
  narrow?: number;
  /** Wide bar width in dots */
  wide?: number;
}

/**
 * TSPL QR Code Options
 */
export interface TSPLQrCodeOptions {
  /** Error correction level: L, M, Q, H */
  eccLevel?: 'L' | 'M' | 'Q' | 'H';
  /** Cell width (dot size) 1-10 */
  cellWidth?: number;
  /** Mode: A (Auto), M (Manual) */
  mode?: 'A' | 'M';
  /** Rotation */
  rotation?: 0 | 90 | 180 | 270;
}

/**
 * TSPL Label Builder
 * Helper class to construct TSPL command strings for thermal printers.
 * Follows the Builder pattern for fluent chaining.
 */
export class TSPLBuilder {
  private commands: string[] = [];

  /**
   * Set the label size
   * @param widthMm Width in mm
   * @param heightMm Height in mm
   */
  size(widthMm: number, heightMm: number): TSPLBuilder {
    this.commands.push(`SIZE ${widthMm} mm,${heightMm} mm`);
    return this;
  }

  /**
   * Set the gap between labels
   * @param gapMm Gap size in mm
   * @param offsetMm Offset in mm (default 0)
   */
  gap(gapMm: number, offsetMm: number = 0): TSPLBuilder {
    this.commands.push(`GAP ${gapMm} mm,${offsetMm} mm`);
    return this;
  }

  /**
   * Clear the image buffer
   */
  cls(): TSPLBuilder {
    this.commands.push('CLS');
    return this;
  }

  /**
   * Set the code page for character encoding
   * Recommended: "1252" (Windows Latin 1) for Western European languages (supports ç, ã, etc).
   * Note: Support depends on printer firmware.
   * If not supported, consider handling encoding at native level or keeping standard ASCII.
   * @param value Code page value (e.g. "1252", "850", "437")
   */
  codePage(value: string): TSPLBuilder {
    this.commands.push(`CODEPAGE ${value}`);
    return this;
  }

  /**
   * Alias for cls() - Clear the image buffer
   */
  clear(): TSPLBuilder {
    return this.cls();
  }

  /**
   * Define direction of printing
   * @param direction 0 or 1
   */
  direction(direction: 0 | 1): TSPLBuilder {
    this.commands.push(`DIRECTION ${direction}`);
    return this;
  }

  /**
   * Define reference point of label
   * @param x Horizontal coordinate
   * @param y Vertical coordinate
   */
  reference(x: number, y: number): TSPLBuilder {
    this.commands.push(`REFERENCE ${x},${y}`);
    return this;
  }

  /**
   * Set printing density
   * @param value Density value (0-15)
   */
  density(value: number): TSPLBuilder {
    this.commands.push(`DENSITY ${value}`);
    return this;
  }

  /**
   * Feed paper
   * @param mm Distance in mm
   */
  feed(mm: number): TSPLBuilder {
    this.commands.push(`FEED ${mm}`);
    return this;
  }

  /**
   * Set printing speed
   * @param value Speed value (e.g. 1.5, 2.0, 3.0, 4.0, etc.)
   */
  speed(value: number): TSPLBuilder {
    this.commands.push(`SPEED ${value}`);
    return this;
  }

  /**
   * Draw a box
   * @param x Coordinate x
   * @param y Coordinate y
   * @param xEnd End coordinate x
   * @param yEnd End coordinate y
   * @param thickness Line thickness (default 1)
   */
  box(
    x: number,
    y: number,
    xEnd: number,
    yEnd: number,
    thickness: number = 1
  ): TSPLBuilder {
    this.commands.push(`BOX ${x},${y},${xEnd},${yEnd},${thickness}`);
    return this;
  }

  /**
   * Draw text
   * @param x Coordinate x
   * @param y Coordinate y
   * @param content Text content
   * @param options Text options (font, rotation, magnification)
   */
  text(
    x: number,
    y: number,
    content: string,
    options?: TSPLTextOptions
  ): TSPLBuilder {
    const font = options?.font || '0';
    const rot = options?.rotation || 0;
    const xMul = options?.xMultiplication || 1;
    const yMul = options?.yMultiplication || 1;
    // Escape quotes in content
    const safeContent = content.replace(/"/g, '\\"');

    this.commands.push(
      `TEXT ${x},${y},"${font}",${rot},${xMul},${yMul},"${safeContent}"`
    );
    return this;
  }

  /**
   * Draw a barcode
   * @param x Coordinate x
   * @param y Coordinate y
   * @param content Barcode content
   * @param type Barcode type (e.g. "128", "39", "EAN13")
   * @param height Height in dots
   * @param options Barcode options
   */
  barcode(
    x: number,
    y: number,
    content: string,
    type: string = '128',
    height: number = 50,
    options?: TSPLBarcodeOptions
  ): TSPLBuilder {
    const readable = options?.humanReadable ? 1 : 0;
    const rot = options?.rotation || 0;
    // Default narrow/wide values roughly standard; can vary by type
    const narrow = options?.narrow || 1;
    const wide = options?.wide || 1;

    const safeContent = content.replace(/"/g, '\\"');
    this.commands.push(
      `BARCODE ${x},${y},"${type}",${height},${readable},${rot},${narrow},${wide},"${safeContent}"`
    );
    return this;
  }

  /**
   * Draw a QR Code
   * @param x Coordinate x
   * @param y Coordinate y
   * @param content content
   * @param options QR options
   */
  qrCode(
    x: number,
    y: number,
    content: string,
    options?: TSPLQrCodeOptions
  ): TSPLBuilder {
    const ecc = options?.eccLevel || 'L';
    const cellWidth = options?.cellWidth || 5;
    const mode = options?.mode || 'A';
    const rot = options?.rotation || 0;
    const safeContent = content.replace(/"/g, '\\"');

    this.commands.push(
      `QRCODE ${x},${y},${ecc},${cellWidth},${mode},${rot},"${safeContent}"`
    );
    return this;
  }

  /**
   * Print the label
   * @param copies Number of copies
   */
  print(copies: number = 1): TSPLBuilder {
    this.commands.push(`PRINT ${copies}`);
    return this;
  }

  /**
   * Build the final raw string commands
   */
  build(): string {
    return this.commands.join('\n') + '\n';
  }
}
