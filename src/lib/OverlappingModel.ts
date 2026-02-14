import { DX, DY, makeWFCModel } from './WFCModel.ts'

export type OverlappingModelOptions = {
  imageData: ImageData,
  N: number,
  width: number,
  height: number,
  periodicInput: boolean,
  periodicOutput: boolean,
  symmetry: number,
  ground: number,
  repairRadius: number,
  drawRepairHeatmap: boolean,
}
export const makeOverlappingModel = (
  {
    imageData,
    N,
    width,
    height,
    periodicInput,
    periodicOutput,
    symmetry,
    ground,
    repairRadius,
    drawRepairHeatmap,
  }: OverlappingModelOptions,
) => {
  // -- Pre-processing --
  const { data, width: dataWidth, height: dataHeight } = imageData

  const sample = new Int32Array(dataWidth * dataHeight)
  const colors: number[][] = []
  const colorMap = new Map<string, number>()

  for (let y = 0; y < dataHeight; y++) {
    for (let x = 0; x < dataWidth; x++) {
      const indexPixel = (y * dataWidth + x) * 4
      const r = data[indexPixel]!
      const g = data[indexPixel + 1]!
      const b = data[indexPixel + 2]!
      const a = data[indexPixel + 3]!
      const key = `${r}-${g}-${b}-${a}`

      let id = colorMap.get(key)
      if (id === undefined) {
        id = colors.length
        colors.push([r, g, b, a])
        colorMap.set(key, id)
      }
      sample[x + y * dataWidth] = id
    }
  }

  const C = colors.length
  // Powers of C for indexing patterns
  // Optimization: Pre-calculate powers to avoid Math.pow in loops if N is small,
  // but N is usually small enough (2,3) that loop is fine.

  const patternLen = N * N

  // Helper to read pattern from sample
  const getPatternFromSample = (x: number, y: number) => {
    const p = new Int32Array(patternLen)
    for (let dy = 0; dy < N; dy++) {
      for (let dx = 0; dx < N; dx++) {
        let sx = (x + dx) % dataWidth
        let sy = (y + dy) % dataHeight
        p[dx + dy * N] = sample[sx + sy * dataWidth]!
      }
    }
    return p
  }

  const rotate = (p: Int32Array) => {
    const res = new Int32Array(patternLen)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        res[x + y * N] = p[N - 1 - y + x * N]!
      }
    }
    return res
  }

  const reflect = (p: Int32Array) => {
    const res = new Int32Array(patternLen)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        res[x + y * N] = p[N - 1 - x + y * N]!
      }
    }
    return res
  }

  const index = (p: Int32Array) => {
    let result = 0
    let power = 1
    for (let i = 0; i < patternLen; i++) {
      result += p[patternLen - 1 - i]! * power
      power *= C
    }
    return result
  }

  const patternFromIndex = (ind: number) => {
    let residue = ind
    let power = Math.pow(C, patternLen)
    const result = new Int32Array(patternLen)

    for (let i = 0; i < patternLen; i++) {
      power /= C
      let count = 0
      while (residue >= power) {
        residue -= power
        count++
      }
      result[i] = count
    }
    return result
  }

  const weightsMap = new Map<number, number>()
  const patternsArray: Int32Array[] = [] // Temporary storage

  const yMax = periodicInput ? dataHeight : dataHeight - N + 1
  const xMax = periodicInput ? dataWidth : dataWidth - N + 1

  for (let y = 0; y < yMax; y++) {
    for (let x = 0; x < xMax; x++) {
      const ps: Int32Array[] = new Array(8)
      ps[0] = getPatternFromSample(x, y)
      ps[1] = reflect(ps[0])
      ps[2] = rotate(ps[0])
      ps[3] = reflect(ps[2])
      ps[4] = rotate(ps[2])
      ps[5] = reflect(ps[4])
      ps[6] = rotate(ps[4])
      ps[7] = reflect(ps[6])

      for (let k = 0; k < symmetry; k++) {
        const ind = index(ps[k]!)
        const w = weightsMap.get(ind)
        if (w) {
          weightsMap.set(ind, w + 1)
        } else {
          weightsMap.set(ind, 1)
          patternsArray.push(ps[k]!)
        }
      }
    }
  }

  const T = weightsMap.size

  // Sort keys to ensure determinism (Map iteration order is insertion order, but better safe)
  // Actually, original uses Object.keys which is not insertion ordered for integers.
  // We'll stick to insertion order of weightsMap for now as it matches the loop.
  const weightsKeys = Array.from(weightsMap.keys())

  const patterns = new Int32Array(T * patternLen)
  const weights = new Float64Array(T)

  for (let i = 0; i < T; i++) {
    const key = weightsKeys[i]!
    // Reconstruct pattern from key (more reliable than storing arrays)
    const pat = patternFromIndex(key)
    weights[i] = weightsMap.get(key)!

    // Copy to flat patterns array
    for (let k = 0; k < patternLen; k++) {
      patterns[i * patternLen + k] = pat[k]!
    }
  }

  const agrees = (p1Idx: number, p2Idx: number, dx: number, dy: number) => {
    const xmin = dx < 0 ? 0 : dx
    const xmax = dx < 0 ? dx + N : N
    const ymin = dy < 0 ? 0 : dy
    const ymax = dy < 0 ? dy + N : N

    const p1Offset = p1Idx * patternLen
    const p2Offset = p2Idx * patternLen

    for (let y = ymin; y < ymax; y++) {
      for (let x = xmin; x < xmax; x++) {
        const idx1 = p1Offset + x + N * y
        const idx2 = p2Offset + (x - dx) + N * (y - dy)
        if (patterns[idx1] !== patterns[idx2]) {
          return false
        }
      }
    }
    return true
  }

  // Build Propagator (Flattened)
  // We need to know neighbors for every T in every 4 directions
  const tempPropagator: number[][][] = [[], [], [], []]

  for (let d = 0; d < 4; d++) {
    for (let t1 = 0; t1 < T; t1++) {
      const list: number[] = []
      for (let t2 = 0; t2 < T; t2++) {
        if (agrees(t1, t2, DX[d]!, DY[d]!)) {
          list.push(t2)
        }
      }
      tempPropagator[d]!.push(list)
    }
  }

  // Flatten propagator for Model consumption
  // Structure: 4 directions. Per direction: T entries.
  // We need simple lookups.
  // Total size calculation
  let totalPropagatorSize = 0
  for (let d = 0; d < 4; d++) {
    for (let t = 0; t < T; t++) {
      totalPropagatorSize += tempPropagator[d]![t]!.length
    }
  }

  const propagatorData = new Int32Array(totalPropagatorSize)
  const propagatorOffsets = new Int32Array(4 * T)
  const propagatorLengths = new Int32Array(4 * T)

  let propCursor = 0
  for (let d = 0; d < 4; d++) {
    for (let t = 0; t < T; t++) {
      const idx = d * T + t
      const list = tempPropagator[d]![t]!
      propagatorOffsets[idx] = propCursor
      propagatorLengths[idx] = list.length

      for (let k = 0; k < list.length; k++) {
        propagatorData[propCursor++] = list[k]!
      }
    }
  }

  const model = makeWFCModel({
    FMX: width,
    FMY: height,
    T,
    periodic: periodicOutput,
    weights,
    propagatorData,
    propagatorOffsets,
    propagatorLengths,
    initialGround: ground,
    repairRadius,
  })

  // -- Graphics --

  const graphics = (array?: Uint8Array | Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> => {
    const out = array || new Uint8Array(width * height * 4)
    const repairCounts = model.getRepairCounts()

    if (model.isGenerationComplete()) {
      graphicsComplete(out)
    } else {
      graphicsIncomplete(out)
    }

    if (drawRepairHeatmap) {
      for (let i = 0; i < width * height; i++) {
        const heat = repairCounts[i]!
        if (heat > 0) {
          const px = i * 4
          // Blend red into the existing pixel based on heat intensity
          // Adjust the '50' to make the heat more or less sensitive
          const intensity = Math.min(heat * 40, 200)
          out[px] = Math.min(out[px]! + intensity, 255)     // Boost Red
          out[px + 1] = Math.max(out[px + 1]! - intensity, 0) // Drop Green
          out[px + 2] = Math.max(out[px + 2]! - intensity, 0) // Drop Blue
        }
      }
    }

    return out as Uint8ClampedArray<ArrayBuffer>
  }

  const graphicsComplete = (array: Uint8Array | Uint8ClampedArray) => {
    const observed = model.getObserved()

    for (let y = 0; y < height; y++) {
      const dy = y < height - N + 1 ? 0 : N - 1
      for (let x = 0; x < width; x++) {
        const dx = x < width - N + 1 ? 0 : N - 1

        const i = x - dx + (y - dy) * width
        const patternIdx = observed[i]!
        const colorId = patterns[patternIdx * patternLen + (dx + dy * N)]!
        const color = colors[colorId]!

        const px = (y * width + x) * 4
        array[px] = color[0]!
        array[px + 1] = color[1]!
        array[px + 2] = color[2]!
        array[px + 3] = color[3]!
      }
    }
  }

  const graphicsIncomplete = (array: Uint8Array | Uint8ClampedArray) => {
    const wave = model.getWave()
    const T = model.T

    for (let i = 0; i < width * height; i++) {
      const x = i % width
      const y = (i / width) | 0

      let contributors = 0
      let r = 0, g = 0, b = 0, a = 0

      for (let dy = 0; dy < N; dy++) {
        for (let dx = 0; dx < N; dx++) {
          let sx = x - dx
          let sy = y - dy

          if (sx < 0) sx = periodicOutput ? sx + width : sx
          if (sy < 0) sy = periodicOutput ? sy + height : sy

          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue

          const s = sx + sy * width
          const waveOffset = s * T

          for (let t = 0; t < T; t++) {
            if (wave[waveOffset + t] === 1) {
              contributors++
              const colorId = patterns[t * (N * N) + (dx + dy * N)]!
              const color = colors[colorId]!
              r += color[0]!
              g += color[1]!
              b += color[2]!
              a += color[3]!
            }
          }
        }
      }

      const px = i * 4
      if (contributors > 0) {
        array[px] = r / contributors
        array[px + 1] = g / contributors
        array[px + 2] = b / contributors
        array[px + 3] = 255 // Always use full alpha for logs
      } else {
        // If we are here, this pixel is "impossible"
        // Let's paint it a dark grey instead of bright magenta so you can
        // see if there is ANY other data around it.
        array[px] = 40
        array[px + 1] = 40
        array[px + 2] = 45
        array[px + 3] = 255
      }
    }
  }
  // Return Composite Interface
  return {
    ...model,
    graphics,
  }
}
