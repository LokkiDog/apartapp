<script setup lang="ts">
import { releaseAnchor } from '#shared/config/changelog'
import { useCurrentUser } from '#fsd/shared/auth'
import { useReleaseAnnouncement } from '../model/useReleaseAnnouncement'
import { canShowAnnouncement } from '../model/announcement-policy'

const props = defineProps<{ homeHref: string; blocked?: boolean }>()
const { t } = useI18n()
const route = useRoute()
const user = useCurrentUser()
const announcements = useReleaseAnnouncement()
const imageOpen = ref(false)
watch(announcements.open, open => { if (!open) imageOpen.value = false })
const { isLoading } = useLoadingIndicator()
let timer: ReturnType<typeof setTimeout> | undefined
let observer: MutationObserver | undefined
let mounted = false
let dirtyForm = false
let checking = false
function safeToShow() {
  const active = document.activeElement
  return canShowAnnouncement({
    unread: announcements.unread.value, onHome: route.path === props.homeHref,
    loading: isLoading.value || Boolean(props.blocked),
    overlayOpen: Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')),
    editing: active instanceof HTMLElement && (active.matches('input, textarea, select') || active.isContentEditable),
    dirtyForm, visible: document.visibilityState === 'visible'
  })
}
function schedule() {
  if (!mounted || announcements.open.value || !safeToShow()) {
    if (timer) clearTimeout(timer)
    timer = undefined
    return
  }
  if (timer || checking) return
  timer = setTimeout(async () => {
    timer = undefined; checking = true
    try {
      const refreshed = await announcements.refresh()
      if (refreshed && mounted && !announcements.open.value && safeToShow()) announcements.showLatest()
    } finally { checking = false }
  }, 2000)
}
function activity(event: Event) {
  if (timer) clearTimeout(timer)
  timer = undefined
  if (event.type === 'input' && event.target instanceof Element && event.target.closest('form')) dirtyForm = true
  if (event.type === 'focusout') setTimeout(schedule, 0)
  else schedule()
}
function refresh() { void announcements.refresh().then(schedule) }
watch(() => user.value?.id, () => { announcements.reset(); if (mounted) refresh() })
watch([() => route.fullPath, isLoading, () => props.blocked, announcements.unread], () => { schedule() })
watch(() => route.fullPath, () => { dirtyForm = false; schedule() })
onMounted(() => {
  mounted = true
  refresh()
  observer = new MutationObserver(schedule)
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'aria-hidden'] })
  for (const event of ['pointerdown', 'keydown', 'input', 'focusin', 'focusout']) document.addEventListener(event, activity, true)
  window.addEventListener('focus', refresh)
  window.addEventListener('online', refresh)
  document.addEventListener('visibilitychange', schedule)
})
onBeforeUnmount(() => {
  mounted = false; if (timer) clearTimeout(timer); observer?.disconnect()
  for (const event of ['pointerdown', 'keydown', 'input', 'focusin', 'focusout']) document.removeEventListener(event, activity, true)
  window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh)
  document.removeEventListener('visibilitychange', schedule)
  announcements.open.value = false
})
function dismiss() {
  const version = announcements.displayed.value?.version
  const preview = announcements.previewMode.value
  announcements.open.value = false
  if (version && !preview) void announcements.markSeen(version)
}
async function viewAll() {
  const version = announcements.displayed.value?.version
  if (!version) return
  dismiss()
  await navigateTo(`/whats-new#${releaseAnchor(version)}`)
}
</script>

<template>
  <UModal :open="announcements.open.value" :title="t('releaseAnnouncement.title')" :description="announcements.displayed.value ? t('changelog.version', { version: announcements.displayed.value.version }) : ''" :ui="{ content: 'release-announcement-modal' }" @update:open="value => { if (!value) dismiss() }">
    <template #body>
      <div v-if="announcements.displayed.value?.announcement" class="space-y-5">
        <button type="button" class="release-announcement-image-button" :aria-label="t('releaseAnnouncement.openImage')" @click="imageOpen = true">
          <img :src="announcements.displayed.value.announcement.image" :alt="t('releaseAnnouncement.imageAlt')" class="release-announcement-cover" width="1536" height="1024" />
          <span class="release-announcement-zoom" aria-hidden="true"><UIcon name="i-lucide-expand" /></span>
        </button>
        <div class="space-y-2">
          <h3 class="text-lg font-semibold leading-6">{{ t(`changelog.titles.${announcements.displayed.value.title}`) }}</h3>
          <p class="text-pretty text-sm leading-6 text-[var(--color-muted)]">{{ t('releaseAnnouncement.description') }}</p>
        </div>
        <ul class="release-announcement-highlights">
          <li v-for="item in announcements.displayed.value.announcement.highlights" :key="item">{{ t(`releaseAnnouncement.highlights.${item}`) }}</li>
        </ul>
      </div>
    </template>
    <template #footer>
      <div class="form-actions form-actions--footer">
        <UButton color="neutral" variant="ghost" @click="dismiss">{{ t('releaseAnnouncement.dismiss') }}</UButton>
        <UButton icon="i-lucide-arrow-up-right" @click="viewAll">{{ t('releaseAnnouncement.viewAll') }}</UButton>
      </div>
    </template>
  </UModal>
  <UModal v-model:open="imageOpen" fullscreen :title="t('releaseAnnouncement.imageTitle')" :ui="{ content: 'release-image-viewer', body: 'release-image-viewer-body', close: 'release-image-viewer-close' }">
    <template #body>
      <img v-if="announcements.displayed.value?.announcement" :src="announcements.displayed.value.announcement.image" :alt="t('releaseAnnouncement.imageAlt')" class="release-image-full" width="1536" height="1024" />
    </template>
  </UModal>
</template>

<style scoped>
.release-announcement-image-button {
  position: relative;
  display: block;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  cursor: zoom-in;
  background: var(--color-canvas);
}
.release-announcement-image-button:hover .release-announcement-zoom,
.release-announcement-image-button:active .release-announcement-zoom { background: var(--color-primary-soft); }
.release-announcement-image-button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.release-announcement-zoom {
  position: absolute;
  inset-inline-end: 8px;
  bottom: 8px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: var(--shadow-surface);
}
.release-image-full { display: block; width: 100%; height: 100%; object-fit: contain; }
:global(.release-image-viewer) { border-radius: 0; }
:global(.release-image-viewer-body) { flex: 1; min-height: 0; overflow: auto; background: var(--color-canvas); }
:global(.release-image-viewer-close) { min-width: 44px; min-height: 44px; }
.release-announcement-cover {
  display: block;
  width: 100%;
  height: auto;
  object-position: top;
  border-radius: 12px;
  outline-color: var(--color-line);
}
.release-announcement-highlights {
  display: grid;
  gap: 0.75rem;
  padding-inline-start: 1.25rem;
  list-style: disc;
  font-size: 0.875rem;
  line-height: 1.5;
}
.release-announcement-highlights li::marker { color: var(--color-primary); }
</style>
