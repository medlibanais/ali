// Metro: ship the 3D avatar viewer page and its model file as assets.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('bin', 'html');

module.exports = config;
