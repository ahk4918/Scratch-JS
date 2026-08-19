const path = require('path');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    // No hardcoded mode here — controlled by --mode on the CLI (see
    // package.json scripts) so dev builds skip minification.
    // NOTE: do not use an 'eval-*' devtool here. Those wrap every module in
    // eval(...) for speed, but this bundle runs as a content script under
    // the page's CSP, which blocks eval — that took the whole script down
    // silently (EvalError inside __webpack_require__, before any of our
    // own code ran). 'cheap-module-source-map' gives real source maps
    // without eval.
    devtool: isProduction ? false : 'cheap-module-source-map',
    entry: './src/js-editor-extension.js',
    output: {
      filename: 'js-editor-extension.js',
      path: path.resolve(__dirname, 'dist'),
      // Actual public path is set at runtime in src/public-path.js via
      // browser.runtime.getURL, since the moz-extension:// origin's UUID
      // isn't known until the extension is installed.
      publicPath: ''
    },
    // Persists build state to disk so unchanged modules (all of Monaco,
    // most of the time) don't get reprocessed on every rebuild. First
    // build is still slow; rebuilds after a source change should be much
    // faster.
    cache: {
      type: 'filesystem'
    },
    module: {
      rules: [
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /\.ttf$/,
          type: 'asset/resource'
        }
      ]
    },
    plugins: [
      new MonacoWebpackPlugin({
        // Only pull in what we need to keep the bundle smaller.
        languages: ['javascript', 'typescript']
      })
    ]
  };
};
