import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';
import Modal from './Modal';

const SEGMENTOS = {
  TODOS: 'Todos los miembros',
  NUEVOS: 'Nuevos (inscritos hace 30 días o menos)',
  INACTIVOS: 'Inactivos (según la alerta amarilla de abandono)',
  PROXIMOS_A_VENCER: 'Plan por vencer (7 días o menos)',
};

const ESTADOS = {
  ACTIVO: { texto: 'En curso', clase: 'badge--ok' },
  PROGRAMADO: { texto: 'Programado', clase: 'badge--warn' },
  FINALIZADO: { texto: 'Terminado', clase: 'badge--neutral' },
  CANCELADO: { texto: 'Cancelado', clase: 'badge--err' },
};

const INSCRIPCION = {
  EN_CURSO: { texto: 'En curso', clase: 'badge--warn' },
  COMPLETADO: { texto: 'Completado', clase: 'badge--ok' },
  CANCELADO: { texto: 'Cancelado', clase: 'badge--neutral' },
};

// Fechas del navegador como AAAA-MM-DD (en-CA da ese formato).
const fechaLocal = (dias = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString('en-CA');
};
const verFecha = (f) => (f ? f.split('-').reverse().join('/') : '');
const checkins = (n) => `${n} ${Number(n) === 1 ? 'check-in' : 'check-ins'}`;

const vacio = () => ({
  nombre: '',
  descripcion: '',
  meta_asistencias: 12,
  recompensa: '',
  segmento_elegible: 'TODOS',
  fecha_inicio: fechaLocal(0),
  fecha_fin: fechaLocal(30),
});

/**
 * Retos de asistencia (RQF-12): crear, editar, cancelar y ver el progreso de
 * los inscritos. La inscripcion y el progreso los hace el check-in.
 */
