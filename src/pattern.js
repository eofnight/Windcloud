import { expand } from './parser.js';
const literal = c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Constrained zMUD pattern compiler; never treats the input as raw JavaScript regex.
export function compilePattern(pattern, variables = {}, caseSensitive = false) {
  if (pattern.length > 1024) throw Error('比對式最多 1024 字元');
  const source = expand(pattern, variables, [], { parameters: false });
  let regex = '', captures = 0, depth = 0, variableRun = false;
  const any = '[^;{}\\r\\n]*?';
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '~') {
      if (++i === source.length) throw Error('~ 後需要字元');
      regex += literal(source[i]); variableRun = false;
    } else if (c === '*') {
      if (variableRun) throw Error('請以固定文字分隔萬用字元');
      regex += any; variableRun = true;
    } else if (c === '?') { regex += '[^;{}\\r\\n]'; variableRun = false;
    } else if (c === '%' && /[dw asx]/.test(source[i + 1] || '') && source[i + 1] !== ' ') {
      if (variableRun) throw Error('請以固定文字分隔萬用字元');
      const types = { d: '[0-9]*', w: '[A-Za-z]*', a: '[A-Za-z0-9]*', s: '[ \\t]*', x: '[^\\s;{}]*?' };
      regex += types[source[++i]]; variableRun = true;
    } else if (c === '(') {
      if (depth || ++captures > 9) throw Error('目前支援最多九組、不巢狀的擷取括號');
      depth++; regex += '(';
    } else if (c === ')') {
      if (!depth) throw Error('擷取括號不成對');
      depth--; regex += ')';
    } else if (c === '^' && i === 0) { regex += '^';
    } else if (c === '$' && i === source.length - 1) { regex += '$';
    } else if (c === '{') {
      const end = source.indexOf('}', i + 1);
      if (end < 0) throw Error('選項括號未關閉');
      const body = source.slice(i + 1, end);
      if (body.startsWith('^') || /[{}()%*?[~]/.test(body)) throw Error('目前選項僅支援 {文字|文字}');
      regex += '(?:' + body.split('|').map(literal).join('|') + ')'; i = end; variableRun = false;
    } else if (c === '&' && /\d/.test(source[i + 1] || '')) {
      const width = source.slice(i + 1).match(/^\d+/)[0];
      if (+width > 4096) throw Error('固定寬度超過限制');
      regex += '[^;{}\\r\\n]{' + width + '}'; i += width.length; variableRun = false;
    } else if (c === '[' || c === ']') {
      throw Error('目前尚未支援 [range]，請改用 %d、%w 或明確文字');
    } else { regex += literal(c); variableRun = false; }
  }
  if (depth) throw Error('擷取括號未關閉');
  // $ alone is documented as matching a blank line.
  return new RegExp(source === '$' ? '^$' : regex, caseSensitive ? 'u' : 'iu');
}
