function refreshList({ confirmDiscard, loadLatest }) {
  if (!confirmDiscard()) return false;
  loadLatest();
  return true;
}

export function retryListRefresh({ confirmDiscard, loadLatest }) {
  return refreshList({ confirmDiscard, loadLatest });
}
