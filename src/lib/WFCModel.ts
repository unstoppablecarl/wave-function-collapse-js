export type RNG = () => number
export const DX = new Int32Array([-1, 0, 1, 0])
export const DY = new Int32Array([0, 1, 0, -1])
export const OPPOSITE = new Int32Array([2, 3, 0, 1])

export enum IterationResult {
  REPAIR = 'REPAIR',
  SUCCESS = 'SUCCESS',
  STEP = 'STEP'
}

export type WFCModelOptions = {
  width: number,
  height: number,
  T: number,
  periodicOutput: boolean,
  weights: Float64Array,
  propagatorData: Int32Array,
  propagatorOffsets: Int32Array,
  propagatorLengths: Int32Array,
  initialGround: number,
  repairRadius: number,
  centerBias: number,
}

export const makeWFCModel = (
  {
    width,
    height,
    // the number of unique patterns or tiles the algorithm has to choose from for every single cell
    T,
    periodicOutput,
    weights,
    propagatorData,
    propagatorOffsets,
    propagatorLengths,
    initialGround,
    repairRadius,
    centerBias,
  }: WFCModelOptions,
) => {
  const N_CELLS = width * height
  const N_STATES = N_CELLS * T

  // Banned: a specific pattern has been mathematically ruled out as a possibility for a specific cell

  // The core "wave" state: A 3D boolean array flattened to 1D [cellIndex * patternCount + patternIndex]
  // 1 means the pattern is still possible at that cell; 0 means it is banned.
  const wave = new Uint8Array(N_STATES)

  // SUPPORT COUNTERS: Tracks how many patterns in each neighbor cell 'agree' with pattern 't' at this cell.
  // For pattern 't' to remain possible, it must have at least one valid neighbor in EVERY direction.
  // Logic: If compatible[cell_i][pattern_t][direction_d] reaches 0, it means NO remaining patterns
  // in that neighbor cell allow pattern 't' to exist here. Pattern 't' must then be banned.
  // Indexing: [((cellIndex * patternCount) + patternIndex) * 4 + direction] = number of compatible patterns
  const compatible = new Int32Array(N_STATES * 4)

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
  const stack = new Int32Array(N_STATES * 2)

  // Tracks how many times a specific cell has been reset by the repair (clearRadius) logic.
  // Useful for identifying "problem areas" in a generation.
  const repairCounts = new Uint32Array(N_CELLS)

  // Current pointer for the propagation stack.
  let stackSize = 0

  // -- Active Frontier & Biasing --

  // A list of all cell indices that have not yet collapsed (sumsOfOnes > 1).
  // Allows the observer to skip already-solved cells entirely.
  const uncollapsedIndices = new Int32Array(N_CELLS)

  // The current number of active indices in the uncollapsedIndices frontier.
  let uncollapsedCount = 0

  // A static priority map that biases the algorithm to pick cells near a specific focus point.
  // Used to grow the solution like a crystal, which significantly reduces contradictions.
  // Indexing: [x + y * width]
  const spatialPriority = new Float64Array(N_CELLS)

  // Pre-calculate weights

  // Individual weight log values: weights[t] * Math.log(weights[t]).
  // Pre-calculated once to avoid calling Math.log millions of times during propagation.
  const weightLogWeights = new Float64Array(T)

  // The total sum of weights of all patterns in the source tileset.
  let sumOfWeights = 0

  // The total sum of weightLogWeights for the entire source tileset.
  let sumOfWeightLogWeights = 0

  for (let t = 0; t < T; t++) {
    const w = weights[t]!
    weightLogWeights[t] = w * Math.log(w)
    sumOfWeights += w
    sumOfWeightLogWeights += weightLogWeights[t]!
  }
  const startingEntropy = Math.log(sumOfWeights) - sumOfWeightLogWeights / sumOfWeights

  // Initialize Spatial Bias (Center-out growth)
  const centerX = (width / 2) | 0
  const centerY = (height / 2) | 0
  for (let i = 0; i < N_CELLS; i++) {
    const x = i % width
    const y = (i / width) | 0
    const dx = x - centerX
    const dy = y - centerY
    // Lower value = higher priority.
    // We scale the distance so it influences choice without totally overriding entropy.
    spatialPriority[i] = Math.sqrt(dx * dx + dy * dy) * centerBias
  }

  let generationComplete = false
  const distribution = new Float64Array(T)

  const onBoundary = (x: number, y: number): boolean => {
    return !periodicOutput && (x < 0 || y < 0 || x >= width || y >= height)
  }

  const ban = (i: number, t: number) => {
    if (wave[i * T + t] === 0) return
    wave[i * T + t] = 0

    const compStart = (i * T + t) * 4
    compatible[compStart] = 0
    compatible[compStart + 1] = 0
    compatible[compStart + 2] = 0
    compatible[compStart + 3] = 0

    stack[stackSize * 2] = i
    stack[stackSize * 2 + 1] = t
    stackSize++

    sumsOfOnes[i]! -= 1
    sumsOfWeights[i]! -= weights[t]!
    sumsOfWeightLogWeights[i]! -= weightLogWeights[t]!

    // Incremental Shannon Entropy calculation:
    // This avoids looping over all patterns in the cell (T) every time one is banned.
    // We use a small epsilon (1e-10) to prevent Math.log(0), which would return NaN.
    const sum = Math.max(sumsOfWeights[i]!, 1e-10)
    const val = Math.log(sum) - sumsOfWeightLogWeights[i]! / sum
    entropies[i] = Math.max(0, val)
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
    stackSize = 0
    for (let i = 0; i < N_CELLS; i++) {
      for (let t = 0; t < T; t++) {
        wave[i * T + t] = 1
        for (let d = 0; d < 4; d++) {
          const opp = OPPOSITE[d]!
          compatible[(i * T + t) * 4 + d] = propagatorLengths[opp * T + t]!
        }
      }
      sumsOfOnes[i] = T
      sumsOfWeights[i] = sumOfWeights
      sumsOfWeightLogWeights[i] = sumOfWeightLogWeights
      entropies[i] = startingEntropy
      observed[i] = -1
      repairCounts[i] = 0
    }

    refreshUncollapsed()
    generationComplete = false

    if (initialGround >= 0 && initialGround < T) {
      const groundY = height - 1
      for (let x = 0; x < width; x++) {
        const idx = x + groundY * width
        for (let t = 0; t < T; t++) {
          if (t !== initialGround) ban(idx, t)
        }
        for (let y = 0; y < groundY; y++) ban(x + y * width, initialGround)
      }
      propagate()
    }
  }

  const propagate = () => {
    while (stackSize > 0) {
      stackSize--
      const i1 = stack[stackSize * 2]!
      const t1 = stack[stackSize * 2 + 1]!
      const x1 = i1 % width
      const y1 = (i1 / width) | 0

      for (let d = 0; d < 4; d++) {
        let x2 = x1 + DX[d]!
        let y2 = y1 + DY[d]!

        if (onBoundary(x2, y2)) continue

        if (x2 < 0) x2 += width
        else if (x2 >= width) x2 -= width
        if (y2 < 0) y2 += height
        else if (y2 >= height) y2 -= height

        const i2 = x2 + y2 * width
        const propIndex = d * T + t1
        const offset = propagatorOffsets[propIndex]!
        const len = propagatorLengths[propIndex]!

        for (let l = 0; l < len; l++) {
          const t2 = propagatorData[offset + l]!
          const compIndex = (i2 * T + t2) * 4 + d
          if (compatible[compIndex] === 0) continue

          compatible[compIndex]!--
          if (compatible[compIndex] === 0) ban(i2, t2)
        }
      }
    }
  }

  const observe = (rng: RNG): boolean | number | null => {
    let minScore = 1e10
    let argmin = -1
    let argminIdx = -1

    // Scan only the active uncollapsed cells from our frontier
    for (let idx = 0; idx < uncollapsedCount; idx++) {
      const i = uncollapsedIndices[idx]!
      const amount = sumsOfOnes[i]!

      // CONTRADICTION: A cell has 0 possible patterns.
      // We return the index so clearRadius can "heal" this area.
      if (amount === 0) return i

      if (amount > 1) {
        // THE HEURISTIC SCORE:
        // 1. entropies[i]: The Shannon Entropy (prioritize highly constrained cells).
        // 2. spatialPriority[i]: The distance from center (prioritize crystal-like growth).
        // 3. noise: A tiny random tie-breaker to prevent "scanline" artifacts and rigid patterns.
        const score = entropies[i]! + spatialPriority[i]! + (0.000001 * rng())

        if (argmin === -1 || score < minScore) {
          minScore = score
          argmin = i
          argminIdx = idx
        }
      }
    }

    // SUCCESS: All cells have exactly 1 or 0 patterns left.
    if (argmin === -1) {
      for (let i = 0; i < N_CELLS; i++) {
        for (let t = 0; t < T; t++) {
          if (wave[i * T + t] === 1) {
            observed[i] = t // Finalize the visual result
            break
          }
        }
      }
      return true
    }

    // COLLAPSE: Force the selected cell into a single state based on pattern weights.
    for (let t = 0; t < T; t++) {
      distribution[t] = wave[argmin * T + t] === 1 ? weights[t]! : 0
    }

    const chosenT = randomIndex(distribution, rng())

    // Ban all other patterns in this cell except for the chosen one.
    for (let t = 0; t < T; t++) {
      if (wave[argmin * T + t] === 1 && t !== chosenT) ban(argmin, t)
    }

    // FRONTIER MANAGEMENT (Swap-and-Pop):
    // Since this cell is now collapsed (sumsOfOnes == 1), move it out of the active list.
    // We swap it with the last element in the array to keep the list contiguous.
    if (sumsOfOnes[argmin] === 1) {
      uncollapsedIndices[argminIdx] = uncollapsedIndices[--uncollapsedCount]!
    }

    return null
  }
  const singleIteration = (rng: RNG): IterationResult => {
    const result = observe(rng)

    if (typeof result === 'number') {
      const x = result % width
      const y = (result / width) | 0
      clearRadius(x, y, repairRadius)
      refreshUncollapsed() // Full refresh after repair
      return IterationResult.REPAIR
    }

    if (result === true) {
      propagate()
      generationComplete = true
      return IterationResult.SUCCESS
    }

    propagate()

    // Clean up frontier: Remove cells collapsed by propagation
    let i = 0
    while (i < uncollapsedCount) {
      if (sumsOfOnes[uncollapsedIndices[i]!]! <= 1) {
        uncollapsedIndices[i] = uncollapsedIndices[--uncollapsedCount]!
      } else {
        i++
      }
    }

    return IterationResult.STEP
  }

  const clearRadius = (targetX: number, targetY: number, radius: number) => {
    // 1. Clear the hole
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        let x = targetX + dx
        let y = targetY + dy
        if (periodicOutput) {
          x = (x + width) % width
          y = (y + height) % height
        } else if (x < 0 || y < 0 || x >= width || y >= height) continue

        const i = x + y * width

        // Reset cell to original "superposition" state
        repairCounts[i]!++
        observed[i] = -1
        sumsOfOnes[i] = T
        sumsOfWeights[i] = sumOfWeights
        sumsOfWeightLogWeights[i] = sumOfWeightLogWeights
        entropies[i] = startingEntropy

        for (let t = 0; t < T; t++) {
          wave[i * T + t] = 1
          for (let d = 0; d < 4; d++) {
            const opp = OPPOSITE[d]!
            compatible[(i * T + t) * 4 + d] = propagatorLengths[opp * T + t]!
          }
        }
      }
    }

    // 2. Optimized Stack Rebuild: Only push neighbors on the "rim" of the hole.
    // We only need to re-propagate constraints from the static cells
    // immediately surrounding the cleared radius.
    stackSize = 0
    const rim = radius + 1
    for (let dy = -rim; dy <= rim; dy++) {
      for (let dx = -rim; dx <= rim; dx++) {
        // Only process the outer shell (the rim)
        if (Math.abs(dx) !== rim && Math.abs(dy) !== rim) continue

        let x = targetX + dx
        let y = targetY + dy
        if (periodicOutput) {
          x = (x + width) % width
          y = (y + height) % height
        } else if (x < 0 || y < 0 || x >= width || y >= height) continue

        const i = x + y * width
        // Push every pattern that is ALREADY BANNED in this neighbor
        // so it can propagate that ban into the newly cleared area.
        for (let t = 0; t < T; t++) {
          if (wave[i * T + t] === 0) {
            stack[stackSize * 2] = i
            stack[stackSize * 2 + 1] = t
            stackSize++
          }
        }
      }
    }
    propagate()
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
    filledPercent: () => (N_CELLS - uncollapsedCount) / N_CELLS,
    T, FMX: width, FMY: height,
  }
}

function randomIndex(array: Float64Array, r: number): number {
  let sum = 0
  for (let i = 0; i < array.length; i++) sum += array[i]!
  if (sum === 0) return 0
  let x = r * sum
  for (let i = 0; i < array.length; i++) {
    x -= array[i]!
    if (x <= 0) return i
  }
  return 0
}