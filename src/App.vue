<template>
    <Toast />
    <Header />
    <RouterView />
</template>
<script setup lang="ts">
import { RouterView } from 'vue-router'
import Header from './components/layout/Header.vue'
</script>
<style scoped lang="scss"></style>
