import { type Direction, DX, OPPOSITE_DIR } from '../util/direction.ts'
import { makePropagator, type Propagator } from './Propagator.ts'

export interface PropagatorBuilder<PatternId extends number> {
  addAdjacency: (fromId: PatternId, toId: PatternId, dir: Direction) => void
  addBidirectional: (fromId: PatternId, toId: PatternId, dir: Direction) => void
  build: () => Propagator
}

export function makePropagatorBuilder<PatternId extends number>(T: number): PropagatorBuilder<PatternId> {
  const directionCount = DX.length
  const rules = new Set<bigint>()

  const addAdjacency = (fromId: PatternId, toId: PatternId, dir: Direction) => {
    // Pack: (dir << 32) | (from << 16) | to
    const key = (BigInt(dir) << 32n) | (BigInt(fromId) << 16n) | BigInt(toId)
    rules.add(key)
  }

  const addBidirectional = (fromId: PatternId, toId: PatternId, dir: Direction) => {
    const oppositeDir = OPPOSITE_DIR[dir]! as Direction
    addAdjacency(fromId, toId, dir)
    addAdjacency(toId, fromId, oppositeDir)
  }

  const build = (): Propagator => {
    const propagatorLengths = new Int32Array(directionCount * T)
    const propagatorOffsets = new Int32Array(directionCount * T)
    let totalSize = 0

    // Pass 1: Tally lengths
    for (const key of rules) {
      const dir = Number(key >> 32n)
      const from = Number((key >> 16n) & 0xFFFFn)
      propagatorLengths[dir * T + from]!++
      totalSize++
    }

    // Pass 2: Map offsets
    const propagatorData = new Int32Array(totalSize)
    let currentOffset = 0
    for (let d = 0; d < directionCount; d++) {
      for (let t = 0; t < T; t++) {
        propagatorOffsets[d * T + t] = currentOffset
        currentOffset += propagatorLengths[d * T + t]!
      }
    }

    // Pass 3: Populate data using a cursor tracking array
    const cursors = new Int32Array(propagatorOffsets)
    for (const key of rules) {
      const dir = Number(key >> 32n)
      const from = Number((key >> 16n) & 0xFFFFn)
      const to = Number(key & 0xFFFFn)
      const writeIdx = cursors[dir * T + from]!

      propagatorData[writeIdx] = to
      cursors[dir * T + from]!++
    }

    return makePropagator({
      data: propagatorData,
      offsets: propagatorOffsets,
      lengths: propagatorLengths,
      T,
    })
  }

  return {
    addAdjacency,
    addBidirectional,
    build,
  }
}