import { createRouter, createWebHistory } from 'vue-router'
import ConvChainGenerator from './components/pages/ConvChain/ConvChainGenerator.vue'
import WFCGenerator from './components/pages/WFC/WFCGenerator.vue'
import TextureSynthesisGenerator from './components/pages/TextureSynthesis/TextureSynthesisGenerator.vue'

const routes = [
  { path: '/', component: WFCGenerator },
  { path: '/conv-chain', component: ConvChainGenerator },
  { path: '/texture-synthesis', component: TextureSynthesisGenerator },

]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router