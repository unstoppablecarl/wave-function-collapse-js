<script setup lang="ts">
</script>
<template>
  <div class="nav">
    <h1>Wave Function Collapse JS</h1>
    <RouterLink to="/" class="link">Overlapping N</RouterLink>
    <RouterLink to="/conv-chain" class="link">Conv Chain</RouterLink>

  </div>
  <div class="container">
    <RouterView />
  </div>
  <p class="footer">
    <a href="https://github.com/unstoppablecarl/wave-function-collapse-js">https://github.com/unstoppablecarl/wave-function-collapse-js</a>
  </p>
</template>
<style lang="scss">
.nav {
  background: rgba(255, 255, 255, 0.05);
  padding-inline: var(--container-pad);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 1rem;

  h1 {
    font-size: 1rem;
    display: inline-block;
    margin-bottom: 0;
    margin-inline-end: 2rem;
    padding: 1rem;

  }

  .link {
    text-decoration: none;
    padding: 1rem;
  }

  .router-link-active {
    background: rgba(255,255,255,0.05);
  }
}

.footer {
  margin: 1rem;
  text-align: center;
}

</style>
