const webpack = require("webpack");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

module.exports = function override(config) {
  // Use the NodePolyfillPlugin to handle most Node.js polyfills
  config.plugins = [
    ...config.plugins,
    new NodePolyfillPlugin(),
    // Provide global variables
    new webpack.ProvidePlugin({
      process: "process/browser",
      Buffer: ["buffer", "Buffer"],
    }),
    // Ignore unnecessary warning messages
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/,
    }),
  ];

  // Ensure the fallback object exists
  if (!config.resolve) config.resolve = {};
  if (!config.resolve.fallback) config.resolve.fallback = {};

  // Add all Node.js core module polyfills
  config.resolve.fallback = {
    ...config.resolve.fallback,
    url: require.resolve("url/"),
    https: require.resolve("https-browserify"),
    http: require.resolve("stream-http"),
    http2: false,
    stream: require.resolve("stream-browserify"),
    crypto: require.resolve("crypto-browserify"),
    buffer: require.resolve("buffer/"),
    process: require.resolve("process/browser"),
    assert: require.resolve("assert/"),
    fs: false,
    tls: false,
    net: false,
    path: false,
    zlib: false,
    util: require.resolve("util/"),
    querystring: require.resolve("querystring-es3"),
    os: require.resolve("os-browserify/browser"),
    events: require.resolve("events/"),
    child_process: false,
  };

  // Handle node: protocol imports
  config.module = config.module || {};
  config.module.rules = config.module.rules || [];
  config.module.rules.push({
    test: /\.(js|mjs|jsx|ts|tsx)$/,
    resolve: {
      fullySpecified: false,
    },
  });

  // Add alias for node: prefixed modules
  config.resolve.alias = {
    ...config.resolve.alias,
    "node:events": "events",
    "node:process": "process/browser",
    "node:util": "util",
  };

  // Fix warnings about large files
  config.performance = {
    hints: false,
    maxEntrypointSize: 512000,
    maxAssetSize: 512000,
  };

  return config;
};
