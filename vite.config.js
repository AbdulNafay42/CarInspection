import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Multi-page static site. Every top-level .html file is its own entry point.
// Static media (images, sample.pdf) lives in public/ so the URLs written in the
// markup — including the ones inside <meta> and JSON-LD, which Vite does not
// rewrite — keep working unchanged in dev and in the build output.
export default defineConfig({
  // Relative asset URLs so dist/ can be dropped in any directory of any host.
  base: './',

  root: resolve(import.meta.dirname, '.'),
  publicDir: 'public',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        bookingBasic: resolve(import.meta.dirname, 'bookingBasic.html'),
        bookingStandard: resolve(import.meta.dirname, 'bookingStandard.html'),
        bookingPremium: resolve(import.meta.dirname, 'bookingPremium.html'),
        payment: resolve(import.meta.dirname, 'payment.html'),
        paymentSuccess: resolve(import.meta.dirname, 'payment-success.html'),
        joinus: resolve(import.meta.dirname, 'joinus.html'),
      },
    },
  },

  server: {
    port: 5173,
    open: '/index.html',
  },
})
