/**
 * pages/DashboardPage.jsx
 *
 * Pantalla principal del admin (/admin/dashboard).
 *
 * Cambios en esta version:
 *   - 5 botones funcionales:
 *       1. Exportar        -> descarga CSV (fetch blob -> Blob URL -> anchor click)
 *       2. Registrar entrada -> navigate('/admin/checkin')
 *       3. Activar plan    -> toast "Pago en construccion" (5s). No existe /billing.
 *       4. Ver todos       -> navigate('/admin/miembros?vencio=1')
 *       5. Fila chevron    -> navigate('/admin/miembros?doc=<documento>')
 *   - Animaciones (motion.css + hooks/useAnimatedCount.js):
 *       * <PageTransition> envuelve toda la pagina.
 *       * 8 KPIs usan useAnimatedCount (incluye retention + '%' y COP '$').
 *       * Cada KPI aparece con .anim-fade-up + stagger .anim-delay-1..8.
 *       * Filas de proximos vencimientos entran con stagger.
 *       * Cada check-in reciente aparece con .anim-slide-in-right.
 *       * BarsWeekly dibuja las barras vacias y anima la altura con CSS
 *         transition cuando llegan los datos.
 *   - Reemplaza los datos placeholder de "Miembros en riesgo" por la lista real
 *     que devuelve GET /api/admin/dashboard (enRiesgoList, top 4 con 15+ dias).
 *
 * Notas de scope:
 *   - NO se modifica Miembros/Checkin/Staff (PROHIBIDO en esta tarea).
 *     Por eso las navegaciones a /admin/miembros?vencio=1 o ?doc=... se hacen
 *     pero el filtro lo aplicara una mejora futura en MiembrosPage.
 *   - /billing no existe como ruta; por eso el boton "Activar plan" cae al toast.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTrial } from '../context/TrialContext';
import { useApiError } from '../components/ErrorBanner';
import { api } from '../api';
import PageTransition from '../components/PageTransition';
import useAnimatedCount from '../hooks/useAnimatedCount';
import '../styles/admin.css';

const COP = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

// Duracion del toast interno del Dashboard (no usa ErrorBanner porque es info, no error).
const TOAST_MS = 5000;

function Sparkline({ data, color = '#A855F7' }) {
  if (!data || data.length === 0) return null;
  const w = 600, h = 220, pad = 8;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = (w - pad * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (d.value / max) * (h - pad * 2);
    return [x, y];
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
  const fill = `${path} L ${points[points.length - 1][0].toFixed(2)} ${h - pad} L ${points[0][0].toFixed(2)} ${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="chart-svg">
      <defs>
        <linearGradient id="grad-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.40" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#grad-spark)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={color}>
          <title>{data[i].label}: {data[i].value}</title>
        </circle>
      ))}
    </svg>
  );
}

/**
 * BarsWeekly: barras verticales por dia de la semana.
 *
 * `appear=true` -> renderiza las barras a su altura final y deja que la CSS
 * transition (definida inline en cada rect) anime el cambio desde 0.
 * `appear=false` -> barras a altura 0 (estado inicial antes de que lleguen los
 * datos o si llegan vacias).
 *
 * Cada barra lleva un transition-delay incremental para que entren escalonadas,
 * mismo patron que .anim-delay-N del motion.css.
 */
