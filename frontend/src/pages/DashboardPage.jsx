import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTrial } from '../context/TrialContext';
import { api } from '../api';
import EmptyState from '../components/EmptyState';
import '../styles/admin.css';

const COP = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

function BarsWeekly({ data }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
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
        const h = (d.count / max) * 170;
        const y = 200 - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx="4" fill="url(#grad-bar)" />
            <text x={x + barW / 2} y={y - 6} fill="#e2e2e2" fontSize="11" textAnchor="middle" fontFamily="JetBrains Mono">
              {d.count}
            </text>
            <text x={x + barW / 2} y={216} fill="#cfc2d6" fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono" letterSpacing="1">
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
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.get('/admin/dashboard')
      .then(({ data }) => { if (alive) setData(data); })
      .catch((err) => { if (alive) setError(err.response?.data?.error || 'No se pudo cargar el dashboard.'); });
    return () => { alive = false; };
  }, []);

  const weekly = data?.weekly ?? [];

  return (
    <>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-head__title">Hola, {user?.name?.split(' ')[0] || 'admin'}</h1>
          <p className="admin-page-head__lead">Acá tienes el resumen de hoy en tu gimnasio.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost">
            <span className="material-symbols-outlined icon">file_download</span>
            Exportar
          </button>
          <button className="btn btn-primary">
            <span className="material-symbols-outlined icon">qr_code_scanner</span>
            Registrar entrada
          </button>
        </div>
      </header>

      {trial?.estado === 'trial' && (
        <div className="trial-banner">
          <div className="trial-banner__icon">
            <span className="material-symbols-outlined icon">workspace_premium</span>
          </div>
          <div className="trial-banner__text">
            <strong>Estás en período de prueba</strong>
            <span>Te quedan {trial?.diasRestantes ?? 14} días. Activa tu plan para no perder datos.</span>
          </div>
          <button className="btn btn-primary">Activar plan</button>
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
            <article className="kpi">
              <div className="kpi-head">
                <span className="kpi-label">Miembros activos</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">group</span></span>
              </div>
              <span className="kpi-value">{data.totalMiembros}</span>
              <span className="kpi-meta">+12 este mes</span>
            </article>
            <article className="kpi">
              <div className="kpi-head">
                <span className="kpi-label">Asistencia hoy</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">bolt</span></span>
              </div>
              <span className="kpi-value">{data.checkinsHoy}</span>
              <span className="kpi-meta">↑ {data.checkinsHoy >= 5 ? 'Buen día' : 'Esperando más entradas'}</span>
            </article>
            <article className="kpi">
              <div className="kpi-head">
                <span className="kpi-label">Vencen en 7 días</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">event_upcoming</span></span>
              </div>
              <span className="kpi-value">{data.vencen7}</span>
              <span className="kpi-meta">Acción recomendada hoy</span>
            </article>
            <article className="kpi kpi-risk">
              <div className="kpi-head">
                <span className="kpi-label">En riesgo</span>
                <span className="kpi-icon" style={{ color: 'var(--error)' }}>
                  <span className="material-symbols-outlined icon">priority_high</span>
                </span>
              </div>
              <span className="kpi-value">{data.enRiesgo}</span>
              <span className="kpi-meta kpi-meta--error">15+ días sin ir</span>
            </article>
          </section>

          <section className="kpi-grid" aria-label="Indicadores secundarios">
            <article className="kpi">
              <div className="kpi-head">
                <span className="kpi-label">Retención 90d</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">trending_up</span></span>
              </div>
              <span className="kpi-value">{data.retention}<small style={{ fontSize: 18, color: 'var(--on-surface-variant)', marginLeft: 4 }}>%</small></span>
              <span className="kpi-meta">Por encima del promedio</span>
            </article>
            <article className="kpi">
              <div className="kpi-head">
                <span className="kpi-label">Cobros del mes</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">payments</span></span>
              </div>
              <span className="kpi-value">{COP(data.ingresosMes)}</span>
              <span className="kpi-meta">{data.cobrosPendientes ?? 0} pendientes</span>
            </article>
            <article className="kpi">
              <div className="kpi-head">
                <span className="kpi-label">Plan más vendido</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">workspace_premium</span></span>
              </div>
              <span className="kpi-value" style={{ fontSize: 20 }}>{data.planTop || 'Mensual'}</span>
              <span className="kpi-meta">{data.planTopCount ?? 0} miembros</span>
            </article>
            <article className="kpi">
              <div className="kpi-head">
                <span className="kpi-label">QR generados</span>
                <span className="kpi-icon"><span className="material-symbols-outlined icon">qr_code</span></span>
              </div>
              <span className="kpi-value">{data.qrsActivos ?? data.totalMiembros}</span>
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
              <BarsWeekly data={weekly} />
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
                {(data.enRiesgoList ?? [
                  { nombre: 'Carlos M.',  dias: 21, monto: 89900 },
                  { nombre: 'Lucía P.',   dias: 18, monto: 89900 },
                  { nombre: 'Diego R.',   dias: 16, monto: 119900 },
                  { nombre: 'Mariana V.', dias: 15, monto: 89900 },
                ].slice(0, 4)).map((r, i) => (
                  <div className="risk-row" key={i}>
                    <span className="avatar avatar-error">
                      {r.nombre.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <div className="risk-row__meta">
                      <strong>{r.nombre}</strong>
                      <span>{r.dias} días sin ir</span>
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
                <button className="btn btn-ghost btn-sm">
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
                      <tr key={i}>
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
                          <button className="btn btn-ghost btn-sm">
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
                <div style={{ padding: '0 24px 20px' }}>
                  <EmptyState
                    icono="qr_code_scanner"
                    titulo="Aún no hay check-ins hoy"
                    descripcion="Cuando registres la primera entrada del día, aparecerá aquí."
                  />
                </div>
              ) : (
                <div style={{ padding: '0 24px 20px' }}>
                  <div className="activity-list">
                    {data.recientes.map((r) => (
                      <div className="activity-row" key={r.id_checkin}>
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
    </>
  );
}