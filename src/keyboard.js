// Consume navigation only in the game area; editors retain their native shortcuts.
export function handleTerminalKey(event, { input, scrollPage, dialogOpen = false, inTerminal = false }) {
  if (event.isComposing || dialogOpen || event.altKey || event.ctrlKey || event.metaKey) return false;
  const target = event.target;
  if (event.key === 'Escape' && target === input) {
    input.value = '';
  } else if (event.key === 'PageUp' || event.key === 'PageDown') {
    if (target?.isContentEditable || (!inTerminal && target !== input && ['INPUT','TEXTAREA','SELECT'].includes(target?.tagName))) return false;
    scrollPage(event.key === 'PageUp' ? -1 : 1);
  } else return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}
