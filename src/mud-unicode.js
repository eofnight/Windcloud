import { ZERO_WIDTH, WIDE } from './unicode-width-data.js';
function contains(ranges, codepoint) {
  let low = 0, high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1, [start, end] = ranges[middle];
    if (codepoint < start) high = middle - 1;
    else if (codepoint > end) low = middle + 1;
    else return true;
  }
  return false;
}
export const mudUnicode = {
  version: 'windcloud-cjk',
  wcwidth(codepoint) {
    if (contains(ZERO_WIDTH, codepoint)) return 0;
    return contains(WIDE, codepoint) ? 2 : 1;
  },
  charProperties(codepoint, preceding) {
    let width = this.wcwidth(codepoint);
    const previousWidth = (preceding >>> 1) & 3;
    const join = width === 0 && preceding !== 0 && previousWidth > 0;
    if (join) width = previousWidth;
    return (width << 1) | Number(join);
  }
};
export function installMudUnicode(terminal) {
  terminal.unicode.register(mudUnicode);
  terminal.unicode.activeVersion = mudUnicode.version;
}
