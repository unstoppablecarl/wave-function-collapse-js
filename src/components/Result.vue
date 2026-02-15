<script setup lang="ts">

const {} = defineProps<>()

import prettyMilliseconds from 'pretty-ms'
</script>
<template>
  <div class="row mb-1">
    <div class="col-3">
      <strong>Attempt: </strong> {{ result.attempt }}
    </div>
    <div class="col-3">
      <strong>Progress: </strong> {{ (result.filledPercent * 100).toFixed(1) }}%
    </div>
    <div class="col-3">
      <strong>Elapsed: </strong> {{ prettyMilliseconds(result.elapsedTime) }}
    </div>
    <div class="col-3">
      <strong>Repairs: </strong> {{ result.repairs }}
    </div>
  </div>
</template>
<style>

</style>