const { execFileSync } = require('node:child_process');
const path = require('node:path');
module.exports = async context => {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  // Remove only Finder metadata that Apple forbids during signing. Keep quarantine intact.
  for (const attribute of ['com.apple.FinderInfo','com.apple.ResourceFork']) {
    execFileSync('/usr/bin/xattr', ['-r','-d',attribute,appPath], {stdio:'inherit'});
  }
};
