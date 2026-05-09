import { createRouter, createWebHistory } from 'vue-router'
import ConvChainGenerator from './components/pages/ConvChain/ConvChainGenerator.vue'
import OverlappingNGenerator from './components/pages/OverlappingN/OverlappingNGenerator.vue'
import TextureSynthesisGenerator from './components/pages/TextureSynthesis/TextureSynthesisGenerator.vue'

const routes = [
  { path: '/', component: OverlappingNGenerator },
  { path: '/conv-chain', component: ConvChainGenerator },
  { path: '/texture-synthesis', component: TextureSynthesisGenerator },

]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router