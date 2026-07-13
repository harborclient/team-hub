/**
 * Normalizes a sidebar color for database storage.
 *
 * @param color - Selected CSS color or null to clear.
 * @returns Trimmed color string, or null when absent or blank.
 */
export function serializeSidebarColor(color: string | null | undefined): string | null {
  if (color == null) {
    return null;
  }
  const trimmed = color.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalizes a raw database or JSON value to a sidebar color or null.
 *
 * @param value - Stored color string or null/undefined.
 * @returns Trimmed color string, or null when absent or blank.
 */
export function readSidebarColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
