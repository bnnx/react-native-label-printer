/* eslint-disable no-bitwise */
import { packMonoBitmap, type MonoBitmap } from './bitmap';
import { concatBytes } from './bytes';

const ESC = 0x1b;
const GS = 0x1d;

export type ESCPOSAlignment = 'left' | 'center' | 'right';

export interface ESCPOSRasterOptions {
  /**
   * Rows per `GS v 0` command. Large images are streamed as consecutive
   * bands so cheap printers with small buffers are not overwhelmed.
   * Default 64.
   */
  bandHeight?: number;
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
   */
  leftMargin(dots: number): ESCPOSBuilder {
    this.chunks.push(Uint8Array.of(GS, 0x4c, dots & 0xff, (dots >> 8) & 0xff));
    return this;
  }

  /**
   * Print a monochrome bitmap as raster graphics (GS v 0).
   * The bitmap is packed 1 bit per pixel, 1 = black, MSB first.
   */
  raster(bitmap: MonoBitmap, options?: ESCPOSRasterOptions): ESCPOSBuilder {
    const bandHeight = options?.bandHeight ?? 64;
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
   * Print and feed n lines (ESC d n)
   */
  feed(lines: number = 1): ESCPOSBuilder {
    this.chunks.push(Uint8Array.of(ESC, 0x64, clampByte(lines)));
    return this;
  }

  /**
   * Print and feed n dots (ESC J n)
   */
  feedDots(dots: number): ESCPOSBuilder {
    this.chunks.push(Uint8Array.of(ESC, 0x4a, clampByte(dots)));
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
  build(): Uint8Array {
    return concatBytes(this.chunks);
  }
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
