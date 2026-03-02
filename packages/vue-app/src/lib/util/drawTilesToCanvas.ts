export function getTileGridToCanvasSize(tileCount: number, tileWidth: number, tileHeight: number, gap = 2) {
  const gridWidth = Math.ceil(Math.sqrt(tileCount))
  const gridHeight = Math.ceil(tileCount / gridWidth)

  return {
    tileWidth,
    tileHeight,
    gap,
    gridWidth,
    gridHeight,
    width: gridWidth * (tileWidth + gap) + gap,
    height: gridHeight * (tileHeight + gap) + gap,
  }
}

export function drawTileGridToCanvas(
  canvas: HTMLCanvasElement,
  tiles: ImageData[],
) {
  if (tiles.length === 0) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const {
    tileWidth,
    tileHeight,
    gridWidth,
    gap,
  } = getTileGridToCanvasSize(tiles.length, tiles[0]!.width, tiles[0]!.height)

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]!
    const col = i % gridWidth
    const row = Math.floor(i / gridWidth)

    // Calculate x and y with 1px padding
    const x = gap + col * (tileWidth + gap)
    const y = gap + row * (tileHeight + gap)

    ctx.putImageData(tile, x, y)
  }
}