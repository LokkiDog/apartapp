import { buildCleaningChecklist, type ChecklistItem } from '@contracts/crm'

export { buildCleaningChecklist }

export function checklistMatchesTemplate(checklist: readonly ChecklistItem[], template: readonly ChecklistItem[]) {
  return checklist.length === template.length
    && checklist.every((item, index) => item.label === template[index]?.label && item.checked === template[index]?.checked)
}

export function isUntouchedChecklistTemplate(checklist: readonly ChecklistItem[], template: readonly ChecklistItem[]) {
  return checklist.every(item => !item.checked) && checklistMatchesTemplate(checklist, template)
}

export function sofiaToday(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
