import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('pj_last_error', JSON.stringify({
          message: error?.message || 'Erro desconhecido',
          stack: error?.stack || '',
          componentStack: info?.componentStack || '',
          at: new Date().toISOString(),
        }));
      } catch (_) {}
    }
  }

  handleReload = () => window.location.reload();

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', background: '#F2F0ED', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'Georgia,serif' }}>
        <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 24, padding: 28, boxShadow: '0 12px 40px rgba(15,30,53,.12)', textAlign: 'center' }}>
          <div style={{ fontSize: 42, marginBottom: 10 }}>⚠️</div>
          <h1 style={{ color: '#0F1E35', fontSize: 22, margin: '0 0 8px' }}>Não foi possível carregar o app</h1>
          <p style={{ color: '#667085', lineHeight: 1.6, margin: '0 0 20px' }}>O aplicativo encontrou um erro inesperado. Seus dados salvos no Supabase não são apagados por esta tela.</p>
          <button onClick={this.handleReload} style={{ width: '100%', border: 0, borderRadius: 14, padding: 14, background: '#0F1E35', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>🔄 Tentar novamente</button>
          {this.state.error?.message && <details style={{ marginTop: 14, textAlign: 'left', color: '#9A3412', fontSize: 11 }}><summary>Detalhes técnicos</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre></details>}
        </div>
      </div>
    );
  }
}
