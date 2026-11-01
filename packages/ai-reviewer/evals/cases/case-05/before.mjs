export function settle(state, requestId, actual) {
  const previous = state.receipts[requestId];
  if (previous) return { state, receipt: previous, replayed: true };
  const receipt = { requestId, actual };
  return {
    state: {
      ...state,
      recorded: Math.max(0, state.recorded - actual),
      receipts: { ...state.receipts, [requestId]: receipt },
    },
    receipt,
    replayed: false,
  };
}
