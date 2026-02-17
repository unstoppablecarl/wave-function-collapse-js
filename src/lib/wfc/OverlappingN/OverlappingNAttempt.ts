import { reactive } from 'vue'

export type OverlappingNAttempt = Omit<OverlappingNWorkerAttempt, 'startedAt'> & {
  encoded: string,
}

export type OverlappingNWorkerAttempt = {
  attempt: number,
  startedAt: number,
  reverts: number,
  elapsedTime: number,
  filledPercent: number,
}

export function makeOverlappingNAttempt() {
  return reactive<OverlappingNWorkerAttempt>({
    attempt: 0,
    startedAt: 0,
    filledPercent: 0,
    elapsedTime: 0,
    reverts: 0,
  })
}

export function resetOverlappingNAttempt(result: OverlappingNWorkerAttempt, attempt: number) {
  result.attempt = attempt
  result.filledPercent = 0
  result.startedAt = performance.now()
  result.elapsedTime = 0
  result.reverts = 0
}