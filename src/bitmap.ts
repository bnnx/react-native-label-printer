/* eslint-disable no-bitwise */
import { assertIntegerInRange } from './validate';

/**
 * Monochrome bitmap in printer-friendly form.
 * `data` holds one byte per pixel, row-major (`width * height` bytes), where
 * any non-zero value is black.
 */
export interface MonoBitmap {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface PackedBitmap {
  bytesPerRow: number;
  height: number;
  data: Uint8Array;
}

/** Widest bitmap whose packed row still fits the 16-bit width fields. */
const MAX_DIMENSION = 65535 * 8;

/**
 * Create an all-white MonoBitmap. Draw into `data` with your own renderer.
 */
export function createMonoBitmap(width: number, height: number): MonoBitmap {
  assertIntegerInRange('width', width, 1, MAX_DIMENSION);
  assertIntegerInRange('height', height, 1, MAX_DIMENSION);
  return { width, height, data: new Uint8Array(width * height) };
}

/**
 * Pack a MonoBitmap into rows of bytes, MSB first.
 * `blackBit` sets which bit value represents a black (printed) dot:
 * TSPL BITMAP uses 0, ESC/POS raster graphics use 1.
 * Padding bits past the bitmap width are always white.
 */
export function packMonoBitmap(
  bitmap: MonoBitmap,
  blackBit: 0 | 1
): PackedBitmap {
  const { width, height, data } = bitmap;
  assertIntegerInRange('bitmap.width', width, 1, MAX_DIMENSION);
  assertIntegerInRange('bitmap.height', height, 1, MAX_DIMENSION);
  if (data.length !== width * height) {
    throw new Error(
      `MonoBitmap data length ${data.length} does not match ${width}x${height}`
    );
  }

  const bytesPerRow = Math.ceil(width / 8);
  const packed = new Uint8Array(bytesPerRow * height);
  if (blackBit === 0) {
    packed.fill(0xff);
  }

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const packedRowOffset = y * bytesPerRow;
    for (let x = 0; x < width; x++) {
      if (data[rowOffset + x]) {
        const index = packedRowOffset + (x >> 3);
        const mask = 0x80 >> (x & 7);
        if (blackBit === 1) {
          packed[index] = packed[index]! | mask;
        } else {
          packed[index] = packed[index]! & ~mask;
        }
      }
    }
  }

  return { bytesPerRow, height, data: packed };
}
