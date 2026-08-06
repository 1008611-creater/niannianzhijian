'use strict';
const path=require('path'),installer=require('./install_mac_bridge_release');
const CANONICAL_BUNDLE_ROOT=installer.CANONICAL_MAC_PROJECT_ROOT+'/output/mac-employee-training/mac-bridge-release';
function assertBootstrapLocation(value){if(path.resolve(value)!==path.resolve(CANONICAL_BUNDLE_ROOT,'bridge'))throw new Error('mac_bridge_bootstrap_location_rejected');}
async function runBootstrap(options={}){if(options.testMode===true){if(process.env.NIANNIAN_MAC_BRIDGE_INSTALL_TEST_MODE!=='1'||path.resolve(options.bundleBridgeDirectory)!==path.resolve(options.bundleRoot,'bridge'))throw new Error('mac_bridge_bootstrap_location_rejected');return installer.installBridgeRelease({testMode:true,projectRoot:options.projectRoot,bundleRoot:options.bundleRoot,receiptPath:options.receiptPath});}assertBootstrapLocation(__dirname);return installer.installBridgeRelease({bootstrap:true});}
if(require.main===module){if(process.argv.length!==2)throw new Error('mac_bridge_bootstrap_does_not_accept_arguments');runBootstrap().then(v=>process.stdout.write(JSON.stringify({ok:true,status:v.status,manifest_sha256:v.manifest_sha256,secret_output:false})+'\n')).catch(e=>{process.stderr.write(String(e.message||e)+'\n');process.exitCode=1;});}
module.exports={CANONICAL_BUNDLE_ROOT,assertBootstrapLocation,runBootstrap};
