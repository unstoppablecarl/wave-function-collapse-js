<script setup lang="ts">
import Generator from './components/Generator.vue'
import TweakPane from './components/TweakPane.vue'
</script>
<template>
  <TweakPane/>
  <div class="container">
    <h3 class="mt-2">Wave Function Collapse JS</h3>
    <Generator />
  </div>
  <p class="footer">
    <a href="https://github.com/unstoppablecarl/wave-function-collapse-js">https://github.com/unstoppablecarl/wave-function-collapse-js</a>
  </p>
</template>
<style>
.footer {
  margin: 1rem;
  text-align: center;
}
</style>
