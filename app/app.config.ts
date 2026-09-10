export default defineAppConfig({
  ui: {
    colors: { primary: 'emerald', neutral: 'slate' },
    button: { slots: { base: 'min-h-11 rounded-[10px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96]' } },
    input: { slots: { root: 'w-full', base: 'min-h-11 rounded-[10px] bg-white text-[var(--color-ink)] ring-[var(--color-line)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]' } },
    select: { slots: { base: 'w-full h-11 min-h-11 rounded-[10px] bg-white text-[var(--color-ink)] ring-[var(--color-line)] hover:bg-white focus:bg-white focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]' } },
    selectMenu: { slots: {
      base: 'w-full h-11 min-h-11 rounded-[10px] bg-white text-[var(--color-ink)] ring-[var(--color-line)] hover:bg-white focus:bg-white focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
      input: 'mx-2 mt-2 mb-1 self-stretch rounded-[9px] bg-white text-sm text-[var(--color-ink)] ring-[var(--color-line)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
      content: 'rounded-[14px] bg-white p-1.5 shadow-[var(--shadow-overlay)] ring-1 ring-[var(--color-line)]',
      group: 'p-0.5',
      label: 'px-3 py-2 text-xs font-semibold text-[var(--color-muted)]',
      item: 'min-h-10 rounded-[9px] px-3 py-2 text-sm font-medium leading-5 text-[var(--color-ink)]',
      itemLabel: 'truncate text-sm font-medium leading-5',
      empty: 'px-3 py-4 text-sm leading-5 text-[var(--color-muted)]'
    } },
    checkbox: { slots: {
      root: 'flex min-h-11 items-center gap-3 rounded-[10px] px-2 py-1.5 text-[var(--color-ink)] transition-colors hover:bg-[var(--color-primary-soft)]',
      container: 'flex items-center',
      base: 'size-4 rounded-[5px] bg-white ring-1 ring-inset ring-[var(--color-line)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] data-[state=checked]:bg-[var(--color-primary)] data-[state=checked]:text-white',
      indicator: 'grid place-items-center',
      icon: 'size-3.5 stroke-[3]',
      wrapper: 'min-w-0',
      label: 'cursor-pointer text-sm font-medium leading-5'
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
    textarea: { slots: { base: 'block w-full min-h-28 resize-y rounded-[12px] bg-white px-3.5 py-3 text-[0.9375rem] leading-6 text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)] ring-0 placeholder:text-[var(--color-muted)]/70 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-primary),0_0_0_3px_var(--color-primary-soft)] disabled:cursor-not-allowed disabled:bg-[#f5f8f6] disabled:text-[var(--color-muted)] transition-[background-color,box-shadow,color] duration-150' } },
    card: { slots: { root: 'rounded-2xl bg-white shadow-[var(--shadow-surface)] ring-0', header: 'px-5 py-4 sm:px-6', body: 'px-5 py-5 sm:px-6', footer: 'px-5 py-4 sm:px-6' } },
    modal: { slots: { content: 'rounded-2xl shadow-[var(--shadow-overlay)]', header: 'px-5 pt-5', body: 'px-5 pb-5' } },
    slideover: { slots: { content: 'overflow-hidden', body: 'min-h-0 overscroll-contain' } }
  }
})
