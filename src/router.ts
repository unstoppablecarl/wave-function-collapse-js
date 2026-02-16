import { createRouter, createWebHistory } from 'vue-router'
import OverlappingGenerator from './components/OverlappingGenerator.vue'

const routes = [
  { path: '/', component: OverlappingGenerator },
  // { path: '/about', component: AboutView },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router