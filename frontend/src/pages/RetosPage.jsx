import { useEffect, useState } from 'react';
import { api } from '../api';
import PageTransition from '../components/PageTransition';
import Modal from '../components/Modal';
import { formatearFechaDia } from '../fechas';

/**
 * Retos de asistencia (RQF-12).
 *
 * El administrador crea retos con meta, fechas, segmento elegible y
 * recompensa. Los de segmento "Todos" inscriben solos a quien hace check-in;
 * los demás se inscriben con «Inscribir elegibles» o desde la app del miembro.
 * El avance sube en cada check-in y, al completar, el miembro lo ve en la
 * pantalla del check-in y en la app, y al administrador le llega un aviso.
 */

const SEGMENTOS = {
  TODOS: 'Todos los miembros',
  INACTIVOS: 'Inactivos (7 días o más sin venir)',
  NUEVOS: 'Nuevos (últimos 30 días)',
  PROXIMOS_A_VENCER: 'Próximos a vencer (7 días)',
};

const ESTADOS = {
  ACTIVO: { texto: 'Activo', cls: 'badge badge--ok' },
  PROGRAMADO: { texto: 'Programado', cls: 'badge badge--warn' },
  COMPLETADO: { texto: 'Terminado', cls: 'badge badge--neutral' },
  CANCELADO: { texto: 'Cancelado', cls: 'badge badge--err' },
};

