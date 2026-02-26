export type RNG = () => number

export enum IterationResult {
  REVERT,
  SUCCESS,
  STEP,
  FAIL
}