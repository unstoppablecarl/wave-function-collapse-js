<script setup lang="ts">

const { attempt } = defineProps<{
  attempt: WorkerAttempt
}>()

import prettyMilliseconds from 'pretty-ms'
import type { WorkerAttempt } from '../../../lib/_types.ts'
import { formatPercent } from '../../../lib/util/misc.ts'
</script>
<template>
  <div class="row mb-1 attempt-row">
    <div class="col-3">
      <strong>Attempt: </strong> {{ attempt.attempt }}
    </div>
    <div class="col-3">
      <strong>Progress: </strong> {{ formatPercent(attempt.filledPercent) }}
    </div>
    <div class="col-3">
      <strong>Elapsed: </strong> {{ prettyMilliseconds(attempt.elapsedTime) }}
    </div>
    <div class="col-3">
      <strong>Repairs: </strong> {{ attempt.repairs }}
    </div>
  </div>
</template>
<style>
.attempt-row {
  font-size: 0.8rem;
}
</style>