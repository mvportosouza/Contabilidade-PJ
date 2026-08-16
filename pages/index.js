import dynamic from 'next/dynamic'

const AuthGate = dynamic(() => import('../components/AuthGate'), { ssr: false })
const App = dynamic(() => import('../components/App'), { ssr: false })

export default function Home() {
  return (
    <AuthGate>
      <App />
    </AuthGate>
  )
}
