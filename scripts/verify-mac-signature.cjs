const { execFileSync } = require('node:child_process');
const path = require('node:path');
function verify(appPath) {
  if (process.platform !== 'darwin') throw Error('macOS is required to verify Apple code signatures');
  execFileSync('/usr/bin/codesign', ['--verify','--deep','--strict','--verbose=2',appPath], {stdio:'inherit'});
  console.log('Verified macOS bundle signature:', appPath);
}
module.exports = async context => {
  if (context.electronPlatformName === 'darwin') verify(path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app'));
};
module.exports.verify = verify;
if (require.main === module) {
  if (!process.argv[2]) throw Error('Usage: node scripts/verify-mac-signature.cjs /path/to/App.app');
  verify(path.resolve(process.argv[2]));
}
