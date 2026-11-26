// Null while the decision register is unreadable or unavailable (no PO questions tab);
// otherwise the number of open questions, which the tab shows as its badge.
export const openCount = (state) => (state && state.available !== false ? (state.decisions ?? []).length : null)
