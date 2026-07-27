/**
 * Normalizes a sidebar marker for database storage.
 *
 * @param marker - Selected CSS color or null to clear.
 * @returns Trimmed marker string, or null when absent or blank.
 */
export function serializeSidebarMarker(marker: string | null | undefined): string | null {
  if (marker == null) {
    return null;
  }
  const trimmed = marker.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalizes a raw database or JSON value to a sidebar marker or null.
 *
 * @param value - Stored marker string or null/undefined.
 * @returns Trimmed marker string, or null when absent or blank.
 */
export function readSidebarMarker(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
