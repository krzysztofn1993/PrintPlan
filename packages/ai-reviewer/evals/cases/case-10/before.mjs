function refreshList({ conflictId, confirmDiscard, loadLatest }) {
  if (!conflictId && !confirmDiscard()) return false;
  loadLatest();
  return true;
}

export function retryListRefresh({ editingPrintId, confirmDiscard, loadLatest }) {
  return refreshList({
    conflictId: editingPrintId ?? undefined,
    confirmDiscard,
    loadLatest,
  });
}
