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

  /*
   * El callback del lector se registra UNA vez, cuando se enciende la camara,
   * y se queda con los valores de ese render para siempre. Por eso el control
   * del rebote vive en refs y no en estado: `submitting` alli dentro seria
   * eternamente false y el guardia no serviria de nada.
   */
  const ultimoCodigoRef = useRef(null);   // ultimo QR aceptado
  const ultimoScanRef = useRef(0);        // ultima vez que se vio ese QR
  const enviandoRef = useRef(false);      // hay un POST en vuelo
  const limpiarFeedbackRef = useRef(null);

  // Cuanto debe desaparecer un QR de la camara antes de volver a contarlo.
  const ESPERA_MISMO_QR_MS = 4000;
  // Cuanto se queda el resultado en pantalla antes de dejarla lista otra vez.
  const LIMPIAR_FEEDBACK_MS = 5000;

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
          facingMode: 'environment',
          supportedScanTypes: [0],
          videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        },
        false
      );

      scanner.render(
        (decodedText) => {
          /*
           * La libreria dispara este callback ~10 veces por segundo mientras el
           * QR siga delante de la camara, asi que aqui se decide si ESTE disparo
           * cuenta como un ingreso nuevo o es el mismo codigo todavia en cuadro.
           *
           * La clave es refrescar la marca de tiempo en cada disparo repetido:
           * asi la cuenta atras no empieza cuando se escaneo, sino cuando el
           * codigo DEJO de verse. Alguien que sostenga su QR un minuto entero
           * registra una sola vez; el siguiente miembro entra de inmediato
           * porque su codigo es distinto.
           */
          const ahora = Date.now();
          const mismoCodigo = ultimoCodigoRef.current === decodedText;
          const enFrio = ahora - ultimoScanRef.current < ESPERA_MISMO_QR_MS;

          if (mismoCodigo && enFrio) {
            ultimoScanRef.current = ahora;   // sigue en cuadro: reinicia la espera
            return;
          }
          if (enviandoRef.current) return;   // hay un POST en vuelo

          ultimoCodigoRef.current = decodedText;
          ultimoScanRef.current = ahora;
          setScannerError(null);
          handleAutoCheckIn(decodedText);
        },
        () => {
          // Silencio: la libreria reporta "no encontre QR" en cada cuadro.
        }
      );

      scannerRef.current = scanner;

      return () => {
        if (limpiarFeedbackRef.current) clearTimeout(limpiarFeedbackRef.current);
        if (scannerRef.current) {
          scannerRef.current.clear().catch(console.error);
        }
      };
    }
  }, [cameraEnabled]);

  const toggleCamera = async () => {
    if (cameraEnabled) {
      // Desactivar cámara - LIMPIEZA COMPLETA
      if (scannerRef.current) {
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
      
      // RESET COMPLETO DE FLAGS cuando se apaga la cámara
      console.log('🔄 RESET COMPLETO: Limpiando todos los flags al desactivar cámara');
      isProcessingRef.current = false;
      lastScannedRef.current = null;
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      
      setCameraEnabled(false);
      setScannerError(null);
      setCodigo('');
      setFeedback(null);
      setError('');
    } else {
      // Activar cámara
      setCameraEnabled(true);
      setScannerError(null);
    }
  };

  /** Deja el panel en blanco para el siguiente miembro, sin apagar la camara. */
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

      // El backend responde 200 y `duplicado` cuando ese miembro ya marco hace
      // un momento: se avisa, pero no se celebra como un ingreso nuevo.
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
      console.error('Error en check-in:', err);
      const errorMsg = err.response?.status === 404
        ? 'Usuario no encontrado. Verifica que el QR sea correcto.'
        : err.message || 'No se pudo registrar el check-in.';
      setError(errorMsg);
      setFeedback({ type: 'error', msg: errorMsg, advertencia: true, miembro: null });
      setFrameFlash({ type: 'error', key: Date.now() });
      // Un fallo no debe dejar el codigo bloqueado: hay que poder reintentar.
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
                minHeight: cameraEnabled ? '350px' : '300px', 
                height: cameraEnabled ? 'auto' : '300px',
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
                <div id="qr-reader" style={{ width: '100%', height: '100%', minHeight: '350px' }}></div>
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
                    {feedback.advertencia === 'ya-registrado'
                      ? ' — no se registró de nuevo'
                      : feedback.advertencia && ' — revisar antes de dejar entrar'}
                  </small>
                )}
                {feedback.miembro?.codigo_qr && feedback.type !== 'error' && (
                  <div style={{ marginTop: 12, padding: 12, background: 'white', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Código QR del miembro
                    </div>
                    <div style={{ 
                      fontFamily: 'monospace', 
                      fontSize: 16, 
                      fontWeight: 'bold', 
                      color: '#333',
                      background: '#f5f5f5',
                      padding: '8px 12px',
                      borderRadius: 4,
                      letterSpacing: '1px',
                      userSelect: 'all'
                    }}>
                      {feedback.miembro.codigo_qr}
                    </div>
                    {feedback.miembro.qr_imagen && (
                      <img 
                        src={feedback.miembro.qr_imagen} 
                        alt="QR Code" 
                        style={{ 
                          width: 120, 
                          height: 120, 
                          marginTop: 8,
                          border: '1px solid #ddd',
                          borderRadius: 4
                        }} 
                      />
                    )}
                  </div>
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