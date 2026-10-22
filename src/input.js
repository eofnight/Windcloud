// The main process decides whether input is secret before emitting any local echo.
export function executeInput({ text, secret = false, passwordPrompt = false, engine, send, echo }) {
  if (typeof text !== 'string' || text.length > 32000) throw Error('指令長度超過限制');
  const masked = !!(secret || passwordPrompt);
  if (masked) send(text);
  else {
    echo(text);
    if (text === '') send('');
    else engine.execute(text);
  }
  return { secret: masked };
}

// Retain/select normal input so the next keystroke replaces it. Clear secrets immediately.
export function prepareInput(input, secret) {
  input.focus();
  if (secret) input.value = '';
  else input.select();
}
