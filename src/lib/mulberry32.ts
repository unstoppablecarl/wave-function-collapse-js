export function makeMulberry32(initialSeed = 0) {
  let seed = initialSeed
  let increment = 0

  return (): number => {
    increment++

    // Mulberry32 algorithm
    // 0x6D2B79F5 is used as the Weyl sequence constant
    let t = (seed += 0x6D2B79F5) | 0
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    seed = t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}