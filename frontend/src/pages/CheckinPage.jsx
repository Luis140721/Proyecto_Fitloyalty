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
  const lastScannedRef = useRef(null);
  const scanTimeoutRef = useRef(null);

  // IDs de checkins conocidos para detectar el "mas nuevo" cuando llega un nuevo set.
  const knownIdsRef = useRef(new Set());
  // Flash del frame: tipo + key para re-disparar la animacion en cada feedback.
  const [frameFlash, setFrameFlash] = useState(null); // {type:'success'|'warning', key:number}

  const loadRecent = async () => {
    try {
      const { data } = await api.get('/admin/checkin', { params: { limit: 20 } });
      const next = data.checkins || [];
      // Detecta si hay IDs nuevos (los trae el backend en orden desc por fecha).
      const previousIds = knownIdsRef.current;
      const newOnTop = next.length > 0 && previousIds.size > 0 && !previousIds.has(next[0].id_checkin);
      setRecent(next);
      // Marca los IDs actuales como conocidos la primera vez sin disparar flash.
      if (previousIds.size === 0) {
        next.forEach((c) => previousIds.add(c.id_checkin));
      } else if (newOnTop) {
        // No marcamos todavia: cada render el tile "nuevo" tendra anim distinta.
      }
      // Una vez pintados, consolidamos el set.
      next.forEach((c) => previousIds.add(c.id_checkin));
      return newOnTop;
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial.');
      return false;
    }
  };

  useEffect(() => { loadRecent(); const t = setInterval(() => loadRecent(), 15000); return () => clearInterval(t); }, []);

  // Inicializar escáner QR cuando se activa la cámara
  useEffect(() => {
    if (cameraEnabled) {
      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          // Usar cámara trasera y evitar modo espejo
          facingMode: 'environment',
        },
        false
      );

      scanner.render(
        (decodedText) => {
          // QR escaneado exitosamente - enviar automáticamente al backend
          const now = Date.now();
          if (lastScannedRef.current === decodedText && scanTimeoutRef.current) {
            return; // Ya escaneamos este QR recientemente
          }
          
          lastScannedRef.current = decodedText;
          setCodigo(decodedText);
          setScannerError(null);
          
          // Debounce: esperar 2 segundos antes de permitir otro escaneo
          if (scanTimeoutRef.current) {
            clearTimeout(scanTimeoutRef.current);
          }
          scanTimeoutRef.current = setTimeout(() => {
            lastScannedRef.current = null;
          }, 2000);
          
          // Enviar automáticamente el check-in
          handleCheckIn(decodedText);
        },
        (errorMessage) => {
          // Ignorar errores de escaneo continuo (normal mientras busca QR)
          // console.warn('QR scan error:', errorMessage);
        }
      );

      scannerRef.current = scanner;

      return () => {
        if (scannerRef.current) {
          scannerRef.current.clear().catch(console.error);
        }
      };
    }
  }, [cameraEnabled]);

  const toggleCamera = async () => {
    if (cameraEnabled) {
      // Desactivar cámara
      if (scannerRef.current) {
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
      setCameraEnabled(false);
      setScannerError(null);
    } else {
      // Activar cámara
      setCameraEnabled(true);
      setScannerError(null);
    }
  };

  const handleAutoCheckIn = async (qrCode) => {
    // Evitar múltiples envíos simultáneos
    if (submitting) return;
    
    const payload = { metodo: 'QR', codigo: qrCode.trim() };
    setSubmitting(true);
    try {
      const { data } = await api.post('/admin/checkin', payload);
      const fbType = data.advertencia ? 'warning' : 'success';
      setFeedback({
        type: fbType,
        msg: data.message,
        miembro: data.miembro,
        advertencia: data.advertencia,
      });
      setFrameFlash({ type: fbType, key: Date.now() });
      if (fbType === 'success') vibrate(80);
      setCodigo('');
      await loadRecent();
    } catch (err) {
      console.error('Error en check-in:', err);
      const errorMsg = err.response?.status === 404 
        ? 'Usuario no encontrado. Verifica que el QR sea correcto.'
        : err.message || 'No se pudo registrar el check-in.';
      setError(errorMsg);
      setFeedback({ type: 'error', msg: errorMsg, advertencia: true });
      setFrameFlash({ type: 'error', key: Date.now() });
    } finally {
      setSubmitting(false);
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
      const fbType = data.advertencia ? 'warning' : 'success';
      setFeedback({
        type: fbType,
        msg: data.message,
        miembro: data.miembro,
        advertencia: data.advertencia,
      });
      // Dispara flash del frame (key cambia para reiniciar la animacion).
      setFrameFlash({ type: fbType, key: Date.now() });
      // Vibra solo en success y si el navegador lo soporta.
      if (fbType === 'success') vibrate(80);
      setCodigo(''); setDocumento('');
      await loadRecent();
    } catch (err) {
      setError(err.message || 'No se pudo registrar el check-in.');
      setFeedback({ type: 'error', msg: err.message || 'Ingreso denegado', advertencia: true });
      setFrameFlash({ type: 'error', key: Date.now() });
    } finally {
      setSubmitting(false);
    }
  };

  const onScan = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(e); }
  };

  // Ripple para el boton Registrar.
  const registrarRipple = Ripple({ opacity: 0.35 });

  // Marca los IDs que ya vimos (post-primer-load). Se ejecuta en cada render
  // pero es barato: solo agrega nuevos al Set.
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
        {/* Columna izquierda: scanner + form manual */}
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
                  aria-label="Método de check-in"
                >
                  <option value="QR">Método: QR</option>
                  <option value="MANUAL">Método: Manual</option>
                  <option value="CODIGOBARRAS">Método: Código barras</option>
                </select>
              </div>
            </header>

            <div
              className={
                'checkin-frame' +
                (frameFlash?.type === 'success' ? ' checkin-frame--flash-success' : '') +
                (frameFlash?.type === 'warning' ? ' checkin-frame--flash-warning' : '')
              }
              key={frameFlash ? `frame-${frameFlash.key}` : 'frame-stable'}
              aria-hidden="true"
              style={{ 
                minHeight: cameraEnabled ? '400px' : 'auto', 
                height: cameraEnabled ? '400px' : 'auto',
                maxHeight: cameraEnabled ? '60vh' : 'auto'
              }}
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
                <div id="qr-reader" style={{ width: '100%', height: '100%', minHeight: '400px' }}></div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className={`btn ${cameraEnabled ? 'btn-danger' : 'btn-secondary'}`}
                onClick={toggleCamera}
              >
                <span className="material-symbols-outlined icon">
                  {cameraEnabled ? 'videocam_off' : 'videocam'}
                </span>
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
              <button
                type="submit"
                className="btn btn-primary ripple-host"
                onClick={registrarRipple}
                disabled={submitting}
              >
                <span className="material-symbols-outlined icon">login</span>
                {submitting ? 'Validando...' : 'Registrar'}
              </button>
            </form>

            <div style={{
              marginTop: 12,
              paddingTop: 16,
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontFamily: 'var(--font-label)',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--on-surface-variant)',
            }}>
              <span style={{ color: 'var(--primary-accent)', fontWeight: 700 }}>TIP</span>
              <span>Si el QR no se lee, usa el campo de abajo para ingresar la cédula del cliente.</span>
            </div>

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
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => { setCodigo(''); setDocumento(''); setFeedback(null); setError(''); }}
                >
                  <span className="material-symbols-outlined icon">cleaning_services</span>
                  Limpiar
                </button>
              </div>
            </div>
          </article>

          {feedback && (
            <div
              key={`fb-${frameFlash?.key || 'init'}`}
              className={`alert ${
                feedback.type === 'error' ? 'alert-error'
                : feedback.type === 'warning' ? 'alert-warning'
                : 'alert-success'
              } anim-scale-in`}
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
                    {feedback.advertencia && ' — revisar antes de dejar entrar'}
                  </small>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Columna derecha: feed de ingresos */}
        <article className="table-card" style={{ padding: 0, alignSelf: 'flex-start' }}>
          <div style={{ padding: '20px 24px 8px' }}>
            <div className="checkin-feed__head">
              <h3>Ingresos de hoy</h3>
              <span className="checkin-feed__live anim-pulse">EN VIVO</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 6 }}>
              {recent.length} ingresos en las últimas horas
            </p>
          </div>
          <div style={{ padding: '8px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recent.length === 0 && (
              <EmptyState
                icono="fitness_center"
                titulo="Aún no hay check-ins hoy"
                descripcion="Escanea el QR de un miembro o registra su entrada manual para empezar."
              />
            )}
            {recent.map((c, idx) => {
              const denied = c.advertencia || c.denegado;
              // El primer item (mas reciente) recibe slide-in-right; los demas,
              // fade-up + stagger. Esto funciona tanto al cargar la pagina
              // como cuando loadRecent() trae un set con uno nuevo arriba.
              const isNewest = idx === 0;
              const animClass = isNewest ? 'anim-slide-in-right' : `anim-fade-up anim-delay-${Math.min(idx, 8)}`;
              return (
                <div
                  className={`checkin-tile ${denied ? 'checkin-tile--denied' : ''} ${animClass}`}
                  key={c.id_checkin}
                >
                  <span className={`avatar ${denied ? 'avatar-error' : 'avatar-primary'}`}>{initialsOf(c.nombre)}</span>
                  <div className="checkin-tile__meta">
                    <strong>{c.nombre}</strong>
                    <span>{c.metodo} · {c.documento}</span>
                  </div>
                  <div className="checkin-tile__time">
                    {new Date(c.fecha_hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    <small>{denied ? 'REVISAR' : 'OK'}</small>
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