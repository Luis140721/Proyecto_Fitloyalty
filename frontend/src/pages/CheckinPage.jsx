import { useEffect, useMemo, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { api } from '../api';
import EmptyState from '../components/EmptyState';
import PageTransition from '../components/PageTransition';
import Ripple from '../components/Ripple';

const COP = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

// Vibration API helper — silencioso si no esta disponible.
function vibrate(pattern) {
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(pattern); } catch (_) { /* noop */ }
}

function initialsOf(name) {
  return (name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function CheckinPage() {
  const [codigo, setCodigo] = useState('');
  const [documento, setDocumento] = useState('');
  const [metodo, setMetodo] = useState('QR');
  const [recent, setRecent] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [scannerError, setScannerError] = useState(null);
  const scannerRef = useRef(null);

  const ultimoCodigoRef = useRef(null);   // ultimo QR aceptado
  const ultimoScanRef = useRef(0);        // ultima vez que se vio ese QR
  const enviandoRef = useRef(false);      // hay un POST en vuelo
  const limpiarFeedbackRef = useRef(null);

  const ESPERA_MISMO_QR_MS = 4000;
  const LIMPIAR_FEEDBACK_MS = 5000;

  const knownIdsRef = useRef(new Set());
  const [frameFlash, setFrameFlash] = useState(null); 

  const loadRecent = async () => {
    try {
      const { data } = await api.get('/admin/checkin', { params: { limit: 20 } });
      const next = data.checkins || [];
      const previousIds = knownIdsRef.current;
      const newOnTop = next.length > 0 && previousIds.size > 0 && !previousIds.has(next[0].id_checkin);
      setRecent(next);
      if (previousIds.size === 0) {
        next.forEach((c) => previousIds.add(c.id_checkin));
      }
      next.forEach((c) => previousIds.add(c.id_checkin));
      return newOnTop;
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial.');
      return false;
    }
  };

  useEffect(() => { loadRecent(); const t = setInterval(() => loadRecent(), 15000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (cameraEnabled) {
      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0, facingMode: 'environment' },
        false
      );

      scanner.render(
        (decodedText) => {
          const ahora = Date.now();
          const mismoCodigo = ultimoCodigoRef.current === decodedText;
          const enFrio = ahora - ultimoScanRef.current < ESPERA_MISMO_QR_MS;

          if (mismoCodigo && enFrio) {
            ultimoScanRef.current = ahora; 
            return;
          }
          if (enviandoRef.current) return; 

          ultimoCodigoRef.current = decodedText;
          ultimoScanRef.current = ahora;
          setScannerError(null);
          handleAutoCheckIn(decodedText);
        },
        () => {}
      );

      scannerRef.current = scanner;

      return () => {
        if (limpiarFeedbackRef.current) clearTimeout(limpiarFeedbackRef.current);
        if (scannerRef.current) scannerRef.current.clear().catch(console.error);
      };
    }
  }, [cameraEnabled]);

  const toggleCamera = async () => {
    if (cameraEnabled) {
      if (scannerRef.current) {
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
      setCameraEnabled(false);
    } else {
      setCameraEnabled(true);
    }
    setScannerError(null);
  };

  const prepararSiguiente = () => {
    if (limpiarFeedbackRef.current) clearTimeout(limpiarFeedbackRef.current);
    limpiarFeedbackRef.current = setTimeout(() => {
      setFeedback(null);
      setFrameFlash(null);
      setError('');
    }, LIMPIAR_FEEDBACK_MS);
  };

  const handleAutoCheckIn = async (qrCode) => {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setSubmitting(true);
    setError('');

    try {
      const { data } = await api.post('/admin/checkin', { metodo: 'QR', codigo: qrCode.trim() });

      // --- INICIO BLOQUEO DE ACCESO FRONTEND ---
      const estadoMiembro = data.miembro?.estado ? String(data.miembro.estado).toUpperCase() : '';
      if (estadoMiembro === 'VENCIDO' || estadoMiembro === 'INACTIVO') {
        const errorMsg = 'Acceso denegado: Membresía vencida';
        setError(errorMsg);
        setFeedback({ type: 'error', msg: errorMsg, advertencia: true, miembro: data.miembro });
        setFrameFlash({ type: 'error', key: Date.now() });
        vibrate([200, 100, 200]); // Patrón de vibración de error para el celular
        ultimoCodigoRef.current = null;
        setCodigo('');
        await loadRecent();
        return; // Detiene el flujo para bloquear la entrada
      }
      // --- FIN BLOQUEO ---

      const fbType = data.duplicado ? 'warning' : data.advertencia ? 'warning' : 'success';
      setFeedback({
        type: fbType,
        msg: data.message,
        miembro: data.miembro,
        advertencia: data.duplicado ? 'ya-registrado' : data.advertencia,
      });
      setFrameFlash({ type: fbType, key: Date.now() });
      if (fbType === 'success') vibrate(80);
      setCodigo('');
      await loadRecent();
    } catch (err) {
      const errorMsg = err.response?.status === 404
        ? 'Usuario no encontrado. Verifica que el QR sea correcto.'
        : err.message || 'No se pudo registrar el check-in.';
      setError(errorMsg);
      setFeedback({ type: 'error', msg: errorMsg, advertencia: true, miembro: null });
      setFrameFlash({ type: 'error', key: Date.now() });
      ultimoCodigoRef.current = null;
    } finally {
      enviandoRef.current = false;
      setSubmitting(false);
      prepararSiguiente();
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setFeedback(null);
    const payload = { metodo };
    if (codigo) payload.codigo = codigo.trim();
    else if (documento) payload.documento = documento.trim();
    else { setError('Escribe el código QR o el documento.'); return; }

    setSubmitting(true);
    try {
      const { data } = await api.post('/admin/checkin', payload);

      // --- INICIO BLOQUEO DE ACCESO FRONTEND ---
      const estadoMiembro = data.miembro?.estado ? String(data.miembro.estado).toUpperCase() : '';
      if (estadoMiembro === 'VENCIDO' || estadoMiembro === 'INACTIVO') {
        const errorMsg = 'Acceso denegado: Membresía vencida';
        setError(errorMsg);
        setFeedback({ type: 'error', msg: errorMsg, advertencia: true, miembro: data.miembro });
        setFrameFlash({ type: 'error', key: Date.now() });
        vibrate([200, 100, 200]);
        ultimoCodigoRef.current = null;
        setCodigo(''); setDocumento('');
        await loadRecent();
        return;
      }
      // --- FIN BLOQUEO ---

      const fbType = data.advertencia ? 'warning' : 'success';
      setFeedback({
        type: fbType,
        msg: data.message,
        miembro: data.miembro,
        advertencia: data.advertencia,
      });
      setFrameFlash({ type: fbType, key: Date.now() });
      if (fbType === 'success') vibrate(80);
      setCodigo(''); setDocumento('');
      await loadRecent();
    } catch (err) {
      setError(err.message || 'No se pudo registrar el check-in.');
      setFeedback({ type: 'error', msg: err.message || 'Ingreso denegado', advertencia: true });
      setFrameFlash({ type: 'error', key: Date.now() });
    } finally {
      setSubmitting(false);
      prepararSiguiente();
    }
  };

  const onScan = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(e); }
  };

  const registrarRipple = Ripple({ opacity: 0.35 });

  const seenIds = useMemo(() => {
    const set = new Set();
    recent.forEach((c) => set.add(c.id_checkin));
    return set;
  }, [recent]);

  return (
    <PageTransition>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-head__title">Check-in</h1>
          <p className="admin-page-head__lead">
            Escanea el QR o digita el documento. Si está al día, dejamos entrar; si no, mostramos la advertencia.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={loadRecent}>
            <span className="material-symbols-outlined icon">refresh</span>
            Actualizar
          </button>
        </div>
      </header>

      {error && (
        <div className="alert alert-error anim-scale-in" role="alert" style={{ marginBottom: 24 }}>
          <span className="material-symbols-outlined icon">error</span>
          <span>{error}</span>
        </div>
      )}

      <section className="checkin-shell">
        <div>
          <article className="checkin-scanner">
            <header className="checkin-scanner__head">
              <div>
                <h2>Escáner de acceso</h2>
                <p>Apunta el lector al QR del miembro o pega el código abajo.</p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value)}
                  className="field-input"
                  style={{ width: 160, padding: '8px 12px', fontSize: 13 }}
                >
                  <option value="QR">Método: QR</option>
                  <option value="MANUAL">Método: Manual</option>
                  <option value="CODIGOBARRAS">Método: Código barras</option>
                </select>
              </div>
            </header>

            <div
              className="checkin-frame"
              style={{ minHeight: cameraEnabled ? '400px' : 'auto', height: cameraEnabled ? '400px' : 'auto', maxHeight: cameraEnabled ? '60vh' : 'auto' }}
            >
              {!cameraEnabled ? (
                <>
                  <i className="left" /><i className="right" />
                  <span className="checkin-frame__scan" />
                  <div className="checkin-frame__qr">
                    <span className="material-symbols-outlined anim-spin-slow">qr_code_2</span>
                  </div>
                </>
              ) : (
                <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                  <div id="qr-reader" style={{ width: '100%', maxWidth: '400px', margin: '0 auto', overflow: 'hidden', borderRadius: '8px' }}></div>
                </div>
              )}

              {frameFlash && (
                <span
                  key={frameFlash.key}
                  className={`checkin-destello checkin-destello--${frameFlash.type}`}
                  aria-hidden="true"
                />
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className={`btn ${cameraEnabled ? 'btn-danger' : 'btn-secondary'}`}
                onClick={toggleCamera}
              >
                <span className="material-symbols-outlined icon">{cameraEnabled ? 'videocam_off' : 'videocam'}</span>
                {cameraEnabled ? 'Desactivar cámara' : 'Activar cámara'}
              </button>
            </div>

            {scannerError && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>
                <span className="material-symbols-outlined icon">error</span>
                <span>{scannerError}</span>
              </div>
            )}

            <form className="checkin-manual" onSubmit={submit} noValidate>
              <input
                className="field-input"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={onScan}
                placeholder="Escanea o pega el código QR aquí"
                autoFocus
              />
              <button type="submit" className="btn btn-primary ripple-host" onClick={registrarRipple} disabled={submitting}>
                <span className="material-symbols-outlined icon">login</span>
                {submitting ? 'Validando...' : 'Registrar'}
              </button>
            </form>

            <div className="auth-form-row" style={{ marginTop: 18 }}>
              <label className="field">
                <span className="field-label">O por documento</span>
                <input
                  className="field-input"
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  placeholder="79123456"
                  inputMode="numeric"
                />
              </label>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-block" onClick={() => { setCodigo(''); setDocumento(''); setFeedback(null); setError(''); }}>
                  <span className="material-symbols-outlined icon">cleaning_services</span>
                  Limpiar
                </button>
              </div>
            </div>
          </article>

          {feedback && (
            <div
              key={`fb-${frameFlash?.key || 'init'}`}
              className={`alert ${feedback.type === 'error' ? 'alert-error' : feedback.type === 'warning' ? 'alert-warning' : 'alert-success'} anim-scale-in`}
              role="status"
              style={{ marginTop: 18 }}
            >
              <span className="material-symbols-outlined icon">
                {feedback.type === 'error' ? 'block' : feedback.type === 'warning' ? 'warning' : 'check_circle'}
              </span>
              <span style={{ lineHeight: 1.5 }}>
                <strong style={{ display: 'block' }}>{feedback.msg}</strong>
                {feedback.miembro?.nombre && (
                  <small style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                    {feedback.miembro.nombre} ({feedback.miembro.documento})
                  </small>
                )}
              </span>
            </div>
          )}
        </div>

        <article className="table-card" style={{ padding: 0, alignSelf: 'flex-start' }}>
          <div style={{ padding: '20px 24px 8px' }}>
            <div className="checkin-feed__head">
              <h3>Ingresos de hoy</h3>
              <span className="checkin-feed__live anim-pulse">EN VIVO</span>
            </div>
          </div>
          <div style={{ padding: '8px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recent.map((c, idx) => {
              const denied = c.advertencia || c.denegado;
              return (
                <div className={`checkin-tile ${denied ? 'checkin-tile--denied' : ''}`} key={c.id_checkin}>
                  <span className={`avatar ${denied ? 'avatar-error' : 'avatar-primary'}`}>{initialsOf(c.nombre)}</span>
                  <div className="checkin-tile__meta">
                    <strong>{c.nombre}</strong>
                    <span>{c.metodo} · {c.documento}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>
    </PageTransition>
  );
}