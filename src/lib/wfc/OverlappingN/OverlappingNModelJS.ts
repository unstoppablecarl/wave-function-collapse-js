import { makeWFCModel } from '../WFCModel.ts'
import type { OverlappingNModelCreator, OverlappingNOptions } from './OverlappingNModel.ts'

export const makeOverlappingNJS: OverlappingNModelCreator = async (
  {
    width,
    height,
    periodicOutput,
    startCoordBias,
    startCoordX,
    startCoordY,
    ruleset,
  }: OverlappingNOptions) => {

  const { T, N, propagator, weights, patterns } = ruleset

  const initialGround = -1
  const model = makeWFCModel({
    width,
    height,
    T,
    periodicOutput,
    weights,
    propagator,
    initialGround,
    startCoordBias,
    startCoordX,
    startCoordY,
    patterns,
    N,
  })

  return {
    ...model,
    destroy: () => {
    },
    ruleset,
  }
}