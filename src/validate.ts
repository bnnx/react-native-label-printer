/**
 * Throw when `value` is not an integer within [min, max].
 * Used by the builders so out-of-range parameters fail loudly instead of
 * silently wrapping into a different command.
 */
export function assertIntegerInRange(
  name: string,
  value: number,
  min: number,
  max: number
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(
      `${name} must be an integer between ${min} and ${max}, got ${value}`
    );
  }
}
