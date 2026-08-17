export default function LoadingScreen({ message = 'Carregando seus dados…' }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F2F0ED', display: 'grid', placeItems: 'center', fontFamily: 'Georgia,serif' }}>
      <div style={{ textAlign: 'center', color: '#0F1E35' }}>
        <div style={{ width: 58, height: 58, borderRadius: 18, margin: '0 auto 16px', background: '#0F1E35', color: '#C8A96E', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20, boxShadow: '0 10px 30px rgba(15,30,53,.18)' }}>PJ</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{message}</div>
        <div style={{ fontSize: 11, color: '#8B929C', marginTop: 6 }}>Sincronizando com segurança</div>
      </div>
    </div>
  );
}
