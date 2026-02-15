import { createPinia } from 'pinia'
import { createPiniaSimplePersist } from 'pinia-simple-persist'

import './style/oat.css'
import './style/main.scss'
import { createApp } from 'vue'

import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

pinia.use(createPiniaSimplePersist())

app.use(pinia)
app.mount('#app')
