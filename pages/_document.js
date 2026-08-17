import Document, {
  Html,
  Head,
  Main,
  NextScript,
} from 'next/document'

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="pt-BR">
        <Head>
          <meta
            name="theme-color"
            content="#0F1E35"
          />

          <meta
            name="application-name"
            content="Finanças MVPS"
          />

          <meta
            name="apple-mobile-web-app-capable"
            content="yes"
          />

          <meta
            name="apple-mobile-web-app-status-bar-style"
            content="default"
          />

          <meta
            name="apple-mobile-web-app-title"
            content="Finanças MVPS"
          />

          <meta
            name="mobile-web-app-capable"
            content="yes"
          />

          <link
            rel="manifest"
            href="/manifest.json"
          />

          <link
            rel="apple-touch-icon"
            href="/icon-192.png"
          />

          <link
            rel="icon"
            href="/icon-192.png"
          />
        </Head>

        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}