<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useStore } from '../lib/store.ts'
import SymmetryInput from './SymmetryInput.vue'

const store = useStore()
const { settings } = storeToRefs(store)
</script>

<template>
  <div class="row input-section">
    <div class="col-4">
      <fieldset class="group input-section"
                title="In the Wave Function Collapse (WFC) algorithm, N represents the pattern size (or 'kernel size'). It is the dimension of the small squares the algorithm extracts from your input image to use as its 'building blocks.'">
        <legend>N</legend>
        <input type="number" min="1" v-model="settings.N" />
      </fieldset>
    </div>
    <div class="col-4">
      <fieldset class="group input-section"
                title="Forces the bottom row of the output to match a specific pattern from the input. -1 will disable ground">
        <legend>Ground</legend>
        <input type="number" min="-1" v-model="settings.initialGround" />
      </fieldset>
    </div>

    <div class="col-4">
      <fieldset class="group input-section">
        <legend>Seed</legend>
        <input type="number" v-model="settings.seed" />
      </fieldset>
    </div>
  </div>

  <fieldset class="group input-section">
    <legend>Output Width/Height</legend>
    <input type="number" v-model="settings.width" />
    <input type="number" v-model="settings.height" />
  </fieldset>

  <div class="row input-section">
    <div class="col-4">
      <label
        data-field class="form-label"
        title="When encountering a contradiction, pixels will be cleared and filled again">
        Repair
      </label>
    </div>
    <div class="col-4">
      <fieldset class="group input-section" title="Max repairs per attempt">
        <legend>Max</legend>
        <input type="number" min="0" v-model="settings.maxRepairsPerAttempt" />
      </fieldset>
    </div>
    <div class="col-4">
      <fieldset class="group input-section" title="Pixel radius of a repair">
        <legend>Radius</legend>
        <input type="number" min="0" v-model="settings.repairRadius" />
      </fieldset>
    </div>
  </div>

  <div class="row input-section periodic">
    <div class="col-4">
      <label
        data-field
        class="form-label"
        title="The algorithm treats the input image like a seamless texture"
      >
        <input type="checkbox" v-model="settings.periodicInput" /> Periodic Input
      </label>
    </div>
    <div class="col-4">
      <label
        data-field
        class="form-label"
        title="Outputs a seamless texture"
      >
        <input type="checkbox" v-model="settings.periodicOutput" /> Periodic Output
      </label>
    </div>

    <div class="col-4">
      <fieldset class="group input-section">
        <legend>Tries</legend>
        <input type="number" v-model="settings.maxAttempts" />
      </fieldset>
    </div>
  </div>

  <div class="input-section">
    <SymmetryInput v-model="settings.symmetry" />
  </div>
</template>
<style>

</style>