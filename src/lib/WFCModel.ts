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
  propagatorData: Int32Array,
  propagatorOffsets: Int32Array,
  propagatorLengths: Int32Array,
  initialGround: number,
) => {
  const N_CELLS = FMX * FMY
  const N_STATES = N_CELLS * T

  // -- State --
  const wave = new Uint8Array(N_STATES)
  const compatible = new Int32Array(N_STATES * 4)
  const observed = new Int32Array(N_CELLS)
  const sumsOfOnes = new Int32Array(N_CELLS)
  const sumsOfWeights = new Float64Array(N_CELLS)
  const sumsOfWeightLogWeights = new Float64Array(N_CELLS)
  const entropies = new Float64Array(N_CELLS)
  const stack = new Int32Array(N_STATES * 2)
  let stackSize = 0

  // -- Static Weights --
  const weightLogWeights = new Float64Array(T)
  let sumOfWeights = 0
  let sumOfWeightLogWeights = 0
  for (let t = 0; t < T; t++) {
    const w = weights[t]!
    weightLogWeights[t] = w * Math.log(w)
    sumOfWeights += w
    sumOfWeightLogWeights += weightLogWeights[t]!
  }
  const startingEntropy = Math.log(sumOfWeights) - sumOfWeightLogWeights / sumOfWeights

  let generationComplete = false
  let initializedField = false
  const distribution = new Float64Array(T)

  const onBoundary = (x: number, y: number): boolean => {
    return !periodic && (x < 0 || y < 0 || x >= FMX || y >= FMY)
  }

  // -- Internal Logic --

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

    const sum = sumsOfWeights[i]!
    entropies[i] = Math.log(sum) - sumsOfWeightLogWeights[i]! / sum
  }

  const rebuildStack = () => {
    stackSize = 0
    for (let i = 0; i < N_CELLS; i++) {
      for (let t = 0; t < T; t++) {
        if (wave[i * T + t] === 0) {
          stack[stackSize * 2] = i
          stack[stackSize * 2 + 1] = t
          stackSize++
        }
      }
    }
  }

  const clearRadius = (targetX: number, targetY: number, radius: number) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        let x = targetX + dx
        let y = targetY + dy

        if (periodic) {
          x = (x + FMX) % FMX
          y = (y + FMY) % FMY
        } else if (x < 0 || y < 0 || x >= FMX || y >= FMY) continue

        const i = x + y * FMX
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
    rebuildStack()
    propagate()
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
    }

    initializedField = true
    generationComplete = false

    if (initialGround >= 0 && initialGround < T) {
      for (let x = 0; x < FMX; x++) {
        for (let t = 0; t < T; t++) {
          if (t !== initialGround) ban(x + (FMY - 1) * FMX, t)
        }
        for (let y = 0; y < FMY - 1; y++) ban(x + y * FMX, initialGround)
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
        const propIndex = d * T + t1
        const offset = propagatorOffsets[propIndex]!
        const len = propagatorLengths[propIndex]!

        for (let l = 0; l < len; l++) {
          const t2 = propagatorData[offset + l]!
          const compIndex = (i2 * T + t2) * 4 + d
          if (compatible[compIndex] === 0) continue // Skip if already 0

          compatible[compIndex]!--
          if (compatible[compIndex] === 0) ban(i2, t2)
        }
      }
    }
  }

  const observe = (rng: RNG): boolean | number | null => {
    let min = 1000
    let argmin = -1

    for (let i = 0; i < N_CELLS; i++) {
      if (onBoundary(i % FMX, (i / FMX) | 0)) continue

      const amount = sumsOfOnes[i]!
      if (amount === 0) return i // FAILURE: return index for repair

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

    for (let t = 0; t < T; t++) {
      distribution[t] = wave[argmin * T + t] === 1 ? weights[t]! : 0
    }

    const chosenT = randomIndice(distribution, rng())
    for (let t = 0; t < T; t++) {
      if (wave[argmin * T + t] === 1 && t !== chosenT) ban(argmin, t)
    }

    return null
  }

  const singleIteration = (rng: RNG): boolean | 'repair' | null => {
    const result = observe(rng)

    if (typeof result === 'number') {
      const x = result % FMX
      const y = (result / FMX) | 0
      clearRadius(x, y, 2) // Repair 5x5 area
      return 'repair'
    }

    if (result === true) {
      generationComplete = true
      return true
    }

    propagate()
    return null
  }

  return {
    singleIteration,
    clear,
    isGenerationComplete: () => generationComplete,
    getObserved: () => observed,
    getWave: () => wave,
    onBoundary,
    T, FMX, FMY
  }
}