function hoyColombia(dias = 0) {
  const ms = Date.now() - 5 * 3600 * 1000 + dias * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

const vacio = () => ({
  nombre: '',
  descripcion: '',
  meta_asistencias: 12,
  recompensa: '',
  segmento_elegible: 'TODOS',
  fecha_inicio: hoyColombia(0),
  fecha_fin: hoyColombia(30),
});

export default function RetosPage() {
  const [retos, setRetos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [form, setForm] = useState(vacio);
  const [editando, setEditando] = useState(null); // id_reto o null
  const [guardando, setGuardando] = useState(false);
  const [detalle, setDetalle] = useState(null);   // { reto, participantes, elegibles }

  const cargar = async () => {
    try {
      const { data } = await api.get('/admin/retos');
      setRetos(data.retos || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los retos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const guardar = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (form.fecha_fin < form.fecha_inicio) {
      setError('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }
    setGuardando(true);
    try {
      const payload = { ...form, meta_asistencias: Number(form.meta_asistencias) };
      if (editando) {
        await api.put(`/admin/retos/${editando}`, payload);
        setInfo('Reto actualizado. El avance de los inscritos se recalculó.');
      } else {
        await api.post('/admin/retos', payload);
        setInfo(form.segmento_elegible === 'TODOS'
          ? 'Reto creado. Cada miembro queda inscrito en su próximo check-in.'
          : 'Reto creado. Usa «Inscribir elegibles» o pide a los miembros que se unan desde la app.');
      }
      setForm(vacio()); setEditando(null);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el reto.');
    } finally {
      setGuardando(false);
    }
  };

  const editar = (r) => {
    setEditando(r.id_reto);
    setForm({
      nombre: r.nombre,
      descripcion: r.descripcion || '',
      meta_asistencias: r.meta_asistencias,
      recompensa: r.recompensa || '',
      segmento_elegible: r.segmento_elegible,
      fecha_inicio: r.fecha_inicio,
      fecha_fin: r.fecha_fin,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelar = async (r) => {
    if (!window.confirm(`¿Cancelar el reto «${r.nombre}»? Los inscritos dejarán de sumar.`)) return;
    setError(''); setInfo('');
    try {
      await api.post(`/admin/retos/${r.id_reto}/cancelar`);
      setInfo('Reto cancelado.');
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo cancelar el reto.');
    }
  };

  const verDetalle = async (r) => {
    setError('');
    try {
      const [{ data: p }, { data: el }] = await Promise.all([
        api.get(`/admin/retos/${r.id_reto}/participantes`),
        r.estado === 'ACTIVO' || r.estado === 'PROGRAMADO'
          ? api.get(`/admin/retos/${r.id_reto}/elegibles`)
          : Promise.resolve({ data: { total: 0 } }),
      ]);
      setDetalle({ reto: p.reto, participantes: p.participantes || [], elegibles: el.total || 0 });
    } catch (err) {
      setError(err.message || 'No se pudo cargar el detalle.');
    }
  };

  const inscribirElegibles = async () => {
    if (!detalle) return;
    try {
      const { data } = await api.post(`/admin/retos/${detalle.reto.id_reto}/inscribir`, {});
      setInfo(`${data.inscritos} ${data.inscritos === 1 ? 'miembro inscrito' : 'miembros inscritos'} en «${detalle.reto.nombre}».`);
      await verDetalle(detalle.reto);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo inscribir a los elegibles.');
    }
  };

  const campo = (k) => ({
    value: form[k],
    onChange: (e) => setForm({ ...form, [k]: e.target.value }),
  });

  return (
    <PageTransition>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-head__title">Retos</h1>
          <p className="admin-page-head__lead">
            Metas de asistencia con recompensa. El avance sube solo con cada check-in.
          </p>
        </div>
      </header>

      {error && (
        <div className="alert alert-error anim-scale-in" role="alert" style={{ marginBottom: 16 }}>
          <span className="material-symbols-outlined icon">error</span>
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div className="alert alert-success anim-scale-in" role="status" style={{ marginBottom: 16 }}>
          <span className="material-symbols-outlined icon">check_circle</span>
          <span>{info}</span>
        </div>
      )}

      <section className="chart-card anim-scale-in" style={{ maxWidth: 900 }}>
        <header className="chart-card__head">
          <div>
            <h3>{editando ? 'Editar reto' : 'Nuevo reto'}</h3>
            <p>Ejemplo: «12 visitas en noviembre» con un batido gratis de recompensa.</p>
          </div>
        </header>
        <form className="auth-form" onSubmit={guardar} noValidate>
          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Nombre</span>
              <input className="field-input" maxLength={100} required placeholder="12 visitas en noviembre" {...campo('nombre')} />
            </label>
            <label className="field">
              <span className="field-label">Meta (asistencias)</span>
              <input className="field-input" type="number" min="1" max="1000" {...campo('meta_asistencias')} />
            </label>
          </div>
          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Desde</span>
              <input className="field-input" type="date" {...campo('fecha_inicio')} />
            </label>
            <label className="field">
              <span className="field-label">Hasta</span>
              <input className="field-input" type="date" min={form.fecha_inicio} {...campo('fecha_fin')} />
            </label>
            <label className="field">
              <span className="field-label">Quién puede participar</span>
              <select className="field-input" {...campo('segmento_elegible')}>
                {Object.entries(SEGMENTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Recompensa</span>
              <input className="field-input" maxLength={200} placeholder="Batido gratis" {...campo('recompensa')} />
            </label>
            <label className="field">
              <span className="field-label">Descripción (opcional)</span>
              <input className="field-input" maxLength={1000} placeholder="Ven 12 días distintos este mes" {...campo('descripcion')} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={guardando || form.nombre.trim().length < 3}>
              <span className="material-symbols-outlined icon">{editando ? 'save' : 'add'}</span>
              {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear reto'}
            </button>
            {editando && (
              <button type="button" className="btn btn-ghost" onClick={() => { setEditando(null); setForm(vacio()); }}>
                Cancelar edición
              </button>
            )}
          </div>
          <small style={{ display: 'block', marginTop: 8, color: 'var(--on-surface-variant)' }}>
            Cada día con al menos un ingreso cuenta una asistencia; dos ingresos el mismo día cuentan una.
          </small>
        </form>
      </section>

      <section className="chart-card anim-scale-in" style={{ maxWidth: 900, marginTop: 24 }}>
        <header className="chart-card__head">
          <div>
            <h3>Retos del gimnasio</h3>
            <p>Inscritos, completados y avance promedio.</p>
          </div>
        </header>
        {cargando && <div className="bar-loader" />}
        {!cargando && retos.length === 0 && <p>Todavía no hay retos. Crea el primero arriba.</p>}
        <div className="lista-tarjetas">
          {retos.map((r) => {
            const est = ESTADOS[r.estado] || ESTADOS.ACTIVO;
            const vigente = r.estado === 'ACTIVO' || r.estado === 'PROGRAMADO';
            return (
              <article key={r.id_reto} className="tarjeta-fila" style={{ opacity: r.estado === 'CANCELADO' ? 0.6 : 1 }}>
                <div className="tarjeta-fila__texto">
                  <strong>{r.nombre}</strong> <span className={est.cls}>{est.texto}</span>
                  <small>
                    Meta: {r.meta_asistencias} asistencias · {formatearFechaDia(r.fecha_inicio)} a {formatearFechaDia(r.fecha_fin)} · {SEGMENTOS[r.segmento_elegible] || r.segmento_elegible}
                  </small>
                  {r.recompensa && <small>Recompensa: {r.recompensa}</small>}
                  <small>
                    {r.inscritos} {r.inscritos === 1 ? 'inscrito' : 'inscritos'} · {r.completados} {r.completados === 1 ? 'completado' : 'completados'} · avance promedio {r.avance_promedio}%
                  </small>
                  <div className="barra-avance" style={{ marginTop: 6 }} aria-label={`Avance promedio ${r.avance_promedio}%`}>
                    <span style={{ width: `${Math.min(100, r.avance_promedio)}%` }} />
                  </div>
                </div>
                <div className="tarjeta-fila__acciones">
                  <button type="button" className="btn btn-ghost" onClick={() => verDetalle(r)}>
                    <span className="material-symbols-outlined icon">group</span> Participantes
                  </button>
                  {vigente && (
                    <>
                      <button type="button" className="btn btn-ghost" onClick={() => editar(r)}>
                        <span className="material-symbols-outlined icon">edit</span> Editar
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => cancelar(r)}>
                        <span className="material-symbols-outlined icon">block</span> Cancelar
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <Modal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        title={detalle ? `Participantes de «${detalle.reto.nombre}»` : ''}
        footer={
          <>
            {detalle && detalle.elegibles > 0 && (
              <button type="button" className="btn btn-primary" onClick={inscribirElegibles}>
                Inscribir {detalle.elegibles} {detalle.elegibles === 1 ? 'elegible' : 'elegibles'}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => setDetalle(null)}>Cerrar</button>
          </>
        }
      >
        {detalle && detalle.participantes.length === 0 && (
          <p>
            Nadie inscrito todavía.
            {detalle.reto.segmento_elegible === 'TODOS' ? ' Se inscriben solos en su próximo check-in.' : ''}
          </p>
        )}
        {detalle && detalle.participantes.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Miembro</th><th>Asistencias</th><th>Avance</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {detalle.participantes.map((p) => (
                  <tr key={p.id_reto_miembro}>
                    <td><strong>{p.nombre}</strong><small style={{ display: 'block' }}>{p.documento}</small></td>
                    <td>{p.checkins_acumulados} / {detalle.reto.meta_asistencias}</td>
                    <td>
                      <div className="barra-avance"><span style={{ width: `${p.porcentaje_avance}%` }} /></div>
                      <small>{p.porcentaje_avance}%</small>
                    </td>
                    <td>
                      <span className={p.estado === 'COMPLETADO' ? 'badge badge--ok' : p.estado === 'CANCELADO' ? 'badge badge--err' : 'badge badge--neutral'}>
                        {p.estado === 'COMPLETADO' ? 'Completado' : p.estado === 'CANCELADO' ? 'Cancelado' : 'En curso'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </PageTransition>
  );
}
