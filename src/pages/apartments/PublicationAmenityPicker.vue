<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { amenityGroups, type AmenityCode } from '@contracts/publication'
const selected = defineModel<AmenityCode[]>({ required: true })
const { t } = useI18n()
const search = ref('')
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/ё/g, 'е').trim()
const groups = computed(() => {
  const words = normalize(search.value).split(/\s+/).filter(Boolean)
  return amenityGroups.map(group => ({
    key: group.key,
    label: t(`publication.amenityGroups.${group.key}`),
    codes: group.codes.filter(code => {
      const text = normalize(`${t(`publication.amenity.${code}`)} ${t(`publication.amenityGroups.${group.key}`)} ${code.replaceAll('_', ' ')}`)
      return words.every(word => text.includes(word))
    }),
  })).filter(group => group.codes.length)
})
function toggle(code: AmenityCode, value: boolean | 'indeterminate') {
  selected.value = value === true ? [...new Set([...selected.value, code])] : selected.value.filter(item => item !== code)
}
</script>
<template>
  <fieldset class="publication-amenities">
    <legend class="publication-amenities-heading"><span>{{ t('publication.amenities') }}</span><span class="publication-amenities-count">{{ t('publication.amenitiesSelected', { count: selected.length }) }}</span></legend>
    <UInput v-model="search" type="search" icon="i-lucide-search" :placeholder="t('publication.searchAmenities')" :aria-label="t('publication.searchAmenities')" class="w-full" :ui="{ base: 'min-h-11' }" />
    <div class="publication-amenities-list">
      <section v-for="group in groups" :key="group.key" class="publication-amenities-group">
        <h3>{{ group.label }}</h3>
        <div class="publication-amenities-grid"><UCheckbox v-for="code in group.codes" :key="code" :name="code" :label="t(`publication.amenity.${code}`)" :model-value="selected.includes(code)" :ui="{ root: 'min-h-11 items-center gap-2 rounded-md px-2 hover:bg-[var(--color-surface-muted)]', container: 'min-h-11 items-center', wrapper: 'min-w-0 flex-1', label: 'flex min-h-11 items-center text-sm font-normal leading-5 cursor-pointer' }" @update:model-value="toggle(code, $event)" /></div>
      </section>
      <p v-if="!groups.length" class="publication-amenities-empty" role="status">{{ t('publication.noAmenityMatches') }}</p>
    </div>
  </fieldset>
</template>
<style scoped>
.publication-amenities { min-width:0; }
.publication-amenities-heading { display:flex; align-items:center; flex-wrap:wrap; gap:.5rem 1rem; width:100%; padding:0 0 .75rem; font-weight:500; }
.publication-amenities-count { margin-inline-start:auto; font-size:.75rem; font-weight:400; color:var(--color-muted); }
.publication-amenities-list { max-height:20rem; overflow-y:auto; overscroll-behavior:contain; margin-top:.75rem; padding-inline-end:.25rem; }
.publication-amenities-group + .publication-amenities-group { margin-top:.75rem; }
.publication-amenities-group h3 { margin:0 0 .25rem; padding-inline:.5rem; font-size:.75rem; line-height:1.25rem; font-weight:500; color:var(--color-muted); }
.publication-amenities-grid { display:grid; grid-template-columns:minmax(0,1fr); gap:0 .75rem; }
.publication-amenities-empty { padding:1rem .5rem; font-size:.875rem; color:var(--color-muted); }
@media(min-width:640px) { .publication-amenities-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(min-width:1024px) { .publication-amenities-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
</style>
