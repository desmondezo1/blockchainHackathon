import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background.js'),
        'content-script': resolve(__dirname, 'src/content-script.js'),
        inject: resolve(__dirname, 'src/inject.js'),
        approval: resolve(__dirname, 'approval.html')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js'
          if (chunkInfo.name === 'content-script') return 'content-script.js'
          if (chunkInfo.name === 'inject') return 'inject.js'
          return 'assets/[name].js'
        },
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    },
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false
  },
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      process: 'process/browser',
      util: 'util'
    }
  },
  optimizeDeps: {
    include: ['buffer', 'process']
  }
})