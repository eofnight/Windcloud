export const RELEASES_API = 'https://api.github.com/repos/eofnight/Windcloud/releases?per_page=20';
function versionParts(value) {
  if (typeof value !== 'string') return null;
  const match = /^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);
  if (!match) return null;
  const prerelease = match[4]?.split('.');
  if (prerelease?.some(x => !x || (/^\d+$/.test(x) && x.length > 1 && x[0] === '0'))) return null;
  return { numbers: match.slice(1,4).map(Number), prerelease };
}
export function compareVersions(left, right) {
  const a = versionParts(left), b = versionParts(right);
  if (!a || !b) return null;
  for (let i=0;i<3;i++) if (a.numbers[i] !== b.numbers[i]) return Math.sign(a.numbers[i]-b.numbers[i]);
  if (!a.prerelease || !b.prerelease) return a.prerelease ? -1 : b.prerelease ? 1 : 0;
  for (let i=0;i<Math.max(a.prerelease.length,b.prerelease.length);i++) {
    const x=a.prerelease[i], y=b.prerelease[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const xn=/^\d+$/.test(x), yn=/^\d+$/.test(y);
    if (xn && yn) return BigInt(x) < BigInt(y) ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
export function selectUpdate(releases, currentVersion) {
  if (!Array.isArray(releases) || compareVersions(currentVersion,currentVersion) === null) throw Error('版本資訊格式錯誤');
  let result = null;
  for (const release of releases.slice(0,100)) {
    if (!release || release.draft || typeof release.tag_name !== 'string' || !Array.isArray(release.assets) || !release.assets.length) continue;
    const tag = release.tag_name;
    // This app is distributed as a preview, so GitHub prereleases are included.
    if (compareVersions(tag,currentVersion) !== 1 || (result && compareVersions(tag,result.version) !== 1)) continue;
    const url = 'https://github.com/eofnight/Windcloud/releases/tag/' + encodeURIComponent(tag);
    if (release.html_url !== url) continue;
    result = { version:tag, url };
  }
  return result;
}
export async function checkForUpdate(currentVersion, { fetch: request = globalThis.fetch } = {}) {
  const response = await request(RELEASES_API, {
    headers: { Accept:'application/vnd.github+json', 'User-Agent':'Windcloud-Client/'+currentVersion },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw Error('無法檢查更新（GitHub HTTP '+response.status+'）');
  return selectUpdate(await response.json(), currentVersion);
}