export default function RetosConfig() {
  const [retos, setRetos] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editando, setEditando] = useState(null);   // reto que se edita, o null
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(null);     // id del reto con el progreso a la vista
  const [progreso, setProgreso] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [aCancelar, setACancelar] = useState(null);

  const cargar = async () => {
    try {
      const { data } = await api.get('/admin/retos');
      setRetos(data.retos || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los retos.');
    }
  };

  useEffect(() => { cargar(); }, []);

  const cargarProgreso = async (id, estado = filtro) => {
    try {
      const { data } = await api.get(`/admin/retos/${id}/progreso`, { params: estado ? { estado } : {} });
      setProgreso(data);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el progreso.');
    }
  };

  const verProgreso = (r) => {
    if (abierto === r.id_reto) { setAbierto(null); setProgreso(null); return; }
    setAbierto(r.id_reto);
    setProgreso(null);
    setFiltro('');
    cargarProgreso(r.id_reto, '');
  };

  const cambiarFiltro = (estado) => {
    setFiltro(estado);
    cargarProgreso(abierto, estado);
  };

  const editar = (r) => {
    setEditando(r);
    setForm({
      nombre: r.nombre,
      descripcion: r.descripcion || '',
      meta_asistencias: r.meta_asistencias,
      recompensa: r.recompensa || '',
      segmento_elegible: r.segmento_elegible,
      fecha_inicio: r.fecha_inicio,
      fecha_fin: r.fecha_fin,
    });
    setError(''); setInfo('');
  };

  // HU-50: un reto (tambien uno cancelado) sirve de base para uno nuevo.
  const usarDeBase = (r) => {
    setEditando(null);
    setForm({ ...vacio(), nombre: `${r.nombre} (nuevo)`.slice(0, 100), descripcion: r.descripcion || '',
      meta_asistencias: r.meta_asistencias, recompensa: r.recompensa || '', segmento_elegible: r.segmento_elegible });
    setError(''); setInfo('');
  };

  const descartar = () => { setEditando(null); setForm(vacio()); };

  const guardar = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (form.fecha_fin < form.fecha_inicio) {
      setError('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }
    setGuardando(true);
    try {
      const datos = { ...form, meta_asistencias: Number(form.meta_asistencias), descripcion: form.descripcion.trim() || null };
      if (editando) {
        // Con inscritos el backend no deja cambiar las reglas: solo se mandan
        // el nombre, la descripcion y la recompensa.
        const enviar = editando.inscritos > 0
          ? { nombre: datos.nombre, descripcion: datos.descripcion, recompensa: datos.recompensa }
          : datos;
        await api.put(`/admin/retos/${editando.id_reto}`, enviar);
        setInfo(`Se guardaron los cambios de «${datos.nombre}».`);
      } else {
        await api.post('/admin/retos', datos);
        setInfo(`Reto «${datos.nombre}» creado. Los miembros del segmento quedan inscritos con su próximo ingreso.`);
      }
      descartar();
      await cargar();
      if (abierto) cargarProgreso(abierto);
    } catch (err) {
      setError(err.message || 'No se pudo guardar el reto.');
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = async () => {
    const r = aCancelar;
    setACancelar(null);
    setError(''); setInfo('');
    try {
      const { data } = await api.delete(`/admin/retos/${r.id_reto}`);
      setInfo(`Reto «${r.nombre}» cancelado.${data.inscripcionesCanceladas
        ? ` Se les avisó en la app a ${data.inscripcionesCanceladas} ${data.inscripcionesCanceladas === 1 ? 'inscrito' : 'inscritos'}.` : ''}`);
      if (editando?.id_reto === r.id_reto) descartar();
      await cargar();
      if (abierto === r.id_reto) cargarProgreso(r.id_reto);
    } catch (err) {
      setError(err.message || 'No se pudo cancelar el reto.');
    }
  };

  const reglasBloqueadas = Boolean(editando && editando.inscritos > 0);
  const editable = (r) => r.estado === 'ACTIVO' || r.estado === 'PROGRAMADO';

  return (
    <section className="chart-card anim-scale-in" style={{ maxWidth: 800, marginTop: 24 }}>
      <header className="chart-card__head">
        <div>
          <h3>Retos de asistencia</h3>
          <p>
            Los miembros del segmento quedan inscritos solos con su primer ingreso dentro de las fechas y cada
            check-in suma. Al llegar a la meta se avisa en la campana y en la app del miembro.
          </p>
        </div>
      </header>

      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
          <span className="material-symbols-outlined icon">error</span>
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div className="alert alert-success" role="status" style={{ marginBottom: 16 }}>
          <span className="material-symbols-outlined icon">check_circle</span>
          <span>{info}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {retos.length === 0 && <p>Todavía no hay retos. Crea el primero abajo.</p>}
        {retos.map((r) => (
          <Fragment key={r.id_reto}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              opacity: r.estado === 'CANCELADO' || r.estado === 'FINALIZADO' ? 0.6 : 1 }}>
              <span style={{ lineHeight: 1.4, flex: '1 1 220px', minWidth: 0, overflowWrap: 'anywhere' }}>
                <strong>{r.nombre}</strong>{' '}
                <span className={`badge ${ESTADOS[r.estado]?.clase || 'badge--neutral'}`}>{ESTADOS[r.estado]?.texto || r.estado}</span>
                <small style={{ display: 'block' }}>
                  Meta: {checkins(r.meta_asistencias)} · {verFecha(r.fecha_inicio)} a {verFecha(r.fecha_fin)} · {SEGMENTOS[r.segmento_elegible] || r.segmento_elegible}
                </small>
                <small style={{ display: 'block' }}>
                  Recompensa: {r.recompensa || '—'} · {r.inscritos} {r.inscritos === 1 ? 'inscrito' : 'inscritos'}, {r.completados} {r.completados === 1 ? 'lo completó' : 'lo completaron'}
                </small>
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => verProgreso(r)} aria-expanded={abierto === r.id_reto}>
                  {abierto === r.id_reto ? 'Ocultar progreso' : 'Progreso'}
                </button>
                {editable(r) && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => editar(r)}>Editar</button>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => usarDeBase(r)}>Usar de base</button>
                {editable(r) && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setACancelar(r)}>Cancelar</button>
                )}
              </span>
            </div>

            {abierto === r.id_reto && (
              <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--surface-container)', marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                  <small>
                    {progreso
                      ? `${progreso.resumen.inscritos} inscritos · ${progreso.resumen.en_curso} en curso · ${progreso.resumen.completados} completaron · ${progreso.resumen.cancelados} cancelados`
                      : 'Cargando…'}
                  </small>
                  <select className="field-input" style={{ width: 'auto' }} value={filtro}
                    onChange={(e) => cambiarFiltro(e.target.value)} aria-label="Filtrar por estado">
                    <option value="">Todos</option>
                    <option value="EN_CURSO">En curso</option>
                    <option value="COMPLETADO">Completaron</option>
                    <option value="CANCELADO">Cancelados</option>
                  </select>
                </div>
                {progreso && progreso.miembros.length === 0 && (
                  <p style={{ margin: 0 }}>Nadie todavía. Se inscriben solos con su próximo ingreso.</p>
                )}
                {progreso && progreso.miembros.map((p) => (
                  <div key={p.id_reto_miembro} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0' }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ minWidth: 0 }}>
                        <strong>{p.nombre}</strong> <small>({p.documento})</small>
                      </span>
                      <span className={`badge ${INSCRIPCION[p.estado]?.clase || 'badge--neutral'}`}>
                        {INSCRIPCION[p.estado]?.texto || p.estado}
                      </span>
                    </span>
                    <span
                      role="progressbar"
                      aria-label={`Avance de ${p.nombre}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(p.porcentaje_avance)}
                      style={{ display: 'block', height: 6, borderRadius: 99, background: 'var(--border-subtle)', overflow: 'hidden' }}
                    >
                      <span style={{ display: 'block', height: '100%', width: `${Math.min(100, p.porcentaje_avance)}%`,
                        background: p.estado === 'COMPLETADO' ? '#4ade80' : 'var(--primary-accent)' }} />
                    </span>
                    <small>
                      {p.checkins_acumulados}/{checkins(progreso.reto.meta_asistencias)} · {Math.round(p.porcentaje_avance)} %
                      {p.fecha_completado ? ` · completó el ${new Date(p.fecha_completado).toLocaleDateString('es-CO')}` : ''}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </Fragment>
        ))}
      </div>

      <form className="auth-form" onSubmit={guardar} noValidate>
        <h4 style={{ margin: '0 0 8px' }}>{editando ? `Editar «${editando.nombre}»` : 'Nuevo reto'}</h4>
        {reglasBloqueadas && (
          <p style={{ margin: '0 0 8px' }}>
            <small>Ya hay miembros inscritos: solo puedes cambiar el nombre, la descripción y la recompensa.</small>
          </p>
        )}
        <div className="auth-form-row">
          <label className="field">
            <span className="field-label">Nombre</span>
            <input className="field-input" value={form.nombre} maxLength={100}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Reto de noviembre" />
          </label>
          <label className="field">
            <span className="field-label">Segmento elegible</span>
            <select className="field-input" value={form.segmento_elegible} disabled={reglasBloqueadas}
              onChange={(e) => setForm({ ...form, segmento_elegible: e.target.value })}>
              {Object.entries(SEGMENTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <div className="auth-form-row">
          <label className="field">
            <span className="field-label">Meta (check-ins)</span>
            <input className="field-input" type="number" min="1" max="1000" value={form.meta_asistencias} disabled={reglasBloqueadas}
              onChange={(e) => setForm({ ...form, meta_asistencias: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Desde</span>
            <input className="field-input" type="date" value={form.fecha_inicio} disabled={reglasBloqueadas}
              onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Hasta</span>
            <input className="field-input" type="date" value={form.fecha_fin} min={form.fecha_inicio} disabled={reglasBloqueadas}
              onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Recompensa</span>
          <input className="field-input" value={form.recompensa} maxLength={200}
            onChange={(e) => setForm({ ...form, recompensa: e.target.value })} placeholder="Una camiseta del gimnasio" />
        </label>
        <label className="field">
          <span className="field-label">Descripción (opcional)</span>
          <input className="field-input" value={form.descripcion} maxLength={500}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ven 12 veces este mes" />
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn btn-secondary"
            disabled={guardando || !form.nombre.trim() || !form.recompensa.trim() || !form.fecha_inicio || !form.fecha_fin}>
            <span className="material-symbols-outlined icon">{editando ? 'save' : 'add'}</span>
            {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear reto'}
          </button>
          {editando && (
            <button type="button" className="btn btn-ghost" onClick={descartar}>Descartar</button>
          )}
        </div>
      </form>

      <Modal
        open={Boolean(aCancelar)}
        onClose={() => setACancelar(null)}
        title="¿Cancelar el reto?"
        variant="danger"
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setACancelar(null)}>Volver</button>
            <button type="button" className="btn btn-danger" onClick={cancelar}>Cancelar el reto</button>
          </>
        )}
      >
        {aCancelar && (
          <p style={{ margin: 0 }}>
            «{aCancelar.nombre}» deja de sumar check-ins. El progreso de cada inscrito queda guardado, quienes ya lo
            completaron conservan su recompensa y a los que iban en curso les llega un aviso en la app. No se puede deshacer.
          </p>
        )}
      </Modal>
    </section>
  );
}
