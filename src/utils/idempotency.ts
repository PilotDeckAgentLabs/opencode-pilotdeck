/**
 * Idempotency key generation utilities
 */

import { createHash } from "node:crypto"

/**
 * Generate a consistent idempotency key from components
 */
export function generateIdempotencyKey(...parts: (string | number)[]): string {
  const normalized = parts
    .map(p => String(p).trim())
    .filter(p => p.length > 0)
    .join(":")
  
  // For deterministic keys, use a hash
  const hash = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .substring(0, 16)
  
  return `${normalized}:${hash}`
}

/**
 * Validate an idempotency key format
 */
export function isValidIdempotencyKey(key: string): boolean {
  return key.length > 0 && key.length <= 255
}
