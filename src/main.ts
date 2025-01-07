import './assets/main.css'
import 'primeicons/primeicons.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'

import Button from 'primevue/button'
import Card from 'primevue/card'
import Dialog from 'primevue/dialog'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Menubar from 'primevue/menubar'
import ProgressSpinner from 'primevue/progressspinner'
import Select from 'primevue/select'
import Toast from 'primevue/toast'
import ToastService from 'primevue/toastservice'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(PrimeVue, {
    theme: {
        preset: Aura,
        options: {
            cssLayer: {
                name: 'primevue',
                order: 'tailwind-base, primevue, tailwind-utilities',
            },
        },
    },
})
app.use(ToastService)
app.use(router)

app.component('Button', Button)
app.component('Card', Card)
app.component('Dialog', Dialog)
app.component('IconField', IconField)
app.component('InputIcon', InputIcon)
app.component('InputNumber', InputNumber)
app.component('InputText', InputText)
app.component('Menubar', Menubar)
app.component('ProgressSpinner', ProgressSpinner)
app.component('Select', Select)
app.component('Toast', Toast)

app.mount('#app')
