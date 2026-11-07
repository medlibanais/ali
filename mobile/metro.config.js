// Metro: ship the 3D avatar viewer page and VRM models as assets.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('vrm', 'html');

module.exports = config;
