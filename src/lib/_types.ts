
export type Attempt = Omit<Result, 'startedAt'> & {
  encoded: string,
}

export type Result = {
  attempt: number,
  startedAt: number,
  repairs: number,
  elapsedTime: number,
  filledPercent: number,
}
