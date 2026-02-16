const DIRECTIONS = [
  { name: 'LEFT', dx: -1, dy: 0, oppositeName: 'RIGHT' },
  { name: 'DOWN', dx: 0, dy: 1, oppositeName: 'UP' },
  { name: 'RIGHT', dx: 1, dy: 0, oppositeName: 'LEFT' },
  { name: 'UP', dx: 0, dy: -1, oppositeName: 'DOWN' },
] as const
export const DX = new Int32Array(DIRECTIONS.map(d => d.dx))
export const DY = new Int32Array(DIRECTIONS.map(d => d.dy))
export const OPPOSITE_DIR = new Int32Array(
  DIRECTIONS.map(d =>
    DIRECTIONS.findIndex(other => other.name === d.oppositeName),
  ),
)