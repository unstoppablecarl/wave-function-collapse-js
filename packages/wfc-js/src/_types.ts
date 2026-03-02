export enum IterationResult {
  REVERT,
  SUCCESS,
  STEP,
  FAIL
}

export type CellIndex = number & { readonly __brandPatternIndex: unique symbol; }
export type PatternIndex = number & { readonly __brandPatternIndex: unique symbol; }
export type RNG = () => number