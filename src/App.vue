<script setup lang="ts">
import Generator from './components/Generator.vue'
</script>
<template>
    <h1>Wave Function Collapse JS</h1>
  <div class="container">
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
h1 {
  font-size: 1rem;
  background: rgba(255,255,255,0.05);
  padding: 0.5rem;
  padding-inline: var(--container-pad);
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
</style>
