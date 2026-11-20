import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageTransition from '../components/PageTransition';
import Modal from '../components/Modal';
import IconoWhatsapp from '../components/IconoWhatsapp';

/**
 * Campañas de mensajes (RQF-10).
 *
 * 1. Plantillas reutilizables con variables ({primer_nombre}, {gimnasio}...).
 * 2. Campañas a un segmento (inactivos, nuevos, próximos a vencer o todos),
 *    por WhatsApp o correo, para enviar ya (manual) o en una fecha y hora
 *    (programada; la ejecuta el servidor).
 * 3. Al ejecutarla, cada destinatario queda registrado con su estado. Por
 *    correo sale sola. Por WhatsApp sale sola si el servidor tiene WhatsApp
 *    conectado; si no, queda pendiente y aquí se envía uno a uno con el botón
 *    de WhatsApp, que deja constancia del envío.
 */

const ESTADOS = {
  PROGRAMADA: { texto: 'Por enviar', cls: 'badge badge--warn' },
  ENVIADA: { texto: 'Enviada', cls: 'badge badge--ok' },
  CANCELADA: { texto: 'Cancelada', cls: 'badge badge--err' },
};

const VARIABLES_AYUDA = {
  primer_nombre: 'Ana',
  nombre: 'Ana Gómez',
  gimnasio: 'tu gimnasio',
  dias_sin_venir: '12',
  fecha_vencimiento: '30/11/2026',
};

function vistaPrevia(texto) {
  return String(texto || '').replace(/\{(\w+)\}/g, (t, k) => VARIABLES_AYUDA[k] ?? t);
}

function mananaALas8() {
  const ms = Date.now() - 5 * 3600 * 1000 + 86400000;
  return `${new Date(ms).toISOString().slice(0, 10)}T08:00`;
}

const campanaVacia = () => ({
  nombre: '',
  segmento: 'INACTIVOS',
  dias: '',
  canal: 'WHATSAPP',
  id_plantilla: '',
  mensaje: '',
  tipo_disparo: 'MANUAL',
  fecha_programada: mananaALas8(),
});

const plantillaVacia = { nombre: '', contenido: 'Hola {primer_nombre}, en {gimnasio} te extrañamos. ¡Vuelve esta semana y retoma tu rutina!' };

