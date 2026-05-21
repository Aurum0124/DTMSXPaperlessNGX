import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Show only local and IPv4 network addresses (exclude VirtualBox 192.168.56.x, Docker/WSL 172.x)
function simpleUrlsPlugin() {
  const isVirtual = (url) => {
    if (url.includes('172.')) return true // Docker, WSL
    if (url.includes('192.168.56.')) return true // VirtualBox Host-Only
    return false
  }
  return {
    name: 'simple-urls',
    configureServer(server) {
      server.printUrls = () => {
        const urls = server.resolvedUrls || { local: [], network: [] }
        const local = urls.local?.[0] || 'http://localhost:5173/'
        const ipv4Urls = (urls.network || []).filter((u) => !u.includes('[') && !u.includes('::'))
        const network = ipv4Urls.find((u) => !isVirtual(u)) || ipv4Urls[0]
        console.log('\n  ➜  Local:   ' + local)
        if (network && network !== local) {
          console.log('  ➜  Network: ' + network)
        }
        console.log('')
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [simpleUrlsPlugin(), react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/thumb': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/preview': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/transfers': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/document-history': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/document-status': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/document-archive': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/archive-drawers': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/archive-cabinets': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/archive-folders': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/document-comments': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/document-endorsements': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/needs-action-badge': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/tracker': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/admin': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/employees': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/route-templates': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/document-summary': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/document-public-route-hidden': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
