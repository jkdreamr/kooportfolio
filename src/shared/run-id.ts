let sequence = 0;
// Local reward deduplication only, never an auth token or ranked run identity.
export function newRunId() {
  const random = new Uint32Array(2);
  globalThis.crypto?.getRandomValues?.(random);
  return `local-${Date.now().toString(36)}-${random.join("-")}-${sequence++}`;
}
