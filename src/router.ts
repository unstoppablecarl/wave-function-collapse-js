import { createRouter, createWebHistory } from 'vue-router'
import OverlappingNGenerator from './components/pages/OverlappingN/OverlappingNGenerator.vue'

const routes = [
  { path: '/', component: OverlappingNGenerator },
  // { path: '/about', component: AboutView },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router