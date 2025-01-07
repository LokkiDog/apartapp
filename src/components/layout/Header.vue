<template>
    <header>
        <Menubar :model="items" class="md:w-fit md:mx-auto border-none" breakpoint="768px" />
    </header>
</template>
<script setup lang="ts">
import { ref } from 'vue'

const items = ref([
    {
        icon: 'pi pi-home',
        label: 'Главная',
    },
])
</script>
<style scoped lang="scss"></style>
