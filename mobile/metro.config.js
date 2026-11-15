// Metro: ortak çekirdek paketi (../packages/cita-core) mobil derlemeye dahil edilir.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const corePath = path.resolve(projectRoot, "../packages/cita-core");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [corePath];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "@cita/core": corePath,
};
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
// Yalnızca uygulamanın kendi `expo export` çıktısını (mobile/dist) izleme dışı bırak;
// node_modules içindeki paketlerin dist/ klasörlerine dokunma.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = [new RegExp(`^${escape(path.resolve(projectRoot, "dist"))}/.*`)];

module.exports = config;
