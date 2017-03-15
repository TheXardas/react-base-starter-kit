import webpack from 'webpack';
import webpackDevMiddleware from 'webpack-dev-middleware';
import webpackHotMiddleware from 'webpack-hot-middleware';
import WriteFilePlugin from 'write-file-webpack-plugin';
import run from './run';
import express from 'express';
import proxy from 'http-proxy-middleware';
import webpackConfig from './webpack.config';
import clean from './clean';
import copy from './copy';
import runServer from './runServer';

const isDebug = !process.argv.includes('--release');
process.argv.push('--watch');

const [clientConfig, serverConfig] = webpackConfig;

/**
 * Launches a development web server with "live reload" functionality -
 * synchronizing URLs, interactions and code changes across multiple devices.
 */
async function start() {
  await run(clean);
  await run(copy);
  await new Promise((resolve) => {
    // Save the server-side bundle files to the file system after compilation
    // https://github.com/webpack/webpack-dev-server/issues/62
    serverConfig.plugins.push(new WriteFilePlugin({ log: false }));

    // Плагин, который рестартует сервер каждый раз, когда заканчивается пересборка webpack'а.
    // завязаться на 'done' недостаточно, потому что тогда браузер обновляется раньше, чем поднимается сервер,
    // в результате запросы к api падают с ошибками.
    function RestartServerPlugin() {}
    RestartServerPlugin.prototype.apply = function apply(compiler) {
        compiler.plugin('after-emit', (compilation, callback) => {
            const serv = runServer();
            serv.then(() => callback());
        });
    };

    // Hot Module Replacement (HMR) + React Hot Reload
    if (isDebug) {
      clientConfig.entry.client = [...new Set([
        'babel-polyfill',
        'react-hot-loader/patch',
        'webpack-hot-middleware/client',
      ].concat(clientConfig.entry.client))];
      clientConfig.output.filename = clientConfig.output.filename.replace('[chunkhash', '[hash');
      clientConfig.output.chunkFilename = clientConfig.output.chunkFilename.replace('[chunkhash', '[hash');
      const { query } = clientConfig.module.rules.find(x => x.loader === 'babel-loader');
      query.plugins = ['react-hot-loader/babel'].concat(query.plugins || []);
      clientConfig.plugins.push(new webpack.HotModuleReplacementPlugin());
      clientConfig.plugins.push(new webpack.NoEmitOnErrorsPlugin());
      clientConfig.plugins.push(new RestartServerPlugin());
    }

    const bundler = webpack(webpackConfig);
    const wpMiddleware = webpackDevMiddleware(bundler, {
      // IMPORTANT: webpack middleware can't access config,
      // so we should provide publicPath by ourselves
      publicPath: clientConfig.output.publicPath,

      // Pretty colored output
      stats: clientConfig.stats,

      // For other settings see
      // https://webpack.github.io/docs/webpack-dev-middleware
    });
    const hotMiddleware = webpackHotMiddleware(bundler.compilers[0]);

      let serverStarted = false;
      const handleBundleComplete = async (stats) => {
        if (serverStarted || stats.stats[1].compilation.errors.length) {
            return;
        }

        serverStarted = true;
        const app = express();
        app.all('*', wpMiddleware, hotMiddleware, proxy(`http://localhost:${3000}`));
        app.listen(3001, err => (err ? reject(err) : resolve(err)));
        console.log(`APPLICATION IS RUNNING AT THIS URL: http://localhost:${3001}`);
      };

    bundler.plugin('done', stats => handleBundleComplete(stats));
  });
}

export default start;
