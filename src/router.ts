import { createRouter, createWebHistory } from 'vue-router'
import ConvChainGenerator from './components/pages/ConvChain/ConvChainGenerator.vue'
import OverlappingNGenerator from './components/pages/OverlappingN/OverlappingNGenerator.vue'

const routes = [
  { path: '/', component: OverlappingNGenerator },
  { path: '/conv-chain', component: ConvChainGenerator },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router