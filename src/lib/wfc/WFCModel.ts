import { type Direction, DX, DY, OPPOSITE_DIR } from '../util/direction.ts'
import { type FastLogFunction, makeFastLog } from '../util/fastLog.ts'
import type { CellIndex, PatternIndex } from './_types.ts'
import type { Propagator } from './Propagator.ts'

export type RNG = () => number

export enum IterationResult {
  REVERT,
  SUCCESS,
  STEP,
  FAIL
}

export type WFCModelOptions = {
  width: number,
  height: number,
  // number of possible values
  T: number,
  N: number,
  periodicOutput: boolean,
  weights: Float64Array,
  propagator: Propagator,
  initialGround: number,
  startCoordBias: number,
  startCoordX: number,
  startCoordY: number,
  fastLogFunction?: FastLogFunction,
}

export const makeWFCModel = (
  {
    width,
    height,
    // the number of unique patterns or tiles the algorithm has to choose from for every single cell
    T,
    propagator,
    periodicOutput,
    weights,
    initialGround,
    startCoordBias,
    startCoordX,
    startCoordY,
    fastLogFunction,
    N,
  }: WFCModelOptions,
) => {
  const N_CELLS = width * height
  const N_STATES = N_CELLS * T

  // Banned: a specific pattern has been mathematically ruled out as a possibility for a specific cell

  // The core "wave" state: A 3D boolean array flattened to 1D [cellIndex * T + patternIndex]
  // values: 1/0. 1 means the pattern is still possible at that cell; 0 means it is banned.
  const wave = new Uint8Array(N_STATES)

  function getWaveIndex(cellIndex: number, patternId: number): number {
    return cellIndex * T + patternId
  }

  // Tracks how many patterns in each neighbor cell allow pattern 't' at this cell.
  // For pattern 't' to remain possible, it must have at least one valid neighbor in EVERY direction.
  // If it reaches 0, it means NO remaining patterns in that neighbor cell
  // allow pattern 't' to exist here. Pattern 't' must then be banned as a possibility
  const compatible = new Int32Array(N_STATES * 4)

  // return how many neighbors in `direction` allow pattern `patternId` to exist at cellIdx.
  function getCompatibleIndex(cell: CellIndex, pattern: PatternIndex, direction: Direction): number {
    return (cell * T + pattern) * 4 + direction
  }

  // Stores the final selected pattern index for each cell once it has collapsed.
  // Initialized to -1 (unobserved).
  // Indexing: observed[x + y * width] = -1 or patternIndex
  const observed = new Int32Array(N_CELLS)

  // The number of remaining possible patterns for each cell.
  // When this reaches 1, the cell is "collapsed." When 0, it's a "contradiction."
  // Indexing: sumsOfOnes[x + y * width] = remaining possible pattern count
  const sumsOfOnes = new Int32Array(N_CELLS)

  // statistical weights: each possible pattern has a statistical weight
  // equal to the number of times it occurs in the source / total patterns in source

  // The sum of the statistical weights of all currently possible patterns in a cell.
  // Used for calculating entropy and weighted random selection.
  // This value decreases as patterns are banned, shrinking the probability pool for this cell.
  // It serves as the divisor to normalize individual pattern weights into a 0.0 - 1.0 range.
  // Indexing: [x + y * width]
  const sumsOfWeights = new Float64Array(N_CELLS)

  // Optimization for Shannon Entropy: Stores the sum of (weight * log(weight)) for valid patterns.
  // By tracking this sum incrementally, the process avoids re-calculating the entire entropy from scratch.
  // Formula: Entropy = log(sumWeights) - (sumWeightLogWeights / sumWeights).
  // This running total is updated in O(1) time whenever a pattern is banned by subtracting that pattern's pre-calculated log-weight.
  // It allows the model to scale efficiently even when the number of possible patterns (T) is very large.
  // Indexing: [x + y * width]
  const sumsOfWeightLogWeights = new Float64Array(N_CELLS)

  // The current Shannon Entropy (complexity/chaos) of the cell.
  // Cells with the lowest entropy (fewest remaining valid choices) are prioritized to be collapsed next.
  // A cell with an entropy of 0 is either fully collapsed (1 choice) or in a contradiction (0 choices).
  // Adding a tiny amount of random noise to these values during selection helps break ties and prevents "tiling" artifacts.
  // This array is the primary "map" the Observer uses to decide where the next collapse should occur.
  // Indexing: [x + y * width]
  const entropies = new Float64Array(N_CELLS)

  // A LIFO stack used for the propagation of constraints.
  // Stores [cellIndex, patternIndex] pairs that were recently banned.
  const pendingBans = new Int32Array(N_STATES * 2)

  // Current pointer for the propagation stack.
  let pendingBanCount = 0

  // -- Active Frontier & Biasing --

  // A list of all cell indices that have not yet collapsed (sumsOfOnes > 1).
  // Allows the observer to skip already-solved cells entirely.
  const uncollapsedIndices = new Int32Array(N_CELLS)

  // The current number of active indices in the uncollapsedIndices frontier.
  let uncollapsedCount = 0

  // Pre-calculate weights

  // Individual weight log values: weights[t] * Math.log(weights[t]).
  // Pre-calculated once to avoid calling Math.log millions of times during propagation.
  const weightLogWeights = new Float64Array(T)

  // The total sum of weights of all patterns in the source tileset.
  let sumOfWeightsTotal = 0

  // The total sum of weightLogWeights for the entire source tileset.
  let sumOfWeightLogWeightsTotal = 0

  for (let t = 0; t < T; t++) {
    const w = weights[t]!
    weightLogWeights[t] = w * Math.log(w)
    sumOfWeightsTotal += w
    sumOfWeightLogWeightsTotal += weightLogWeights[t]!
  }
  const startingEntropy = Math.log(sumOfWeightsTotal) - sumOfWeightLogWeightsTotal / sumOfWeightsTotal

  const fastLog = fastLogFunction ?? makeFastLog({
    minValue: 0.001,                    // Slightly below minimum possible sum
    maxValue: sumOfWeightsTotal * 2,    // Well above maximum possible sum
    tableSize: 4096,                     // Good balance of memory vs speed
  })

  // A static priority map that biases the algorithm to pick cells near a specific focus point.
  // Used to grow the solution like a crystal, which significantly reduces contradictions.
  // Indexing: [x + y * width]
  const spatialPriority = makeSpacialPriority()

  let generationComplete = false
  const changedCells = new Int32Array(N_CELLS)
  let changedCount = 0
  const dirtyFlags = new Uint8Array(N_CELLS)

  function markDirty(i: number) {
    if (dirtyFlags[i] === 0) {
      dirtyFlags[i] = 1
      changedCells[changedCount++] = i
    }
  }

  function onBoundary(x: number, y: number): boolean {
    return !periodicOutput && (x < 0 || y < 0 || x >= width || y >= height)
  }

  function makeSpacialPriority() {
    const spatialPriority = new Float64Array(N_CELLS)

    // Initialize Spatial Bias (Center-out growth)
    const centerX = (width * startCoordX) | 0
    const centerY = (height * startCoordY) | 0
    for (let i = 0; i < N_CELLS; i++) {
      const x = i % width
      const y = (i / width) | 0
      const dx = x - centerX
      const dy = y - centerY
      // Lower value = higher priority.
      // We scale the distance so it influences choice without totally overriding entropy.
      spatialPriority[i] = Math.sqrt(dx * dx + dy * dy) * startCoordBias
    }
    return spatialPriority
  }

  const ban = (cell: CellIndex, pattern: PatternIndex) => {
    const waveIdx = getWaveIndex(cell, pattern)

    if (wave[waveIdx] === 0) return
    wave[waveIdx] = 0

    const compStart = (waveIdx) * 4
    compatible[compStart] = 0
    compatible[compStart + 1] = 0
    compatible[compStart + 2] = 0
    compatible[compStart + 3] = 0

    pendingBans[pendingBanCount * 2] = cell
    pendingBans[pendingBanCount * 2 + 1] = pattern
    pendingBanCount++

    sumsOfOnes[cell]! -= 1
    sumsOfWeights[cell]! -= weights[pattern]!
    sumsOfWeightLogWeights[cell]! -= weightLogWeights[pattern]!

    markDirty(cell)
    // Incremental Shannon Entropy calculation:
    const sum = sumsOfWeights[cell]!
    if (sum <= 1e-10 || sumsOfOnes[cell]! <= 1) {
      entropies[cell] = 0
      // Update observed immediately if the cell is collapsed
      if (sumsOfOnes[cell] === 1) {
        for (let t2 = 0; t2 < T; t2++) {
          if (wave[cell * T + t2] === 1) {
            observed[cell] = t2
            break
          }
        }
      }
    } else {
      const val = fastLog(sum) - (sumsOfWeightLogWeights[cell]! / sum)
      entropies[cell] = Math.max(0, val)
    }
  }

  const refreshUncollapsed = () => {
    uncollapsedCount = 0
    for (let i = 0; i < N_CELLS; i++) {
      if (sumsOfOnes[i]! > 1) {
        uncollapsedIndices[uncollapsedCount++] = i
      }
    }
  }

  const clear = () => {
    history = []
    lastCheckpointPercent = 0
    pendingBanCount = 0
    for (let i = 0 as CellIndex; i < N_CELLS; i++) {
      for (let t = 0 as PatternIndex; t < T; t++) {
        wave[i * T + t] = 1
        for (let d = 0 as Direction; d < 4; d++) {
          const compatibleIndex = getCompatibleIndex(i, t, d)
          compatible[compatibleIndex] = propagator.getCompatibleCount(t, d)
        }
      }
      sumsOfOnes[i] = T
      sumsOfWeights[i] = sumOfWeightsTotal
      sumsOfWeightLogWeights[i] = sumOfWeightLogWeightsTotal
      entropies[i] = startingEntropy
      observed[i] = -1
    }

    generationComplete = false

    // If a pattern has 0 valid neighbors in any direction, it is impossible even in an empty grid.
    for (let i = 0 as CellIndex; i < N_CELLS; i++) {
      for (let t = 0 as PatternIndex; t < T; t++) {
        for (let d = 0 as Direction; d < 4; d++) {
          const compIdx = getCompatibleIndex(i, t, d)
          if (compatible[compIdx] === 0) {
            ban(i, t)
            break
          }
        }
      }
    }

    if (initialGround >= 0 && initialGround < T) {
      const groundY = height - 1
      for (let x = 0; x < width; x++) {
        const idx = x + groundY * width as CellIndex
        for (let t = 0 as PatternIndex; t < T; t++) {
          if (t !== initialGround) ban(idx, t)
        }
        for (let y = 0; y < groundY; y++) ban((x + y * width) as CellIndex, initialGround as PatternIndex)
      }
    }

    propagate()
    refreshUncollapsed()
  }

  const propagate = () => {
    while (pendingBanCount > 0) {
      // Pop the last banned cell and the pattern that was removed
      pendingBanCount--
      const bannedCellIndex = pendingBans[pendingBanCount * 2]! as CellIndex
      // banned pattern
      const pattern = pendingBans[pendingBanCount * 2 + 1]! as PatternIndex
      // banned coord
      const x1 = bannedCellIndex % width
      const y1 = (bannedCellIndex / width) | 0

      // Check all 4 neighbors to see if this ban affects their possibilities
      for (let d = 0 as Direction; d < 4; d++) {
        let x2 = x1 + DX[d]!
        let y2 = y1 + DY[d]!

        // Skip if we hit a non-periodic edge
        // or out-of-bounds coord
        if (onBoundary(x2, y2)) continue

        // Wrap coordinates if the output is periodic (torus topology)
        if (x2 < 0) x2 += width
        else if (x2 >= width) x2 -= width
        if (y2 < 0) y2 += height
        else if (y2 >= height) y2 -= height

        const nCellIndex = x2 + y2 * width as CellIndex

        // looking at neighbor nCellIndex in direction d
        // from nCellIndex's perspective, the "ban" is coming from the OPPOSITE direction.
        const oppositeDir = OPPOSITE_DIR[d]! as Direction
        // need to know: Which patterns in nCellIndex were supported by the patternId we just banned
        const validPatternIds = propagator.getValidPatternIds(pattern, d)
        for (let l = 0; l < validPatternIds.length; l++) {
          const nPatternId = validPatternIds[l]! as PatternIndex

          const compIdx = getCompatibleIndex(nCellIndex, nPatternId, oppositeDir)
          // already not compatible
          if (compatible[compIdx]! <= 0) continue

          compatible[compIdx]!--
          if (compatible[compIdx] === 0) {
            ban(nCellIndex, nPatternId)
            // CIRCUIT BREAKER: If this ban caused a contradiction, abort
            if (sumsOfOnes[nCellIndex] === 0) {
              // ABORT EVERYTHING on this stack
              pendingBanCount = 0
              return false
            }
          }
        }
      }
    }
    return true
  }

  enum ObserveTargetResult {
    TARGET = -5,
    CONTRADICTION = -4,
    STALL = -3,
    SUCCESS = -2
  }

  let observeTargetResult: ObserveTargetResult = -5

  function findObserveTargetIndex(rng: RNG): number | null {
    let minScore = 1e10
    let minIdx = -1

    for (let idx = 0; idx < uncollapsedCount; idx++) {
      const i = uncollapsedIndices[idx]!
      const amount = sumsOfOnes[i]!

      if (amount === 0) {
        observeTargetResult = ObserveTargetResult.CONTRADICTION
        return i
      }

      if (amount > 1) {
        const score = entropies[i]! + spatialPriority[i]! + (0.000001 * rng())
        if (minIdx === -1 || score < minScore) {
          minScore = score
          minIdx = i
        }
      }
    }

    if (minIdx === -1) {
      for (let i = 0; i < N_CELLS; i++) {
        const amount = sumsOfOnes[i]!
        if (amount === 0) {
          observeTargetResult = ObserveTargetResult.CONTRADICTION
          return i
        }
        if (amount > 1) {
          observeTargetResult = ObserveTargetResult.STALL
          return null
        }
        // un observed
        if (observed[i] === -1) {
          for (let t = 0; t < T; t++) {
            const waveIdx = getWaveIndex(i, t)
            if (wave[waveIdx] === 1) {
              observed[i] = t
              break
            }
          }
        }
      }
      observeTargetResult = ObserveTargetResult.SUCCESS
      return null
    }

    observeTargetResult = ObserveTargetResult.TARGET
    return minIdx
  }

  function getRandomPatternId(rng: RNG, sumWeights: number, cellIdx: number) {
    let x = rng() * sumWeights
    for (let t = 0; t < T; t++) {
      const waveIdx = getWaveIndex(cellIdx, t)
      if (wave[waveIdx] === 1) {
        x -= weights[t]!
        if (x <= 0) {
          return t
        }
      }
    }

    return T - 1
  }

  // reused
  const distribution = new Float64Array(T)

  const observe = (rng: RNG): true | number | null => {
    const result = findObserveTargetIndex(rng)
    if (observeTargetResult === ObserveTargetResult.CONTRADICTION) return result
    if (observeTargetResult === ObserveTargetResult.STALL) return null
    if (observeTargetResult === ObserveTargetResult.SUCCESS) return true
    if (observeTargetResult !== ObserveTargetResult.TARGET) {
      throw new Error('invalid result: ' + result)
    }
    const cellIdx = result as CellIndex

    for (let t = 0; t < T; t++) {
      const waveIdx = getWaveIndex(cellIdx, t)
      distribution[t] = wave[waveIdx] === 1 ? weights[t]! : 0
    }

    // find random index (chosenT)
    const sumWeights = sumsOfWeights[cellIdx]!
    // contradiction
    if (sumWeights <= 0) return cellIdx

    const chosenT = getRandomPatternId(rng, sumWeights, cellIdx)

    for (let t = 0 as PatternIndex; t < T; t++) {
      const waveIdx = getWaveIndex(cellIdx, t)
      if (wave[waveIdx] === 1 && t !== chosenT) {
        ban(cellIdx, t)
      }
    }
    return null
  }

  let history: WFCSnapshot[] = []
  let lastCheckpointPercent = 0
  let lastIterationHealthy = true
  let failedAttempts = 0

  const singleIterationWithSnapShots = (
    rng: RNG,
    snapshotIntervalPercent = 0.05,
    maxSnapshots = 10,
  ): IterationResult => {
    const progress = filledPercent()

    if (progress > lastCheckpointPercent + snapshotIntervalPercent) {
      history.push(createSnapshot())
      lastCheckpointPercent = progress
      if (history.length > maxSnapshots) history.shift()
    }
    const result = singleIteration(rng)

    if (!lastIterationHealthy || result === IterationResult.REVERT) {
      failedAttempts++

      if (history.length > 0) {
        // ESCALATION: If we fail repeatedly, pop extra snapshots to escape the "dead zone"
        // 1st fail: go back 1 step
        // 3rd fail: go back 2 steps
        // 5th fail: go back 3 steps
        const rewindDepth = Math.min(history.length, Math.ceil(failedAttempts / 2))

        let latest: WFCSnapshot | undefined
        for (let i = 0; i < rewindDepth; i++) {
          latest = history.pop()
        }

        if (latest) {
          restoreSnapshot(latest)
          lastCheckpointPercent = filledPercent()
          lastIterationHealthy = true
          return IterationResult.REVERT
        }
      }

      // If no history left or escalation exhausted the stack
      console.error('Unsolvable state reached. Hard reset.')
      clear()
      failedAttempts = 0
      return IterationResult.FAIL
    }

    failedAttempts = 0

    if (result === IterationResult.SUCCESS) return IterationResult.SUCCESS
    return IterationResult.STEP
  }

  const singleIteration = (rng: RNG): IterationResult => {
    const result = observe(rng)

    if (typeof result === 'number') {
      lastIterationHealthy = false
      return IterationResult.REVERT
    }

    lastIterationHealthy = propagate()

    let i = 0
    while (i < uncollapsedCount) {
      if (sumsOfOnes[uncollapsedIndices[i]!]! <= 1)
        uncollapsedIndices[i] = uncollapsedIndices[--uncollapsedCount]!
      else i++
    }

    if (result === true) {
      generationComplete = true
      return IterationResult.SUCCESS
    }
    return IterationResult.STEP
  }

  const getChanges = () => {
    const slice = changedCells.slice(0, changedCount)
    // Clear dirty flags
    for (let idx = 0; idx < changedCount; idx++) {
      dirtyFlags[changedCells[idx]!] = 0
    }
    changedCount = 0
    return slice
  }

  function getFilledCount() {
    let collapsed = 0
    for (let i = 0; i < N_CELLS; i++) {
      if (sumsOfOnes[i]! <= 1) collapsed++
    }
    return collapsed
  }

  const filledPercent = () => getFilledCount() / N_CELLS

  function createSnapshot(): WFCSnapshot {
    return {
      wave: new Uint8Array(wave),
      compatible: new Int32Array(compatible),
      sumsOfOnes: new Int32Array(sumsOfOnes),
      sumsOfWeights: new Float64Array(sumsOfWeights),
      sumsOfWeightLogWeights: new Float64Array(sumsOfWeightLogWeights),
      entropies: new Float64Array(entropies),
      observed: new Int32Array(observed),
      uncollapsedIndices: new Int32Array(uncollapsedIndices),
      uncollapsedCount: uncollapsedCount,
    }
  }

  function restoreSnapshot(s: WFCSnapshot) {
    wave.set(s.wave)
    compatible.set(s.compatible)
    sumsOfOnes.set(s.sumsOfOnes)
    sumsOfWeights.set(s.sumsOfWeights)
    sumsOfWeightLogWeights.set(s.sumsOfWeightLogWeights)
    entropies.set(s.entropies)
    observed.set(s.observed)
    uncollapsedIndices.set(s.uncollapsedIndices)
    uncollapsedCount = s.uncollapsedCount
    pendingBanCount = 0
    for (let i = 0; i < N_CELLS; i++) {
      if (dirtyFlags[i] === 0) {
        dirtyFlags[i] = 1
        changedCells[changedCount++] = i
      }
    }
  }

  return {
    singleIteration,
    singleIterationWithSnapShots,
    clear,
    isGenerationComplete: () => generationComplete,
    getObserved: () => observed,
    getWave: () => wave,
    onBoundary,
    getFilledCount,
    getTotalCells: () => N_CELLS,
    filledPercent,
    getChanges,
    T,
    width,
    height,
    weights,
    propagator,
    ban,
    propagate,
    createSnapshot,
    restoreSnapshot,
    N,
  }
}

export type WFCSnapshot = {
  wave: Uint8Array,
  compatible: Int32Array,
  sumsOfOnes: Int32Array,
  sumsOfWeights: Float64Array,
  sumsOfWeightLogWeights: Float64Array,
  entropies: Float64Array,
  observed: Int32Array,
  uncollapsedIndices: Int32Array,
  uncollapsedCount: number,
}

