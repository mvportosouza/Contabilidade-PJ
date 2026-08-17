import Head from 'next/head'
import { useEffect } from 'react'
import ErrorBoundary from '../components/ErrorBoundary'

export default function MyApp({ Component, pageProps }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const register = () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
          if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' })
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing
            if (!worker) return
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                worker.postMessage({ type: 'SKIP_WAITING' })
              }
            })
          })
        }).catch((error) => console.error('Falha ao registrar Service Worker:', error))
      }
      window.addEventListener('load', register)
      return () => window.removeEventListener('load', register)
    }
  }, [])

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Finanças MVPS" />
        <meta name="theme-color" content="#0F1E35" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <title>Marcus Vinícius Porto Souza LTDA</title>
        <style>{`
          * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
          html, body { margin: 0; padding: 0; background: #F2F0ED; font-family: Georgia, serif; }
          body { min-height: 100vh; }
          select option { background: #1A3055; color: white; }
          input[type="date"]::-webkit-calendar-picker-indicator { opacity: .6; }
          button, input, select, textarea { -webkit-appearance: none; }
        `}</style>
      </Head>
      <ErrorBoundary>
        <Component {...pageProps} />
      </ErrorBoundary>
    </>
  )
}
