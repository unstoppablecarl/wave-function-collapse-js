
import { DX, DY, OPPOSITE_DIR } from '../util/direction.ts'
import { type FastLogFunction, makeFastLog } from '../util/fastLog.ts'
import type { Propagator } from './Propagator.ts'

export type RNG = () => number

export enum IterationResult {
  REPAIR = 'REPAIR',
  SUCCESS = 'SUCCESS',
  STEP = 'STEP'
}

export type WFCModelOptions = {
  width: number,
  height: number,
  // number of possible values
  T: number,
  periodicOutput: boolean,
  weights: Float64Array,
  propagator: Propagator,
  initialGround: number,
  repairRadius: number,
  startCoordBias: number,
  startCoordX: number,
  startCoordY: number,
  fastLogFunction?: FastLogFunction
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
    repairRadius,
    startCoordBias,
    startCoordX,
    startCoordY,
    fastLogFunction,
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
  function getCompatibleIndex(cellIdx: number, patternId: number, direction: number): number {
    return (cellIdx * T + patternId) * 4 + direction
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

  // Tracks how many times a specific cell has been reset by the repair (clearRadius) logic.
  // Useful for identifying "problem areas" in a generation.
  const repairCounts = new Uint32Array(N_CELLS)

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

  const ban = (i: number, t: number) => {
    const waveIdx = getWaveIndex(i, t)

    if (wave[waveIdx] === 0) return
    wave[waveIdx] = 0

    const compStart = (waveIdx) * 4
    compatible[compStart] = 0
    compatible[compStart + 1] = 0
    compatible[compStart + 2] = 0
    compatible[compStart + 3] = 0

    pendingBans[pendingBanCount * 2] = i
    pendingBans[pendingBanCount * 2 + 1] = t
    pendingBanCount++

    sumsOfOnes[i]! -= 1
    sumsOfWeights[i]! -= weights[t]!
    sumsOfWeightLogWeights[i]! -= weightLogWeights[t]!

    markDirty(i)
    // Incremental Shannon Entropy calculation:
    const sum = sumsOfWeights[i]!
    if (sum <= 1e-10 || sumsOfOnes[i]! <= 1) {
      entropies[i] = 0
      // Update observed immediately if the cell is collapsed
      if (sumsOfOnes[i] === 1) {
        for (let t2 = 0; t2 < T; t2++) {
          if (wave[i * T + t2] === 1) {
            observed[i] = t2
            break
          }
        }
      }
    } else {
      const val = fastLog(sum) - (sumsOfWeightLogWeights[i]! / sum)
      entropies[i] = Math.max(0, val)
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
    pendingBanCount = 0
    for (let i = 0; i < N_CELLS; i++) {
      for (let t = 0; t < T; t++) {
        wave[i * T + t] = 1
        for (let d = 0; d < 4; d++) {
          const compatibleIndex = getCompatibleIndex(i, t, d)
          compatible[compatibleIndex] = propagator.getCompatibleCount(t, d)
        }
      }
      sumsOfOnes[i] = T
      sumsOfWeights[i] = sumOfWeightsTotal
      sumsOfWeightLogWeights[i] = sumOfWeightLogWeightsTotal
      entropies[i] = startingEntropy
      observed[i] = -1
      repairCounts[i] = 0
    }

    generationComplete = false

    // If a pattern has 0 valid neighbors in any direction, it is impossible even in an empty grid.
    for (let i = 0; i < N_CELLS; i++) {
      for (let t = 0; t < T; t++) {
        for (let d = 0; d < 4; d++) {
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
        const idx = x + groundY * width
        for (let t = 0; t < T; t++) {
          if (t !== initialGround) ban(idx, t)
        }
        for (let y = 0; y < groundY; y++) ban(x + y * width, initialGround)
      }
    }

    propagate()
    refreshUncollapsed()
  }

  const propagate = () => {
    while (pendingBanCount > 0) {
      // Pop the last banned cell and the pattern that was removed
      pendingBanCount--
      const bannedCellIndex = pendingBans[pendingBanCount * 2]!
      // banned pattern
      const patternId = pendingBans[pendingBanCount * 2 + 1]!
      // banned coord
      const x1 = bannedCellIndex % width
      const y1 = (bannedCellIndex / width) | 0

      // Check all 4 neighbors to see if this ban affects their possibilities
      for (let d = 0; d < 4; d++) {
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

        const nCellIndex = x2 + y2 * width

        // looking at neighbor nCellIndex in direction d
        // from nCellIndex's perspective, the "ban" is coming from the OPPOSITE direction.
        const oppositeDir = OPPOSITE_DIR[d]!
        // need to know: Which patterns in nCellIndex were supported by the patternId we just banned
        const validPatternIds = propagator.getValidPatternIds(patternId, d)
        for (let l = 0; l < validPatternIds.length; l++) {
          const nPatternId = validPatternIds[l]!

          const compIdx = getCompatibleIndex(nCellIndex, nPatternId, oppositeDir)
          // already not compatible
          if (compatible[compIdx]! <= 0) continue

          compatible[compIdx]!--
          if (compatible[compIdx] === 0) ban(nCellIndex, nPatternId)
        }
      }
    }
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
    const cellIdx = result as number

    for (let t = 0; t < T; t++) {
      const waveIdx = getWaveIndex(cellIdx, t)
      distribution[t] = wave[waveIdx] === 1 ? weights[t]! : 0
    }

    // // find random index (chosenT)
    // const sumWeights = sumsOfWeights[argmin]!
    // if (sumWeights <= 0) return argmin
    //
    // let x = rng() * sumWeights
    // let chosenT = -1
    //
    // for (let t = 0; t < T; t++) {
    //   if (wave[argmin * T + t] === 1) {
    //     x -= weights[t]!
    //     if (x <= 0) {
    //       chosenT = t
    //       break
    //     }
    //   }
    // }
    //
    // if (chosenT === -1) chosenT = T - 1

    const chosenT = randomIndex(distribution, rng())
    // Safety fallback for bad distribution
    if (chosenT === -1) return cellIdx

    for (let t = 0; t < T; t++) {
      const waveIdx = getWaveIndex(cellIdx, t)
      if (wave[waveIdx] === 1 && t !== chosenT) {
        ban(cellIdx, t)
      }
    }
    return null
  }

  const singleIteration = (rng: RNG): IterationResult => {
    const result = observe(rng)

    if (typeof result === 'number') {
      const x = result % width
      const y = (result / width) | 0
      clearRadius(x, y, repairRadius)
      refreshUncollapsed()
      return IterationResult.REPAIR
    }

    propagate()

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

  const clearRadius = (targetX: number, targetY: number, radius: number) => {
    // PHASE 1: Reset wave states in the cleared region
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        let x = targetX + dx
        let y = targetY + dy
        if (periodicOutput) {
          x = (x + width) % width
          y = (y + height) % height
        } else if (x < 0 || y < 0 || x >= width || y >= height) continue

        const i = x + y * width
        repairCounts[i]!++
        observed[i] = -1
        sumsOfOnes[i] = T
        sumsOfWeights[i] = sumOfWeightsTotal
        sumsOfWeightLogWeights[i] = sumOfWeightLogWeightsTotal
        entropies[i] = startingEntropy

        // Reset all patterns to valid
        for (let t = 0; t < T; t++) {
          const waveIdx = getWaveIndex(i, t)
          wave[waveIdx] = 1
        }
      }
    }

    // PHASE 2: Recalculate compatible counts based on actual neighbor states
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        let x = targetX + dx
        let y = targetY + dy
        if (periodicOutput) {
          x = (x + width) % width
          y = (y + height) % height
        } else if (x < 0 || y < 0 || x >= width || y >= height) continue

        const i = x + y * width

        // For each pattern at this cell
        for (let t = 0; t < T; t++) {
          // The "Base" wave index for this pattern
          const cellWaveStart = i * T + t
          // For each direction
          for (let d = 0; d < 4; d++) {
            let nx = x + DX[d]!
            let ny = y + DY[d]!

            if (periodicOutput) {
              nx = (nx + width) % width
              ny = (ny + height) % height
            } else if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              // At boundary: use default (maximum possible)
              let compIdx = cellWaveStart * 4 + d
              compatible[compIdx] = propagator.getCompatibleCount(t, d)

              continue
            }
            const ni = nx + ny * width
            let count = 0

            const validNeighborIds = propagator.getValidPatternIds(t, d)
            for (let l = 0; l < validNeighborIds.length; l++) {
              const neighborPattern = validNeighborIds[l]!

              const waveIdx = getWaveIndex(ni, neighborPattern)
              // Only count it if the neighbor cell actually allows this pattern
              if (wave[waveIdx] === 1) {
                count++
              }
            }
            let compIdx = cellWaveStart * 4 + d
            compatible[compIdx] = count
          }
        }
      }
    }

    // PHASE 3: Ban patterns that have no valid neighbors
    pendingBanCount = 0
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        let x = targetX + dx
        let y = targetY + dy
        if (periodicOutput) {
          x = (x + width) % width
          y = (y + height) % height
        } else if (x < 0 || y < 0 || x >= width || y >= height) continue

        const i = x + y * width
        for (let t = 0; t < T; t++) {
          const cellWaveStart = i * T + t
          for (let d = 0; d < 4; d++) {
            let compIdx = cellWaveStart * 4 + d
            if (compatible[compIdx] === 0) {
              ban(i, t)
              break  // No need to check other directions for this pattern
            }
          }
        }
      }
    }
    // PHASE 4: Propagate constraints
    propagate()
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

  return {
    singleIteration,
    clear,
    isGenerationComplete: () => generationComplete,
    getObserved: () => observed,
    getWave: () => wave,
    onBoundary,
    getRepairCounts: () => repairCounts,
    getFilledCount: () => N_CELLS - uncollapsedCount,
    getTotalCells: () => N_CELLS,
    filledPercent: () => {
      // Method 1: Scan (accurate but slow)
      let collapsed = 0
      for (let i = 0; i < N_CELLS; i++) {
        if (sumsOfOnes[i]! <= 1) collapsed++
      }
      const scanPercent = collapsed / N_CELLS

      // Method 2: Frontier (fast but may be out of sync)
      const frontierPercent = (N_CELLS - uncollapsedCount) / N_CELLS

      // Debug: Are they different?
      if (Math.abs(scanPercent - frontierPercent) > 0.01) {
        console.log(`Mismatch! Scan: ${scanPercent}, Frontier: ${frontierPercent}`)
      }

      return scanPercent
    },
    getChanges,
    T,
    width,
    height,
    weights,
    ban,
    propagate,
  }
}

function randomIndex(array: Float64Array, r: number): number {
  let sum = 0
  for (let i = 0; i < array.length; i++) sum += array[i]!
  if (sum <= 0) return -1
  let x = r * sum
  for (let i = 0; i < array.length; i++) {
    x -= array[i]!
    if (x <= 0) return i
  }
  return array.length - 1
}