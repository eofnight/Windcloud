export const COLOR_FIELDS = [
  ['foreground','一般文字／NOR'],['background','終端背景'],
  ['black','黑'],['red','紅'],['green','綠'],['yellow','黃／棕'],
  ['blue','藍'],['magenta','紫'],['cyan','青'],['white','白／灰'],
  ['brightBlack','亮黑／深灰'],['brightRed','亮紅'],['brightGreen','亮綠'],['brightYellow','亮黃'],
  ['brightBlue','亮藍'],['brightMagenta','亮紫'],['brightCyan','亮青'],['brightWhite','亮白'],
  ['command','指令回顯'],['info','本機提示'],['error','本機錯誤']
];
export const CLASSIC_COLORS = Object.freeze({
  foreground:'#aaaaaa',background:'#000000',black:'#000000',red:'#aa0000',green:'#00aa00',yellow:'#aa5500',
  blue:'#0000aa',magenta:'#aa00aa',cyan:'#00aaaa',white:'#aaaaaa',brightBlack:'#555555',brightRed:'#ff5555',
  brightGreen:'#55ff55',brightYellow:'#ffff55',brightBlue:'#5555ff',brightMagenta:'#ff55ff',brightCyan:'#55ffff',brightWhite:'#ffffff',
  command:'#c4a36b',info:'#aaaaaa',error:'#ff5555'
});
export const SOFT_COLORS = Object.freeze({
  ...CLASSIC_COLORS,foreground:'#dce3e4',background:'#101519',black:'#222a30',red:'#cd6169',green:'#7fb38b',yellow:'#d2b474',
  blue:'#729aca',magenta:'#b58fbd',cyan:'#77baba',white:'#c5cdce',brightBlack:'#70838c',brightRed:'#ed8490',
  brightGreen:'#a2d3aa',brightYellow:'#f2dba0',brightBlue:'#a1c3ec',brightMagenta:'#d7b1df',brightCyan:'#9bdddc',brightWhite:'#f4f6f6'
});
export function normalizePreferences(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('顯示設定格式錯誤');
  const colors = { ...CLASSIC_COLORS };
  if (value.colors !== undefined && (!value.colors || typeof value.colors !== 'object' || Array.isArray(value.colors))) throw Error('色彩設定格式錯誤');
  for (const [key] of COLOR_FIELDS) {
    const color = value.colors?.[key];
    if (color !== undefined) {
      if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw Error('顏色必須為六位十六進位色碼：' + key);
      colors[key] = color.toLowerCase();
    }
  }
  for (const key of ['showConnectionInfo','showTimers','boldAsBright']) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw Error('顯示選項必須為開啟或關閉');
  for (const [key,min,max] of [['fontSize',11,24],['columns',80,240]]) if (value[key] !== undefined && (!Number.isInteger(value[key]) || value[key] < min || value[key] > max)) throw Error('顯示數值超出範圍：' + key);
  return { fontSize: value.fontSize ?? 14, columns: value.columns ?? 120, showConnectionInfo: value.showConnectionInfo ?? false, showTimers: value.showTimers ?? false, boldAsBright: value.boldAsBright ?? true, colors };
}
export function terminalTheme(preferences) {
  const theme = {};
  for (const [key] of COLOR_FIELDS.slice(0,18)) theme[key] = preferences.colors[key];
  theme.cursor = preferences.colors.foreground;
  return theme;
}
export function migrateSettings(data) {
  const windcloud = ['125.228.186.144','windcloud.muds.me'].includes(data.host?.toLowerCase());
  return { ...data, version: 2,
    transport: (data.version ?? 1) < 2 && windcloud ? 'websocket' : (data.transport ?? (windcloud ? 'websocket' : 'telnet')),
    preferences: normalizePreferences(data.preferences)
  };
}
