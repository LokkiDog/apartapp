export default defineAppConfig({
  ui: {
    colors: { primary: 'emerald', neutral: 'slate' },
    button: { slots: { base: 'min-h-11 rounded-[10px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96]' } },
    input: { slots: { root: 'w-full', base: 'min-h-11 rounded-[10px] bg-white text-[var(--color-ink)] ring-[var(--color-line)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]' } },
    select: { slots: { base: 'w-full h-11 min-h-11 rounded-[10px] bg-white text-[var(--color-ink)] ring-[var(--color-line)] hover:bg-white focus:bg-white focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]' } },
    selectMenu: { slots: {
      base: 'w-full h-11 min-h-11 rounded-[10px] bg-white text-[var(--color-ink)] ring-[var(--color-line)] hover:bg-white focus:bg-white focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
      input: 'h-11 min-h-11 rounded-none border-0 border-b border-[var(--color-line)] bg-white px-3 text-[var(--color-ink)] focus-visible:ring-0',
      content: 'rounded-[10px] bg-white shadow-[var(--shadow-overlay)] ring-1 ring-[var(--color-line)]',
      group: 'p-1',
      label: 'px-3 py-2 text-xs font-semibold text-[var(--color-muted)]',
      item: 'min-h-10 rounded-[8px] px-3 py-2 text-sm',
      empty: 'px-3 py-4 text-sm text-[var(--color-muted)]'
    } },
    calendar: { slots: {
      root: 'rounded-[14px] bg-white p-1',
      header: 'mb-1 flex items-center justify-between gap-1',
      heading: 'min-w-0 flex-1 text-center',
      headingLabel: 'rounded-[8px] px-2 py-1.5 font-semibold text-[var(--color-ink)]',
      body: 'space-y-3 pt-2',
      grid: 'space-y-1',
      gridWeekDaysRow: 'mb-1 grid grid-cols-7',
      headCell: 'rounded-[8px] text-[var(--color-muted)]',
      cellTrigger: 'm-0.5 size-9 rounded-[10px] text-sm transition-colors data-selected:bg-[var(--color-primary)] data-selected:text-white data-today:not-data-selected:text-[var(--color-primary)] hover:not-data-selected:bg-[var(--color-primary-soft)]'
    } },
    textarea: { slots: { base: 'rounded-[10px] bg-white text-[var(--color-ink)] ring-[var(--color-line)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]' } },
    card: { slots: { root: 'rounded-2xl bg-white shadow-[var(--shadow-surface)] ring-0', header: 'px-5 py-4 sm:px-6', body: 'px-5 py-5 sm:px-6', footer: 'px-5 py-4 sm:px-6' } },
    modal: { slots: { content: 'rounded-2xl shadow-[var(--shadow-overlay)]', header: 'px-5 pt-5', body: 'px-5 pb-5' } }
  }
})
