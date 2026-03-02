export function formatPercent(val: number | null | undefined, decimals = 2) {
  if (val === null || val === undefined) return ''
  return (val * 100).toFixed(decimals) + '%'
}