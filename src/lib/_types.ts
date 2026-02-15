import { reactive } from 'vue'

export type Attempt = Omit<WorkerAttempt, 'startedAt'> & {
  encoded: string,
}

export type WorkerAttempt = {
  attempt: number,
  startedAt: number,
  repairs: number,
  elapsedTime: number,
  filledPercent: number,
}

export function makeAttempt() {
  return reactive<WorkerAttempt>({
    attempt: 0,
    startedAt: 0,
    filledPercent: 0,
    elapsedTime: 0,
    repairs: 0,
  })
}

export function resetAttempt(result: WorkerAttempt, attempt: number) {
  result.attempt = attempt
  result.filledPercent = 0
  result.startedAt = performance.now()
  result.elapsedTime = 0
  result.repairs = 0
}