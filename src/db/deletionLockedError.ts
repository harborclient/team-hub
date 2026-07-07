/**
 * Thrown when a non-admin user attempts to delete a collection, environment, or snippet
 * that has deletion protection enabled.
 */
export class DeletionLockedError extends Error {
  /**
   * @param entityType - Human-readable entity kind shown in the error message.
   */
  constructor(entityType: 'collection' | 'environment' | 'snippet') {
    super(`Deletion is locked for this ${entityType}.`);
    this.name = 'DeletionLockedError';
  }
}