function BarsWeekly({ data, appear = false }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const transitionDuration = '600ms';
  return (
    <svg viewBox="0 0 600 220" preserveAspectRatio="none" className="chart-svg">
      <defs>
        <linearGradient id="grad-bar" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"  stopColor="#A855F7" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#A855F7" stopOpacity="0.30" />
        </linearGradient>
      </defs>
      {data.map((d, i) => {
        const gap = 12;
        const barW = (600 - gap * (data.length + 1)) / data.length;
        const x = gap + i * (barW + gap);
        const targetH = (d.count / max) * 170;
        const h = appear ? targetH : 0;
        const y = 200 - h;
        const delay = `${i * 70}ms`;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx="4"
              fill="url(#grad-bar)"
              style={{
                transition: `height ${transitionDuration} cubic-bezier(0.22, 1, 0.36, 1) ${delay}, y ${transitionDuration} cubic-bezier(0.22, 1, 0.36, 1) ${delay}`,
              }}
            />
            <text
              x={x + barW / 2}
              y={y - 6}
              fill="#e2e2e2"
              fontSize="11"
              textAnchor="middle"
              fontFamily="JetBrains Mono"
              style={{
                opacity: appear ? 1 : 0,
                transition: `opacity ${transitionDuration} ease ${delay}`,
              }}
            >
              {d.count}
            </text>
            <text
              x={x + barW / 2}
              y={216}
              fill="#cfc2d6"
              fontSize="10"
              textAnchor="middle"
              fontFamily="JetBrains Mono"
              letterSpacing="1"
            >
              {d.day.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { trial } = useTrial();
  const navigate = useNavigate();
  const { pushApiError } = useApiError();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [barsAppear, setBarsAppear] = useState(false);
  const [toast, setToast] = useState(null); // { message, tone }

  useEffect(() => {
    let alive = true;
    api.get('/admin/dashboard')
      .then(({ data: payload }) => {
        if (!alive) return;
        setData(payload);
        // Dispara la animacion de barras en el siguiente frame para que
        // mounten a 0 y luego transicionen a la altura final.
        requestAnimationFrame(() => setBarsAppear(true));
      })
      .catch((err) => {
        if (alive) setError(err.message || 'No se pudo cargar el dashboard.');
      });
    return () => { alive = false; };
  }, []);

  // Auto-dismiss del toast interno.
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const weekly = data?.weekly ?? [];

  // ---------- Handlers de los 5 botones ----------
  const handleExport = async () => {
    try {
      const response = await api.get('/admin/dashboard/export', { responseType: 'blob' });
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      // Intentar respetar el filename del Content-Disposition.
      const disposition = response.headers?.['content-disposition'] || '';
      const match = /filename=["']?([^"';]+)["']?/i.exec(disposition);
      const fallback = `fitloyalty-export-${new Date().toISOString().slice(0, 10)}.csv`;
      const filename = (match && match[1]) ? match[1] : fallback;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Liberar el Blob URL en el siguiente tick.
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err) {
      pushApiError(err);
    }
  };

  const handleCheckin = () => navigate('/admin/checkin');

  const handleActivatePlan = () => {
    // No existe ruta /billing todavia. Mostramos toast informativo 5s.
    setToast({
      tone: 'info',
      message: 'Pago en construccion. Te avisaremos cuando este listo.',
    });
  };

  const handleVerTodos = () => navigate('/admin/miembros?vencio=1');

  const handleFila = (r) => {
    const doc = (r && r.documento) ? encodeURIComponent(r.documento) : '';
    navigate(`/admin/miembros?doc=${doc}`);
  };

  // Refs para useAnimatedCount (los 8 KPIs).
  const miembrosRef    = useAnimatedCount(data?.totalMiembros ?? 0, { duration: 900 });
  const checkinsRef    = useAnimatedCount(data?.checkinsHoy  ?? 0, { duration: 900 });
  const vencen7Ref     = useAnimatedCount(data?.vencen7      ?? 0, { duration: 900 });
  const enRiesgoRef    = useAnimatedCount(data?.enRiesgo     ?? 0, { duration: 900 });
  const retentionRef   = useAnimatedCount(data?.retention    ?? 0, { duration: 900 });
  const ingresosRef    = useAnimatedCount(data?.ingresosMes  ?? 0, { duration: 900 });
  const qrsRef         = useAnimatedCount(data?.qrsActivos   ?? data?.totalMiembros ?? 0, { duration: 900 });

  // trial?.estado viene de TrialContext; lo dejamos tal cual el codigo previo.
  const trialEsTrial = trial?.estado === 'trial';

  return (
    <PageTransition>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-head__title">Hola, {user?.name?.split(' ')[0] || 'admin'}</h1>
          <p className="admin-page-head__lead">Acá tienes el resumen de hoy en tu gimnasio.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={handleExport}>
            <span className="material-symbols-outlined icon">file_download</span>
            Exportar
          </button>
          <button type="button" className="btn btn-primary" onClick={handleCheckin}>
            <span className="material-symbols-outlined icon">qr_code_scanner</span>
            Registrar entrada
          </button>
        </div>
      </header>

      {toast && (
        <div
          className="alert alert-success"
          role="status"
          aria-live="polite"
          style={{ marginBottom: 16 }}
        >
          <span className="material-symbols-outlined icon">info</span>
          <span>{toast.message}</span>
        </div>
      )}

      {trialEsTrial && (
        <div className="trial-banner">
          <div className="trial-banner__icon">
            <span className="material-symbols-outlined icon">workspace_premium</span>
          </div>
          <div className="trial-banner__text">
            <strong>Estás en período de prueba</strong>
            <span>Te quedan {trial?.diasRestantes ?? 14} días. Activa tu plan para no perder datos.</span>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleActivatePlan}>
            Activar plan
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          <span className="material-symbols-outlined icon">error</span>
          <span>{error}</span>
        </div>
      )}

      {!data && !error && <div className="bar-loader" />}

      {data && (
        <>
          <section className="kpi-grid" aria-label="Indicadores clave">
            <article className="kpi anim-fade-up anim-delay-1">
              <div className="kpi-head">
                <span className="kpi-label">Miembros activos</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">group</span></span>
              </div>
              <span className="kpi-value">
                <span ref={miembrosRef}>0</span>
              </span>
              <span className="kpi-meta">+12 este mes</span>
            </article>
            <article className="kpi anim-fade-up anim-delay-2">
              <div className="kpi-head">
                <span className="kpi-label">Asistencia hoy</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">bolt</span></span>
              </div>
              <span className="kpi-value">
                <span ref={checkinsRef}>0</span>
              </span>
              <span className="kpi-meta">↑ {data.checkinsHoy >= 5 ? 'Buen día' : 'Esperando más entradas'}</span>
            </article>
            <article className="kpi anim-fade-up anim-delay-3">
              <div className="kpi-head">
                <span className="kpi-label">Vencen en 7 días</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">event_upcoming</span></span>
              </div>
              <span className="kpi-value">
                <span ref={vencen7Ref}>0</span>
              </span>
              <span className="kpi-meta">Acción recomendada hoy</span>
            </article>
            <article className="kpi kpi-risk anim-fade-up anim-delay-4">
              <div className="kpi-head">
                <span className="kpi-label">En riesgo</span>
                <span className="kpi-icon" style={{ color: 'var(--error)' }}>
                  <span className="material-symbols-outlined icon">priority_high</span>
                </span>
              </div>
              <span className="kpi-value">
                <span ref={enRiesgoRef}>0</span>
              </span>
              <span className="kpi-meta kpi-meta--error">15+ días sin ir</span>
            </article>
          </section>

          <section className="kpi-grid" aria-label="Indicadores secundarios">
            <article className="kpi anim-fade-up anim-delay-5">
              <div className="kpi-head">
                <span className="kpi-label">Retención 90d</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">trending_up</span></span>
              </div>
              <span className="kpi-value">
                <span ref={retentionRef}>0</span>
                <small style={{ fontSize: 18, color: 'var(--on-surface-variant)', marginLeft: 4 }}>%</small>
              </span>
              <span className="kpi-meta">Por encima del promedio</span>
            </article>
            <article className="kpi anim-fade-up anim-delay-6">
              <div className="kpi-head">
                <span className="kpi-label">Cobros del mes</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">payments</span></span>
              </div>
              <span className="kpi-value">
                $<span ref={ingresosRef}>0</span>
              </span>
              <span className="kpi-meta">{data.cobrosPendientes ?? 0} pendientes</span>
            </article>
            <article className="kpi anim-fade-up anim-delay-7">
              <div className="kpi-head">
                <span className="kpi-label">Plan más vendido</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">workspace_premium</span></span>
              </div>
              <span className="kpi-value" style={{ fontSize: 20 }}>
                {data.planTop || 'Mensual'}
              </span>
              <span className="kpi-meta">{data.planTopCount ?? 0} miembros</span>
            </article>
            <article className="kpi anim-fade-up anim-delay-8">
              <div className="kpi-head">
                <span className="kpi-label">QR generados</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">qr_code</span></span>
              </div>
              <span className="kpi-value">
                <span ref={qrsRef}>0</span>
              </span>
              <span className="kpi-meta">100% operativos</span>
            </article>
          </section>

          <section className="admin-cols" style={{ marginTop: 32 }}>
            <article className="chart-card">
              <header className="chart-card__head">
                <div>
                  <h3>Asistencia de la semana</h3>
                  <p>Cuántos miembros vinieron cada día, en los últimos 7 días.</p>
                </div>
                <div className="legend">
                  <span><i className="legend-purple" /> Asistencias</span>
                </div>
              </header>
              <BarsWeekly data={weekly} appear={barsAppear} />
            </article>

            <article className="chart-card">
              <header className="chart-card__head">
                <div>
                  <h3>Miembros en riesgo</h3>
                  <p>15+ días sin asistir. Actúa antes de que pierdan la mensualidad.</p>
                </div>
                <span className="chip chip-status chip-status--warning">
                  {data.enRiesgo}
                </span>
              </header>
              <div className="risk-list">
                {(data.enRiesgoList ?? []).slice(0, 4).map((r, i) => (
                  <div
                    className="risk-row anim-fade-up"
                    key={`${r.nombre}-${i}`}
                    style={{ animationDelay: `${300 + i * 80}ms` }}
                  >
                    <span className="avatar avatar-error">
                      {r.nombre.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <div className="risk-row__meta">
                      <strong>{r.nombre}</strong>
                      <span>
                        {r.dias_sin === null || r.dias_sin === undefined
                          ? 'Nunca ha venido'
                          : `${r.dias_sin} días sin ir`}
                      </span>
                    </div>
                    <span className="risk-row__amount risk-row__amount--error">
                      {COP(r.monto)}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="admin-cols" style={{ marginTop: 24 }}>
            <article className="table-card">
              <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.01em' }}>
                    Próximos vencimientos
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 4 }}>
                    Miembros cuya mensualidad vence en los próximos 30 días.
                  </p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleVerTodos}>
                  Ver todos
                  <span className="material-symbols-outlined icon">arrow_forward</span>
                </button>
              </div>
              {data.proximos.length === 0 ? (
                <div style={{ padding: '20px 24px', color: 'var(--on-surface-variant)' }}>
                  Nadie vence en los próximos 30 días.
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Miembro</th>
                      <th>Plan</th>
                      <th>Vence</th>
                      <th>Días restantes</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.proximos.map((r, i) => (
                      <tr
                        key={r.id_miembro ?? `${r.miembro}-${i}`}
                        className="anim-fade-up"
                        style={{ animationDelay: `${400 + i * 80}ms` }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="avatar">
                              {(r.miembro || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </span>
                            <strong>{r.miembro}</strong>
                          </div>
                        </td>
                        <td>{r.plan}</td>
                        <td>{new Date(r.fecha_fin).toLocaleDateString('es-CO')}</td>
                        <td>
                          <span className={`chip chip-status ${r.dias_restantes <= 3 ? 'chip-status--warning' : 'chip-status--active'}`}>
                            {r.dias_restantes} días
                          </span>
                        </td>
                        <td className="row-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleFila(r)}
                            aria-label={`Ver detalle de ${r.miembro}`}
                          >
                            <span className="material-symbols-outlined icon">chevron_right</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>

            <article className="table-card">
              <div style={{ padding: '20px 24px' }}>
                <h3 style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.01em' }}>
                  Actividad reciente
                </h3>
                <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 4 }}>
                  Los últimos check-ins del día.
                </p>
              </div>
              {data.recientes.length === 0 ? (
                <div style={{ padding: '0 24px 20px', color: 'var(--on-surface-variant)' }}>
                  Aún no hay check-ins hoy.
                </div>
              ) : (
                <div style={{ padding: '0 24px 20px' }}>
                  <div className="activity-list">
                    {data.recientes.map((r, i) => (
                      <div
                        className="activity-row anim-slide-in-right"
                        key={r.id_checkin}
                        style={{ animationDelay: `${500 + i * 60}ms` }}
                      >
                        <div className="activity-row__icon">
                          <span className="material-symbols-outlined icon">
                            {r.metodo === 'QR' ? 'qr_code_scanner' : 'edit_note'}
                          </span>
                        </div>
                        <div className="activity-row__meta">
                          <strong>{r.nombre}</strong>
                          <span>{r.metodo} · hace {new Date(r.fecha_hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          </section>
        </>
      )}
    </PageTransition>
  );
}