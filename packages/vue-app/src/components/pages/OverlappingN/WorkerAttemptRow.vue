<script setup lang="ts">

const { attempt } = defineProps<{
  attempt: OverlappingNWorkerAttempt
}>()

import prettyMilliseconds from 'pretty-ms'
import prettyBytes from 'pretty-bytes'
import { formatPercent } from '../../../lib/util/misc.ts'
import type { OverlappingNWorkerAttempt } from '../../../lib/wfc/OverlappingN/OverlappingNAttempt.ts'
</script>
<template>
  <div class="row mb-1 attempt-row">
    <div class="col-2">
      <strong>Attempt: </strong> {{ attempt.attempt }}
    </div>
    <div class="col-3">
      <strong>Progress: </strong> {{ formatPercent(attempt.filledPercent) }}
    </div>
    <div class="col-3">
      <strong>Elapsed: </strong> {{ prettyMilliseconds(attempt.elapsedTime) }}
    </div>
    <div class="col-2">
      <strong>Reverts: </strong> {{ attempt.reverts }}
    </div>
    <div class="col-2">
      <strong>Memory: </strong> {{ prettyBytes(attempt.totalMemoryUseBytes) }}
    </div>
  </div>
</template>
<style>
.attempt-row {
  font-size: 0.8rem;
}
</style>