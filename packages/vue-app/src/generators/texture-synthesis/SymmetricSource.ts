
// Build expanded source: distinct symmetric variants of `src` packed end to end
// as nSyms blocks of SW × SH each.  Square sources get the full D4 (up to 8
// transforms); rectangular sources get only the dimension-preserving D2 group
// (up to 4: identity, h-flip, v-flip, 180° rotation).
//
// Lookups into the returned data are global indices in [0, nSyms * SW * SH);
// neighbourhood reads must stay within the source's block (each block is
// independently periodic) — see the "decode block, wrap inside" pattern below.
import { getPatternHash } from '../../lib/util/pattern.ts'

export const makeSymmetricSource = (
  src: Uint32Array,
  SW: number,
  SH: number,
  symmetry: number,
): { data: Uint32Array, nSyms: number } => {
  const block = SW * SH
  const seen = new Set<bigint>()
  const transforms: Uint32Array[] = []

  const tryAdd = (t: Uint32Array): void => {
    const h = getPatternHash(t)
    if (!seen.has(h)) { seen.add(h); transforms.push(t) }
  }

  const square = SW === SH
  const cap = Math.max(1, Math.min(symmetry, square ? 8 : 4))

  // Dimension-preserving (works for any rectangle) ----------------------------
  if (cap >= 1) tryAdd(src)
  if (cap >= 2) {
    const t = new Uint32Array(block)
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++)
      t[y * SW + x] = src[y * SW + (SW - 1 - x)]!  // horizontal flip
    tryAdd(t)
  }
  if (cap >= 3) {
    const t = new Uint32Array(block)
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++)
      t[y * SW + x] = src[(SH - 1 - y) * SW + x]!  // vertical flip
    tryAdd(t)
  }
  if (cap >= 4) {
    const t = new Uint32Array(block)
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++)
      t[y * SW + x] = src[(SH - 1 - y) * SW + (SW - 1 - x)]!  // 180°
    tryAdd(t)
  }

  // Square-only: diagonals and 90° rotations ---------------------------------
  if (square) {
    const N = SW
    if (cap >= 5) {
      const t = new Uint32Array(block)
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
        t[y * N + x] = src[x * N + y]!  // transpose
      tryAdd(t)
    }
    if (cap >= 6) {
      const t = new Uint32Array(block)
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
        t[y * N + x] = src[(N - 1 - x) * N + (N - 1 - y)]!  // anti-transpose
      tryAdd(t)
    }
    if (cap >= 7) {
      const t = new Uint32Array(block)
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
        t[y * N + x] = src[(N - 1 - x) * N + y]!  // 90° CW
      tryAdd(t)
    }
    if (cap >= 8) {
      const t = new Uint32Array(block)
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
        t[y * N + x] = src[x * N + (N - 1 - y)]!  // 90° CCW
      tryAdd(t)
    }
  }

  const nSyms = transforms.length
  const data = new Uint32Array(nSyms * block)
  for (let t = 0; t < nSyms; t++) data.set(transforms[t]!, t * block)
  return { data, nSyms }
}