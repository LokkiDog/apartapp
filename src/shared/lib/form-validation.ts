import type { FormError, FormErrorEvent, FormInputEvents } from '@nuxt/ui'
import { computed, nextTick, ref } from 'vue'
import type { z } from 'zod'

type Translate = (key: string, params?: Record<string, unknown>) => string
type FormSchema = z.ZodType

export type FormValidationOptions = {
  pathMap?: Record<string, string>
  messages?: Record<string, string>
  validate?: (state: unknown) => FormError[]
}

function issuePath(issue: z.core.$ZodIssue, pathMap: Record<string, string>) {
  const path = issue.path.map(String).join('.')
  return pathMap[path] ?? path
}

function issueMessage(issue: z.core.$ZodIssue, t: Translate) {
  if (issue.code === 'too_small') {
    if (issue.origin === 'string') {
      if (Number(issue.minimum) <= 1) return t('validation.required')
      return t('validation.minLength', { count: issue.minimum })
    }
    if (issue.origin === 'number') return t('validation.minNumber', { value: issue.minimum })
    if (issue.origin === 'array') return t('validation.minItems', { count: issue.minimum })
  }

  if (issue.code === 'too_big') {
    if (issue.origin === 'string') return t('validation.maxLength', { count: issue.maximum })
    if (issue.origin === 'number') return t('validation.maxNumber', { value: issue.maximum })
    if (issue.origin === 'array') return t('validation.maxItems', { count: issue.maximum })
  }

  if (issue.code === 'invalid_format') {
    if (issue.format === 'email') return t('validation.email')
    if (issue.format === 'date') return t('validation.date')
    if (issue.format === 'uuid') return t('validation.selection')
    if (issue.format === 'regex') return t('validation.format')
  }

  if (issue.code === 'invalid_type') {
    return issue.input === undefined || issue.input === null || issue.input === ''
      ? t('validation.required')
      : t('validation.invalid')
  }

  if (issue.code === 'invalid_value') return t('validation.selection')
  if (issue.code === 'not_multiple_of') return t('validation.invalid')

  const customMessages: Record<string, string> = {
    'Выезд должен быть позже заезда': 'validation.checkoutAfterCheckin',
    'Собственники не должны повторяться': 'validation.uniqueOwners',
    'Расходники в автосписании не должны повторяться': 'validation.uniqueConsumables',
    'Опишите проблему': 'validation.problemDescriptionRequired'
  }
  const translationKey = customMessages[issue.message]
  return translationKey ? t(translationKey) : t('validation.invalid')
}

export function createFormValidator(schema: FormSchema, t: Translate, options: FormValidationOptions = {}) {
  return (state: unknown): FormError[] => {
    const parsed = schema.safeParse(state)
    const errors = parsed.success
      ? []
      : parsed.error.issues.map((issue) => {
          const name = issuePath(issue, options.pathMap ?? {})
          return { name, message: options.messages?.[name] ?? issueMessage(issue, t) }
        })
    const extraErrors = options.validate?.(state) ?? []
    const unique = new Map<string, FormError>()
    for (const error of [...errors, ...extraErrors]) {
      const key = `${error.name ?? ''}:${error.message}`
      if (!unique.has(key)) unique.set(key, error)
    }
    return [...unique.values()]
  }
}

function firstFocusableElement(error: FormErrorEvent['errors'][number]) {
  if (!import.meta.client || !error.id) return null
  const target = document.getElementById(error.id)
  if (!target) return null
  if (target.matches('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')) return target as HTMLElement
  return target.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
}

export function useSubmitFormValidation() {
  const attempted = ref(false)
  const formKey = ref(0)
  const validateOn = computed<FormInputEvents[]>(() => attempted.value ? ['input', 'blur', 'change'] : [])

  function reset() {
    attempted.value = false
    formKey.value += 1
  }

  async function onError(event: FormErrorEvent) {
    attempted.value = true
    await nextTick()
    const target = event.errors.map(firstFocusableElement).find(Boolean)
    if (!target) return
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return { attempted, formKey, validateOn, reset, onError }
}
