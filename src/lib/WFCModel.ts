export type RNG = () => number
export const DX = new Int32Array([-1, 0, 1, 0])
export const DY = new Int32Array([0, 1, 0, -1])
export const OPPOSITE = new Int32Array([2, 3, 0, 1])

const randomIndice = (array: Float64Array, r: number): number => {
  let sum = 0
  let x = 0
  let i = 0

  for (; i < array.length; i++) {
    sum += array[i]!
  }

  i = 0
  x = r * sum

  for (; i < array.length; i++) {
    x -= array[i]!
    if (x <= 0) return i
  }

  return 0
}

/**
 * Core WaveFunctionCollapse Algorithm
 * Optimized with flat TypedArrays and zero allocation loops
 */
export const makeWFCModel = (
  FMX: number,
  FMY: number,
  T: number,
  periodic: boolean,
  weights: Float64Array,
  // Propagator is flattened: [Direction * T + Pattern] -> {offset, length} into propagatorData
  propagatorData: Int32Array,
  propagatorOffsets: Int32Array,
  propagatorLengths: Int32Array,
  initialGround: number,
) => {
  const N_CELLS = FMX * FMY
  const N_STATES = N_CELLS * T

  // -- State (Flattened TypedArrays) --

  // boolean replacement: 0 = false, 1 = true. Index: [cellIndex * T + patternIndex]
  const wave = new Uint8Array(N_STATES)

  // count of compatible neighbors. Index: [(cellIndex * T + patternIndex) * 4 + direction]
  const compatible = new Int32Array(N_STATES * 4)

  // Observed state per cell. -1 if unobserved. Index: [cellIndex]
  const observed = new Int32Array(N_CELLS)

  // Entropy tracking. Index: [cellIndex]
  const sumsOfOnes = new Int32Array(N_CELLS)
  const sumsOfWeights = new Float64Array(N_CELLS)
  const sumsOfWeightLogWeights = new Float64Array(N_CELLS)
  const entropies = new Float64Array(N_CELLS)

  // Stack for propagation. Format: [cellIndex, patternIndex].
  // We use a flat array size N_STATES * 2 (max possible modifications) and a pointer
  const stack = new Int32Array(N_STATES * 2)
  let stackSize = 0

  // Static weight calculations
  const weightLogWeights = new Float64Array(T)
  let sumOfWeights = 0
  let sumOfWeightLogWeights = 0

  // Temporary distribution array for observation (reused to avoid GC)
  const distribution = new Float64Array(T)

  // -- Initialization --

  for (let t = 0; t < T; t++) {
    const w = weights[t]!
    weightLogWeights[t] = w * Math.log(w)
    sumOfWeights += w
    sumOfWeightLogWeights += weightLogWeights[t]!
  }

  const startingEntropy = Math.log(sumOfWeights) - sumOfWeightLogWeights / sumOfWeights

  let generationComplete = false
  let initializedField = false

  const onBoundary = (x: number, y: number): boolean => {
    return !periodic && (x < 0 || y < 0 || x >= FMX || y >= FMY)
  }

  // -- Core Logic --

  const ban = (i: number, t: number) => {
    // Check if already banned to avoid double stacking
    // (wave is 0 or 1)
    if (wave[i * T + t] === 0) return

    wave[i * T + t] = 0

    // Reset compatible counts for this node to 0 (redundant but safe)
    const compStart = (i * T + t) * 4
    compatible[compStart] = 0
    compatible[compStart + 1] = 0
    compatible[compStart + 2] = 0
    compatible[compStart + 3] = 0

    // Push to stack
    stack[stackSize * 2] = i
    stack[stackSize * 2 + 1] = t
    stackSize++

    // Update entropy
    sumsOfOnes[i]! -= 1
    sumsOfWeights[i]! -= weights[t]!
    sumsOfWeightLogWeights[i]! -= weightLogWeights[t]!

    const sum = sumsOfWeights[i]!
    entropies[i] = Math.log(sum) - sumsOfWeightLogWeights[i]! / sum
  }

  const clear = () => {
    stackSize = 0

    // Reset Wave and Compatible
    for (let i = 0; i < N_CELLS; i++) {
      for (let t = 0; t < T; t++) {
        wave[i * T + t] = 1

        for (let d = 0; d < 4; d++) {
          // Look up how many neighbors allow this pattern from the opposite direction
          // The propagator here is "Who allows me?".
          // compatible[d] = count of allowed neighbors in direction d
          const opp = OPPOSITE[d]!
          // In the original, compatible was initialized with propagator[opposite[d]][t].length
          const propIndex = opp * T + t
          compatible[(i * T + t) * 4 + d] = propagatorLengths[propIndex]!
        }
      }

      sumsOfOnes[i] = T
      sumsOfWeights[i] = sumOfWeights
      sumsOfWeightLogWeights[i] = sumOfWeightLogWeights
      entropies[i] = startingEntropy
      observed[i] = -1
    }

    initializedField = true
    generationComplete = false

    // Apply ground constraint if needed
    if (initialGround !== -1) {
      const groundIndex = (initialGround + T) % T

      for (let x = 0; x < FMX; x++) {
        for (let t = 0; t < T; t++) {
          if (t !== groundIndex) {
            ban(x + (FMY - 1) * FMX, t)
          }
        }
        for (let y = 0; y < FMY - 1; y++) {
          ban(x + y * FMX, groundIndex)
        }
      }
      propagate()
    }
  }

  const propagate = () => {
    while (stackSize > 0) {
      stackSize--
      const i1 = stack[stackSize * 2]!
      const t1 = stack[stackSize * 2 + 1]!

      const x1 = i1 % FMX
      const y1 = (i1 / FMX) | 0

      for (let d = 0; d < 4; d++) {
        let x2 = x1 + DX[d]!
        let y2 = y1 + DY[d]!

        if (onBoundary(x2, y2)) continue

        if (x2 < 0) x2 += FMX
        else if (x2 >= FMX) x2 -= FMX
        if (y2 < 0) y2 += FMY
        else if (y2 >= FMY) y2 -= FMY

        const i2 = x2 + y2 * FMX

        // Allowed neighbors for t1 in direction d
        const propIndex = d * T + t1
        const offset = propagatorOffsets[propIndex]!
        const len = propagatorLengths[propIndex]!

        // Loop over allowed patterns (t2)
        for (let l = 0; l < len; l++) {
          const t2 = propagatorData[offset + l]!

          // Decrement compatible count for t2 at i2 from opposite direction
          const compIndex = (i2 * T + t2) * 4 + d
          compatible[compIndex]!--

          if (compatible[compIndex] === 0) {
            ban(i2, t2)
          }
        }
      }
    }
  }

  const observe = (rng: RNG): boolean | null => {
    let min = 1000
    let argmin = -1

    for (let i = 0; i < N_CELLS; i++) {
      if (onBoundary(i % FMX, (i / FMX) | 0)) continue

      const amount = sumsOfOnes[i]!
      if (amount === 0) return false

      const entropy = entropies[i]!
      if (amount > 1 && entropy <= min) {
        const noise = 0.000001 * rng()
        if (entropy + noise < min) {
          min = entropy + noise
          argmin = i
        }
      }
    }

    if (argmin === -1) {
      // Success, fill observed
      for (let i = 0; i < N_CELLS; i++) {
        for (let t = 0; t < T; t++) {
          if (wave[i * T + t] === 1) {
            observed[i] = t
            break
          }
        }
      }
      return true
    }

    // Weighted random choice
    for (let t = 0; t < T; t++) {
      distribution[t] = wave[argmin * T + t]! === 1 ? weights[t]! : 0
    }

    const r = randomIndice(distribution, rng())
    const chosenT = r

    for (let t = 0; t < T; t++) {
      if (wave[argmin * T + t] === 1 && t !== chosenT) {
        ban(argmin, t)
      }
    }

    return null
  }

  const singleIteration = (rng: RNG) => {
    const result = observe(rng)
    if (result !== null) {
      generationComplete = result
      return !!result
    }
    propagate()
    return null
  }

  const iterate = (iterations: number = 0, rng: RNG = Math.random): boolean => {
    if (!initializedField) clear()

    for (let i = 0; i < iterations || iterations === 0; i++) {
      const result = singleIteration(rng)
      if (result !== null) return !!result
    }
    return true
  }

  const generate = (rng: RNG = Math.random): boolean => {
    if (!initializedField) clear()
    while (true) {
      const result = singleIteration(rng)
      if (result !== null) return !!result
    }
  }

  const isGenerationComplete = () => generationComplete

  // Expose internals for OverlappingModel to use in graphics
  const getObserved = () => observed
  const getWave = () => wave

  return {
    iterate,
    generate,
    isGenerationComplete,
    clear,
    getObserved,
    getWave,
    // Helper to check boundaries for graphics
    onBoundary,
    FMX, FMXxFMY: N_CELLS, T, N_STATES,
  }
}
