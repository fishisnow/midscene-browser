import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  environments: {
    web: {
      source: {
        entry: {
          index: './src/index.tsx',
          popup: './src/extension/popup.tsx',
        },
      },
      output: {
        target: 'web',
        sourceMap: true,
      }
    },
    node: {
      source: {
        entry: {
          worker: './src/background/worker.ts',
          'stop-water-flow': './src/background/stop-water-flow.ts',
          'water-flow': './src/background/water-flow.ts',
        },
      },
      output: {
        target: 'node',
        sourceMap: true,
        filename: {
          js: 'scripts/[name].js',
        },
      },
    },
  },
  dev: {
    writeToDisk: true,
  },
  output: {
    copy: [
      { from: './src/manifest.json', to: './' },
      {
        from: path.resolve(
            __dirname,
            './node_modules/@midscene/web/iife-script',
        ),
        to: 'scripts',
      },
    ],
  },
  resolve: {
    alias: {
      async_hooks: path.join(__dirname, './src/background/blank_polyfill.ts'),
      'node:async_hooks': path.join(
          __dirname,
          './src/background/blank_polyfill.ts',
      ),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  plugins: [pluginReact(), pluginNodePolyfill(), pluginLess()],
});
