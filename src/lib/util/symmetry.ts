import { getPatternHash } from './pattern.ts'

export function* generateSymmetries(base: Int32Array, N: number, symmetry: number, allowDuplicates = false) {
  const seenHashes = new Set<bigint>()
  let current = base

  for (let i = 0; i < symmetry; i++) {
    // 0: Original orientation
    if (i === 0) current = base

    // 1: Horizontal reflection
    if (i === 1) current = reflect(current, N)

    // 2: Rotate the reflection 90°
    if (i === 2) current = rotate(current, N)

    // 3: Reflect that rotation
    if (i === 3) current = reflect(current, N)

    // 4: Rotate again (180° from reflected start)
    if (i === 4) current = rotate(current, N)

    // 5: Reflect that rotation
    if (i === 5) current = reflect(current, N)

    // 6: Rotate again (270° from reflected start)
    if (i === 6) current = rotate(current, N)

    // 7: Reflect that rotation
    if (i === 7) current = reflect(current, N)

    const hash = getPatternHash(current)

    if (allowDuplicates) {
      yield {
        pattern: current,
        hash,
      }
    } else if (!seenHashes.has(hash)) {
      seenHashes.add(hash)
      yield {
        pattern: current,
        hash,
      }
    }
  }
}

/** * Rotates a square Int32Array pattern 90 degrees clockwise.
 */
export const rotate = (p: Int32Array, N: number): Int32Array => {
  const patternLen = N * N
  const res = new Int32Array(patternLen)

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      res[x + y * N] = p[N - 1 - y + x * N]!
    }
  }

  return res
}

/**
 * Reflects a square Int32Array pattern horizontally.
 */
export const reflect = (p: Int32Array, N: number): Int32Array => {
  const patternLen = N * N
  const res = new Int32Array(patternLen)

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      res[x + y * N] = p[N - 1 - x + y * N]!
    }
  }

  return res
}