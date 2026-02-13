<script setup lang="ts">
import { computed } from 'vue'

interface SymmetryDetail {
  name: string
  description: string
}

// Map the symmetry values to their specific data
const symmetryOptions: Record<number, SymmetryDetail> = {
  1: { name: 'None', description: 'Only the patterns as they appear in the source image.' },
  2: { name: 'Reflected', description: 'Includes the original patterns and their horizontal reflections.' },
  3: { name: 'Rotated 90°', description: 'Includes original, reflected, and a 90-degree rotation.' },
  4: { name: 'Rotated & Reflected', description: 'Includes 0° and 90° orientations plus their reflections.' },
  5: { name: 'Rotated 180°', description: 'Includes orientations up to 180°.' },
  6: { name: 'High Symmetry', description: 'Original plus five variations of rotations and flips.' },
  7: { name: 'Near Full', description: 'Includes seven of the eight possible D4 symmetries.' },
  8: {
    name: 'Full Dihedral (D4)',
    description: 'All 8 variations (4 rotations × 2 reflections). Ideal for top-down textures.',
  },
}

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