import { createApp } from 'vue'
import './style.css'

console.log("[Front] main.ts entry reached", performance.now());

import App from './App.vue'

createApp(App).mount('#app')
