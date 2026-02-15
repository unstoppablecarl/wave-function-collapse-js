<script setup lang="ts">
import { computed } from 'vue'
import { SYMMETRY_OPTIONS } from '../lib/symmetry-options.ts'



// Map the symmetry values to their specific data
const symmetryOptions = SYMMETRY_OPTIONS

const symmetry = defineModel<number>({ default: 1 })

const currentDescription = computed(() => {
  return symmetryOptions[symmetry.value]?.description || ''
})
</script>

<template>
  <fieldset class="group">
    <legend>Symmetry Mode</legend>
    <select v-model.number="symmetry">
      <option v-for="(detail, value) in symmetryOptions" :key="value" :value="Number(value)">
        {{ value }}: {{ detail.name }}
      </option>
    </select>
  </fieldset>
  <div class="symmetry-desc">
    <strong>Effect:</strong> {{ currentDescription }}
  </div>
</template>
<style>
.symmetry-desc {
  margin: 0.5rem;
  font-size: 0.8rem;
}
</style>