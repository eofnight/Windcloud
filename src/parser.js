// zMUD separators are inactive inside grouped arguments and quoted text.
export function splitCommands(source) {
  const commands = [];
  let start = 0, quote = '', stack = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '~') { i++; continue; }
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{' || c === '[') stack.push(c);
    if (c === '}' || c === ']') {
      if (stack.pop() !== (c === '}' ? '{' : '[')) throw Error('括號不成對');
    }
    if ((c === ';' || c === '\n') && !stack.length) {
      if (source.slice(start, i).trim()) commands.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (quote || stack.length) throw Error('引號或括號未關閉');
  if (source.slice(start).trim()) commands.push(source.slice(start).trim());
  return commands;
}

export function argumentsOf(source) {
  const args = [];
  let i = 0;
  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i])) i++;
    if (i === source.length) break;
    const start = i, open = source[i];
    if (open === '{' || open === '(' || open === '"' || open === "'") {
      const close = open === '{' ? '}' : open === '(' ? ')' : open;
      let depth = 1;
      const inner = ++i;
      while (i < source.length) {
        if (source[i] === '~') { i += 2; continue; }
        if ((open === '{' || open === '(') && source[i] === open) depth++;
        if (source[i] === close) { depth--; if (depth === 0) break; }
        i++;
      }
      if (depth !== 0) throw Error('引號或括號未關閉');
      args.push({ value: source.slice(inner, i), quoted: open === '"' || open === "'", start, end: ++i });
    } else {
      while (i < source.length && !/\s/.test(source[i])) i++;
      args.push({ value: source.slice(start, i), quoted: false, start, end: i });
    }
  }
  return args;
}

export function expand(source, variables, params = [], { parameters = true } = {}) {
  let quote = '';
  return source.replace(/~.|['"]|@@|%%|@\{([\w]+)\}|@([\w]+)|%(-?\d{1,2})/g,
    (token, braced, name, number) => {
      if (token[0] === '~') return token;
      if (token === '"' || token === "'") {
        if (!quote) quote = token; else if (quote === token) quote = '';
        return token;
      }
      if (quote) return token;
      if (token === '@@') return '@';
      if (token === '%%') return '%';
      if (number !== undefined) {
        if (!parameters || !params.length) return token;
        const n = Number(number);
        return n < 0 ? params.slice(-n - 1).join(' ') : (params[n - 1] ?? '');
      }
      const key = braced || name;
      return Object.hasOwn(variables, key) ? variables[key] : token;
    });
}
