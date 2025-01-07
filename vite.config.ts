import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// vue({
//     template: {
//         compilerOptions: {
//             isCustomElement: (tag) => {
//                 return tag.startsWith('Toast') // (return true)
//             },
//         },
//     },
// }),

// https://vite.dev/config/
export default defineConfig({
    plugins: [vue(), vueDevTools()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
})
