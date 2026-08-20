import AuthGate from '../components/AuthGate'
import App from '../components/App'

export default function Home() {
  return (
    <AuthGate>
      <App />
    </AuthGate>
  )
}
