<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useCurrentUser } from '#fsd/shared/auth'
import { PageHeader } from '#fsd/shared/ui'
import { dashboardDesignKey, readDashboardDesign, saveDashboardDesign, type DashboardDesignPreference } from './model/dashboard-design'

const LegacyDashboard = defineAsyncComponent(() => import('./ui/LegacyDashboard.vue'))
const OperationsDashboard = defineAsyncComponent(() => import('./ui/OperationsDashboard.vue'))
const user = useCurrentUser()
const { t } = useI18n()
const administrator = computed(() => Boolean(user.value?.roles.includes('administrator')))
const mounted = ref(false)
const ready = ref(false)
const preference = ref<DashboardDesignPreference>({ version: 'new', dismissed: [] })
const storageKey = computed(() => user.value ? dashboardDesignKey(user.value.id, user.value.organizationId) : '')
const memories = new Map<string, DashboardDesignPreference>()
watch([storageKey, mounted], ([key, active]) => {
  ready.value = false
  if (!active || !key) return
  try { preference.value = memories.get(key) ?? readDashboardDesign(localStorage, key) }
  catch { preference.value = memories.get(key) ?? { version: 'new', dismissed: [] } }
  ready.value = true
}, { immediate: true, flush: 'sync' })
onMounted(() => { mounted.value = true })
const switchLabel = computed(() => t(preference.value.version === 'new' ? 'operations.legacyDesign' : 'operations.newDesign'))
const bannerVisible = computed(() => !preference.value.dismissed.includes(preference.value.version))
function persist() {
  memories.set(storageKey.value, { version: preference.value.version, dismissed: [...preference.value.dismissed] })
  try { saveDashboardDesign(localStorage, storageKey.value, preference.value) } catch { /* Access to localStorage itself may throw. */ }
}
function switchDesign() {
  preference.value.version = preference.value.version === 'new' ? 'legacy' : 'new'
  persist()
}
function dismissBanner() {
  preference.value.dismissed.push(preference.value.version)
  persist()
}
</script>

<template>
  <Teleport v-if="administrator && ready && bannerVisible" to="#app-top-banner">
    <div class="dashboard-design-banner">
      <button type="button" class="dashboard-design-banner__switch" @click="switchDesign">
        <UIcon name="i-lucide-repeat-2" class="size-4 shrink-0" />
        <span>{{ switchLabel }}</span>
      </button>
      <button type="button" class="dashboard-design-banner__close" :aria-label="t('operations.closeBanner')" @click="dismissBanner">
        <UIcon name="i-lucide-x" class="size-4" />
      </button>
    </div>
  </Teleport>
  <section class="page-wrap space-y-6">
    <template v-if="administrator && ready">
      <PageHeader :title="t('nav.home')">
        <template #actions>
          <UDropdownMenu :items="[{ label: switchLabel, icon: 'i-lucide-repeat-2', onSelect: switchDesign }]" :content="{ align: 'end' }">
            <UButton class="min-h-11 min-w-11" icon="i-lucide-ellipsis" color="neutral" variant="soft" :aria-label="t('operations.designMenu')" />
          </UDropdownMenu>
        </template>
      </PageHeader>
      <OperationsDashboard v-if="preference.version === 'new'" :key="`new:${storageKey}`" />
      <LegacyDashboard v-else :key="`legacy:${storageKey}`" />
    </template>
    <LegacyDashboard v-else-if="user && !administrator" :key="storageKey" />
    <div v-else class="space-y-4" :aria-label="t('operations.loading')" aria-busy="true"><USkeleton class="h-16 w-full rounded-2xl" /><USkeleton class="h-64 w-full rounded-2xl" /></div>
  </section>
</template>
