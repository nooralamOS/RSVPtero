import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('UI crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 18 }}>
              Something went wrong.
            </div>
            <div style={{ color: 'var(--text-dim)', marginBottom: 18 }}>
              The app crashed while rendering. Refresh the page to retry.
            </div>
            <pre style={{
              textAlign: 'left',
              padding: 14,
              borderRadius: 12,
              overflow: 'auto',
              background: 'rgba(35, 39, 54, 0.85)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: 12,
              maxHeight: 240,
              whiteSpace: 'pre-wrap',
            }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

