export function canShowAnnouncement(input: { unread: boolean; onHome: boolean; loading: boolean; overlayOpen: boolean; editing: boolean; dirtyForm: boolean; visible: boolean }) {
  return input.unread && input.onHome && !input.loading && !input.overlayOpen && !input.editing && !input.dirtyForm && input.visible
}
