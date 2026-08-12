/**
 * components/ErrorBoundary.jsx
 *
 * Error boundary de clase. Cualquier excepcion de React (render o lifecycle)
 * que NO haya sido capturada por un catch queda atrapada aqui. La UI nunca
 * queda en blanco: el usuario ve un mensaje claro y un boton de recarga.
 *
 * Usar UNA sola vez al nivel mas alto de la app (envolver <App />).
 */
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Capturado:', error, info);
    this.setState({ info });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary__card">
          <span className="material-symbols-outlined error-boundary__icon" aria-hidden="true">
            sentiment_dissatisfied
          </span>
          <h1>Algo se rompio en la app</h1>
          <p>
            No te preocupes, tu informacion esta a salvo. Puedes recargar la pagina
            o volver al inicio e intentar de nuevo.
          </p>
          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <pre className="error-boundary__stack">
              {String(this.state.error && this.state.error.message)}
              {'\n\n'}
              {this.state.info && this.state.info.componentStack}
            </pre>
          )}
          <div className="error-boundary__actions">
            <button type="button" className="btn-primary" onClick={this.handleReload}>
              Recargar pagina
            </button>
            <button type="button" className="btn-ghost" onClick={this.handleReset}>
              Intentar de nuevo
            </button>
          </div>
        </div>
      </div>
    );
  }
}