export default function CampanasPage() {
  const [campanas, setCampanas] = useState([]);
  const [segmentos, setSegmentos] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [form, setForm] = useState(campanaVacia);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [previa, setPrevia] = useState(null); // conteo del segmento

  const [nuevaPlantilla, setNuevaPlantilla] = useState(plantillaVacia);
  const [detalle, setDetalle] = useState(null); // { campana, destinatarios }
  const [enviados, setEnviados] = useState(() => new Set());

  const cargar = async () => {
    try {
      const [{ data: c }, { data: p }] = await Promise.all([
        api.get('/admin/campanas'),
        api.get('/admin/plantillas'),
      ]);
      setCampanas(c.campanas || []);
      setSegmentos(c.segmentos || []);
      setPlantillas(p.plantillas || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las campañas.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  // Vista previa del segmento: cuántos miembros recibirían la campaña hoy.
  useEffect(() => {
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ segmento: form.segmento });
        if (form.dias !== '' && form.dias !== null) q.set('dias', form.dias);
        const { data } = await api.get(`/admin/campanas/segmento?${q}`);
        if (vigente) setPrevia(data);
      } catch (_) {
        if (vigente) setPrevia(null);
      }
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [form.segmento, form.dias]);

  const segmentoActual = useMemo(() => segmentos.find((s) => s.valor === form.segmento), [segmentos, form.segmento]);
  const plantillasActivas = plantillas.filter((p) => p.activa);
  const textoMensaje = form.mensaje || (plantillas.find((p) => String(p.id_plantilla) === String(form.id_plantilla))?.contenido ?? '');

  const campo = (k) => ({ value: form[k] ?? '', onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  const elegirPlantilla = (id) => {
    const p = plantillas.find((x) => String(x.id_plantilla) === String(id));
    setForm({ ...form, id_plantilla: id, mensaje: p ? p.contenido : form.mensaje });
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    setGuardando(true);
    try {
      const payload = {
        nombre: form.nombre,
        segmento: form.segmento,
        dias: form.dias === '' ? null : Number(form.dias),
        canal: form.canal,
        id_plantilla: form.id_plantilla ? Number(form.id_plantilla) : null,
        mensaje: form.mensaje,
        tipo_disparo: form.tipo_disparo,
        fecha_programada: form.tipo_disparo === 'PROGRAMADO' ? form.fecha_programada : null,
      };
      if (editando) await api.put(`/admin/campanas/${editando}`, payload);
      else await api.post('/admin/campanas', payload);
      setInfo(form.tipo_disparo === 'PROGRAMADO'
        ? 'Campaña programada. El servidor la envía a la hora indicada.'
        : 'Campaña guardada. Pulsa «Enviar ahora» cuando quieras lanzarla.');
      setForm(campanaVacia()); setEditando(null);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo guardar la campaña.');
    } finally {
      setGuardando(false);
    }
  };

  const editar = (c) => {
    setEditando(c.id_campana);
    setForm({
      nombre: c.nombre,
      segmento: c.segmento,
      dias: c.dias_inactividad ?? '',
      canal: c.canal,
      id_plantilla: c.id_plantilla || '',
      mensaje: c.mensaje,
      tipo_disparo: c.tipo_disparo === 'PROGRAMADO' ? 'PROGRAMADO' : 'MANUAL',
      fecha_programada: c.fecha_programada || mananaALas8(),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const verDestinatarios = async (c) => {
    setError('');
    try {
      const { data } = await api.get(`/admin/campanas/${c.id_campana}/destinatarios`);
      setDetalle(data);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los destinatarios.');
    }
  };

  const ejecutar = async (c) => {
    if (!window.confirm(`¿Enviar ahora «${c.nombre}»? Se calcula el segmento en este momento.`)) return;
    setError(''); setInfo('');
    try {
      const { data } = await api.post(`/admin/campanas/${c.id_campana}/ejecutar`);
      const r = data.resumen;
      setInfo(`«${c.nombre}»: ${r.destinatarios} destinatarios · ${r.enviados} enviados · ${r.pendientes} por enviar a mano · ${r.fallidos} fallidos.`);
      await cargar();
      if (r.pendientes > 0) await verDestinatarios(c);
    } catch (err) {
      setError(err.message || 'No se pudo enviar la campaña.');
    }
  };

  const cancelar = async (c) => {
    if (!window.confirm(`¿Cancelar «${c.nombre}»?`)) return;
    try {
      await api.post(`/admin/campanas/${c.id_campana}/cancelar`);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo cancelar la campaña.');
    }
  };

  // WhatsApp a mano: abre wa.me con el texto y deja constancia (envio_mensaje).
  const enviarWhatsapp = async (d) => {
    window.open(`https://wa.me/${d.telefono}?text=${encodeURIComponent(d.mensaje)}`, '_blank', 'noopener,noreferrer');
    setEnviados((prev) => new Set(prev).add(d.id_miembro));
    try {
      await api.post(`/admin/campanas/${detalle.campana.id_campana}/destinatarios/${d.id_miembro}/enviado`, { mensaje: d.mensaje });
      const { data } = await api.get(`/admin/campanas/${detalle.campana.id_campana}/destinatarios`);
      setDetalle(data);
      cargar();
    } catch (err) {
      setError(err.message || 'Se abrió WhatsApp, pero no se pudo dejar constancia del envío.');
    }
  };

  const crearPlantilla = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/admin/plantillas', nuevaPlantilla);
      setNuevaPlantilla(plantillaVacia);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo crear la plantilla.');
    }
  };

  const cambiarPlantilla = async (p) => {
    try {
      await api.put(`/admin/plantillas/${p.id_plantilla}`, { activa: !p.activa });
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la plantilla.');
    }
  };

  return (
    <PageTransition>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-head__title">Campañas</h1>
          <p className="admin-page-head__lead">
            Mensajes a grupos de miembros: inactivos, nuevos o próximos a vencer. Envíalos ya o prográmalos.
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
            <h3>{editando ? 'Editar campaña' : 'Nueva campaña'}</h3>
            <p>
              {previa
                ? `Hoy la recibirían ${previa.total} ${previa.total === 1 ? 'miembro' : 'miembros'} (${previa.con_telefono} con teléfono, ${previa.con_correo} con correo).`
                : 'Elige a quién va dirigida.'}
            </p>
          </div>
        </header>
        <form className="auth-form" onSubmit={guardar} noValidate>
          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Nombre</span>
              <input className="field-input" maxLength={150} placeholder="Recuperar inactivos de noviembre" {...campo('nombre')} />
            </label>
            <label className="field">
              <span className="field-label">Segmento</span>
              <select className="field-input" {...campo('segmento')}>
                {segmentos.map((s) => <option key={s.valor} value={s.valor}>{s.etiqueta}</option>)}
              </select>
            </label>
            {form.segmento !== 'TODOS' && (
              <label className="field">
                <span className="field-label">
                  {form.segmento === 'INACTIVOS' ? 'Días sin venir' : form.segmento === 'NUEVOS' ? 'Registrados hace (días)' : 'Vence en (días)'}
                </span>
                <input className="field-input" type="number" min="0" max="365"
                  placeholder={String(segmentoActual?.dias ?? '')} {...campo('dias')} />
              </label>
            )}
          </div>
          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Canal</span>
              <select className="field-input" {...campo('canal')}>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">Correo</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Plantilla</span>
              <select className="field-input" value={form.id_plantilla} onChange={(e) => elegirPlantilla(e.target.value)}>
                <option value="">— Escribir el mensaje —</option>
                {plantillasActivas.map((p) => <option key={p.id_plantilla} value={p.id_plantilla}>{p.nombre}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Envío</span>
              <select className="field-input" {...campo('tipo_disparo')}>
                <option value="MANUAL">Cuando yo lo lance</option>
                <option value="PROGRAMADO">Programado</option>
              </select>
            </label>
            {form.tipo_disparo === 'PROGRAMADO' && (
              <label className="field">
                <span className="field-label">Fecha y hora (Colombia)</span>
                <input className="field-input" type="datetime-local" {...campo('fecha_programada')} />
              </label>
            )}
          </div>
          <label className="field">
            <span className="field-label">Mensaje</span>
            <textarea className="field-input" rows={4} maxLength={2000} {...campo('mensaje')}
              placeholder="Hola {primer_nombre}, te extrañamos en {gimnasio}..." />
          </label>
          <small style={{ display: 'block', color: 'var(--on-surface-variant)' }}>
            Variables: {'{primer_nombre}'} {'{nombre}'} {'{gimnasio}'} {'{dias_sin_venir}'} {'{fecha_vencimiento}'}
          </small>
          {textoMensaje && (
            <div className="vista-mensaje" style={{ marginTop: 8 }} aria-label="Vista previa del mensaje">
              {vistaPrevia(textoMensaje)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={guardando || form.nombre.trim().length < 3 || textoMensaje.trim().length < 5}>
              <span className="material-symbols-outlined icon">{form.tipo_disparo === 'PROGRAMADO' ? 'schedule_send' : 'save'}</span>
              {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : form.tipo_disparo === 'PROGRAMADO' ? 'Programar' : 'Guardar campaña'}
            </button>
            {editando && (
              <button type="button" className="btn btn-ghost" onClick={() => { setEditando(null); setForm(campanaVacia()); }}>
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="chart-card anim-scale-in" style={{ maxWidth: 900, marginTop: 24 }}>
        <header className="chart-card__head">
          <div>
            <h3>Campañas</h3>
            <p>Las programadas salen solas a su hora; las demás, cuando pulses «Enviar ahora».</p>
          </div>
        </header>
        {cargando && <div className="bar-loader" />}
        {!cargando && campanas.length === 0 && <p>Todavía no hay campañas.</p>}
        <div className="lista-tarjetas">
          {campanas.map((c) => {
            const est = ESTADOS[c.estado] || ESTADOS.PROGRAMADA;
            const seg = segmentos.find((s) => s.valor === c.segmento);
            return (
              <article key={c.id_campana} className="tarjeta-fila" style={{ opacity: c.estado === 'CANCELADA' ? 0.6 : 1 }}>
                <div className="tarjeta-fila__texto">
                  <strong>{c.nombre}</strong> <span className={est.cls}>{est.texto}</span>
                  <small>
                    {seg ? seg.etiqueta : c.segmento}{c.dias_inactividad != null ? ` (${c.dias_inactividad} días)` : ''} · {c.canal === 'EMAIL' ? 'Correo' : 'WhatsApp'}
                    {c.tipo_disparo === 'PROGRAMADO' && c.fecha_programada ? ` · programada ${c.fecha_programada.replace('T', ' ')}` : ''}
                    {c.fecha_ejecucion ? ` · enviada ${c.fecha_ejecucion.replace('T', ' ')}` : ''}
                  </small>
                  {c.estado === 'ENVIADA' && (
                    <small>{c.destinatarios} destinatarios · {c.enviados} enviados · {c.pendientes} por enviar · {c.fallidos} fallidos</small>
                  )}
                </div>
                <div className="tarjeta-fila__acciones">
                  {c.estado === 'PROGRAMADA' && (
                    <>
                      <button type="button" className="btn btn-primary" onClick={() => ejecutar(c)}>
                        <span className="material-symbols-outlined icon">send</span> Enviar ahora
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => editar(c)}>
                        <span className="material-symbols-outlined icon">edit</span> Editar
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => cancelar(c)}>
                        <span className="material-symbols-outlined icon">block</span> Cancelar
                      </button>
                    </>
                  )}
                  {c.estado === 'ENVIADA' && (
                    <button type="button" className="btn btn-ghost" onClick={() => verDestinatarios(c)}>
                      <span className="material-symbols-outlined icon">group</span> Destinatarios
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="chart-card anim-scale-in" style={{ maxWidth: 900, marginTop: 24 }}>
        <header className="chart-card__head">
          <div>
            <h3>Plantillas de mensaje</h3>
            <p>Textos reutilizables para tus campañas.</p>
          </div>
        </header>
        <div className="lista-tarjetas" style={{ marginBottom: 16 }}>
          {plantillas.length === 0 && <p>Todavía no hay plantillas.</p>}
          {plantillas.map((p) => (
            <article key={p.id_plantilla} className="tarjeta-fila" style={{ opacity: p.activa ? 1 : 0.55 }}>
              <div className="tarjeta-fila__texto">
                <strong>{p.nombre}</strong>
                <small>{p.contenido}</small>
              </div>
              <div className="tarjeta-fila__acciones">
                <button type="button" className="btn btn-ghost" onClick={() => cambiarPlantilla(p)}>
                  {p.activa ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </article>
          ))}
        </div>
        <form className="auth-form" onSubmit={crearPlantilla} noValidate>
          <label className="field">
            <span className="field-label">Nombre de la plantilla</span>
            <input className="field-input" maxLength={100} value={nuevaPlantilla.nombre}
              onChange={(e) => setNuevaPlantilla({ ...nuevaPlantilla, nombre: e.target.value })} placeholder="Te extrañamos" />
          </label>
          <label className="field">
            <span className="field-label">Texto</span>
            <textarea className="field-input" rows={3} maxLength={2000} value={nuevaPlantilla.contenido}
              onChange={(e) => setNuevaPlantilla({ ...nuevaPlantilla, contenido: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-secondary" style={{ marginTop: 8 }}
            disabled={nuevaPlantilla.nombre.trim().length < 3 || nuevaPlantilla.contenido.trim().length < 5}>
            <span className="material-symbols-outlined icon">add</span> Agregar plantilla
          </button>
        </form>
      </section>

      <Modal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        title={detalle ? `Destinatarios de «${detalle.campana.nombre}»` : ''}
        footer={<button type="button" className="btn btn-ghost" onClick={() => setDetalle(null)}>Cerrar</button>}
      >
        {detalle && detalle.destinatarios.length === 0 && <p>Nadie cayó en el segmento cuando se envió.</p>}
        {detalle && detalle.destinatarios.length > 0 && (
          <div className="lista-tarjetas">
            {detalle.destinatarios.map((d) => (
              <div key={d.id_campana_destinatario} className="tarjeta-fila">
                <div className="tarjeta-fila__texto">
                  <strong>{d.nombre}</strong>{' '}
                  <span className={d.estado_envio === 'ENVIADO' ? 'badge badge--ok' : d.estado_envio === 'FALLIDO' ? 'badge badge--err' : 'badge badge--warn'}>
                    {d.estado_envio === 'ENVIADO' ? 'Enviado' : d.estado_envio === 'FALLIDO' ? 'Falló' : 'Por enviar'}
                  </span>
                  <small>{d.mensaje}</small>
                </div>
                {detalle.campana.canal === 'WHATSAPP' && d.estado_envio !== 'ENVIADO' && (
                  <div className="tarjeta-fila__acciones">
                    {d.telefono ? (
                      <button type="button" className="btn btn-ghost" onClick={() => enviarWhatsapp(d)}>
                        <IconoWhatsapp /> {enviados.has(d.id_miembro) ? 'Abierto' : 'WhatsApp'}
                      </button>
                    ) : (
                      <small>Sin teléfono</small>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </PageTransition>
  );
}
