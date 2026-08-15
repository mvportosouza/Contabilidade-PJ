import dynamic from 'next/dynamic'

// ssr: false → não renderiza no servidor (necessário por usar localStorage)
const App = dynamic(() => import('../components/App'), { ssr: false })

export default function Home() {
  return <App />
}
