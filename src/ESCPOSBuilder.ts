/* eslint-disable no-bitwise */
import { packMonoBitmap, type MonoBitmap } from './bitmap';
import { concatBytes } from './bytes';
import { assertIntegerInRange } from './validate';

const ESC = 0x1b;
const GS = 0x1d;

export type ESCPOSAlignment = 'left' | 'center' | 'right';

export interface ESCPOSRasterOptions {
  /**
   * Rows per `GS v 0` command. Large images are streamed as consecutive
   * bands so cheap printers with small buffers are not overwhelmed.
   * Must be an integer >= 1. Many firmwares reject bands taller than ~2300
   * rows, so keep it small. Default 64.
   */
  bandHeight?: number;
}

export interface ESCPOSHeatOptions {
  /** Max simultaneously heated dots, 0-255: (n+1)*8 dots. Default 7. */
  maxDots?: number;
  /** Heating time, 3-255 (x10us). Lower prints lighter. Default 80. */
  heatingTime?: number;
  /** Heating interval, 0-255 (x10us). Default 2. */
  heatingInterval?: number;
}

/**
 * ESC/POS Builder
 * Helper class to construct ESC/POS byte streams for receipt-style thermal
 * printers. Focused on raster printing: render your label as a MonoBitmap and
 * send it through `raster()`.
 */
export class ESCPOSBuilder {
  private chunks: Uint8Array[] = [];

  /**
   * Initialize printer (ESC @). Clears the print buffer and resets modes.
   */
  initialize(): ESCPOSBuilder {
    this.chunks.push(Uint8Array.of(ESC, 0x40));
    return this;
  }

  /**
   * Select justification (ESC a n)
   */
  align(alignment: ESCPOSAlignment): ESCPOSBuilder {
    const n = { left: 0, center: 1, right: 2 }[alignment];
    this.chunks.push(Uint8Array.of(ESC, 0x61, n));
    return this;
  }

  /**
   * Set left margin in dots (GS L nL nH)
   * @param dots 0-65535
   */
  leftMargin(dots: number): ESCPOSBuilder {
    assertIntegerInRange('dots', dots, 0, 65535);
    this.chunks.push(Uint8Array.of(GS, 0x4c, dots & 0xff, (dots >> 8) & 0xff));
    return this;
  }

  /**
   * Set the print head heating parameters (ESC 7 n1 n2 n3), supported by most
   * generic 58mm thermal printers. Lower heating time prints lighter, which
   * reduces dot gain (ink bleeding into neighbouring dots).
   */
  heat(options: ESCPOSHeatOptions = {}): ESCPOSBuilder {
    const maxDots = options.maxDots ?? 7;
    const heatingTime = options.heatingTime ?? 80;
    const heatingInterval = options.heatingInterval ?? 2;
    assertIntegerInRange('maxDots', maxDots, 0, 255);
    assertIntegerInRange('heatingTime', heatingTime, 3, 255);
    assertIntegerInRange('heatingInterval', heatingInterval, 0, 255);
    this.chunks.push(
      Uint8Array.of(ESC, 0x37, maxDots, heatingTime, heatingInterval)
    );
    return this;
  }

  /**
   * Set print density and break time (DC2 # n).
   *
   * **Experimental**: this command is implemented by some generic 58mm
   * firmwares but has not been verified on a real printer yet. Prefer
   * `heat()` to control darkness.
   *
   * @param level 0-31, darkness of the print. Default 10 on most firmwares.
   * @param breakTime 0-7, pause between heating cycles (x250us). Default 2.
   */
  density(level: number, breakTime: number = 2): ESCPOSBuilder {
    assertIntegerInRange('level', level, 0, 31);
    assertIntegerInRange('breakTime', breakTime, 0, 7);
    const n = (breakTime << 5) | level;
    this.chunks.push(Uint8Array.of(0x12, 0x23, n));
    return this;
  }

  /**
   * Print a monochrome bitmap as raster graphics (GS v 0).
   * The bitmap is packed 1 bit per pixel, 1 = black, MSB first.
   */
  raster(bitmap: MonoBitmap, options?: ESCPOSRasterOptions): ESCPOSBuilder {
    const bandHeight = options?.bandHeight ?? 64;
    assertIntegerInRange('bandHeight', bandHeight, 1, 65535);
    const packed = packMonoBitmap(bitmap, 1);
    const { bytesPerRow } = packed;

    for (let row = 0; row < packed.height; row += bandHeight) {
      const rows = Math.min(bandHeight, packed.height - row);
      const header = Uint8Array.of(
        GS,
        0x76,
        0x30,
        0x00,
        bytesPerRow & 0xff,
        (bytesPerRow >> 8) & 0xff,
        rows & 0xff,
        (rows >> 8) & 0xff
      );
      const start = row * bytesPerRow;
      const data = packed.data.subarray(start, start + rows * bytesPerRow);
      this.chunks.push(header, data);
    }
    return this;
  }

  /**
   * Print and feed n lines (ESC d n). Values above 255 are split into
   * consecutive commands.
   */
  feed(lines: number = 1): ESCPOSBuilder {
    this.pushRepeated(0x64, 'lines', lines);
    return this;
  }

  /**
   * Print and feed n dots (ESC J n). Values above 255 are split into
   * consecutive commands.
   */
  feedDots(dots: number): ESCPOSBuilder {
    this.pushRepeated(0x4a, 'dots', dots);
    return this;
  }

  /**
   * Form feed (FF). On printers with label/black-mark support this usually
   * prints and feeds to the start of the next label.
   */
  formFeed(): ESCPOSBuilder {
    this.chunks.push(Uint8Array.of(0x0c));
    return this;
  }

  /**
   * Print and feed label to the print starting position (GS FF).
   * Supported by label-capable ESC/POS firmware only.
   */
  labelFeed(): ESCPOSBuilder {
    this.chunks.push(Uint8Array.of(GS, 0x0c));
    return this;
  }

  /**
   * Append arbitrary bytes
   */
  raw(bytes: Uint8Array | number[]): ESCPOSBuilder {
    this.chunks.push(Uint8Array.from(bytes));
    return this;
  }

  /**
   * Build the final byte stream. Send it with `sendBytes()`.
   */
  buildBytes(): Uint8Array {
    return concatBytes(this.chunks);
  }

  /** Emit `ESC <command> n` as many times as needed to cover `amount`. */
  private pushRepeated(command: number, name: string, amount: number): void {
    assertIntegerInRange(name, amount, 0, Number.MAX_SAFE_INTEGER);
    let remaining = amount;
    do {
      const n = Math.min(255, remaining);
      this.chunks.push(Uint8Array.of(ESC, command, n));
      remaining -= n;
    } while (remaining > 0);
  }
}
