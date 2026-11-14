import { useEffect, useState } from 'react';
import { api } from '../api';

const TIPOS = {
  RACHA: 'Racha (días seguidos)',
  TOTAL_ASISTENCIAS: 'Total de asistencias',
};

const VACIO = { nombre: '', tipo_hito: 'RACHA', valor_objetivo: 7, mensaje: '' };

/**
 * Configuración básica de hitos (RQF-11): los que se otorgan en el check-in.
 */
export default function HitosConfig() {
  const [hitos, setHitos] = useState([]);
  const [nuevo, setNuevo] = useState(VACIO);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      const { data } = await api.get('/admin/hitos');
      setHitos(data.hitos || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los hitos.');
    }
  };

  useEffect(() => { cargar(); }, []);

  const crear = async (e) => {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      await api.post('/admin/hitos', { ...nuevo, valor_objetivo: Number(nuevo.valor_objetivo) });
      setNuevo(VACIO);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo crear el hito.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarActivo = async (h) => {
    setError('');
    try {
      await api.put(`/admin/hitos/${h.id_hito}`, { activo: !h.activo });
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el hito.');
    }
  };

  return (
    <section className="chart-card anim-scale-in" style={{ maxWidth: 800, marginTop: 24 }}>
      <header className="chart-card__head">
        <div>
          <h3>Hitos de los miembros</h3>
          <p>Se otorgan solos en el check-in cuando el miembro llega a la racha o al total de asistencias.</p>
        </div>
      </header>

      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
          <span className="material-symbols-outlined icon">error</span>
          <span>{error}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {hitos.length === 0 && <p>Todavía no hay hitos. Crea el primero abajo.</p>}
        {hitos.map((h) => (
          <div key={h.id_hito} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, opacity: h.activo ? 1 : 0.55 }}>
            <span style={{ lineHeight: 1.4 }}>
              <strong>{h.nombre}</strong>
              <small style={{ display: 'block' }}>
                {TIPOS[h.tipo_hito]}: {h.valor_objetivo} · {h.mensaje}
              </small>
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => cambiarActivo(h)}>
              {h.activo ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        ))}
      </div>

      <form className="auth-form" onSubmit={crear} noValidate>
        <div className="auth-form-row">
          <label className="field">
            <span className="field-label">Nombre</span>
            <input className="field-input" value={nuevo.nombre} maxLength={100}
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Primera semana" />
          </label>
          <label className="field">
            <span className="field-label">Tipo</span>
            <select className="field-input" value={nuevo.tipo_hito}
              onChange={(e) => setNuevo({ ...nuevo, tipo_hito: e.target.value })}>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Meta</span>
            <input className="field-input" type="number" min="1" max="10000" value={nuevo.valor_objetivo}
              onChange={(e) => setNuevo({ ...nuevo, valor_objetivo: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Mensaje que ve el miembro</span>
          <input className="field-input" value={nuevo.mensaje} maxLength={300}
            onChange={(e) => setNuevo({ ...nuevo, mensaje: e.target.value })} placeholder="¡7 días seguidos! Sigue así." />
        </label>
        <div style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn-secondary" disabled={guardando || !nuevo.nombre.trim() || !nuevo.mensaje.trim()}>
            <span className="material-symbols-outlined icon">add</span>
            {guardando ? 'Guardando...' : 'Agregar hito'}
          </button>
        </div>
      </form>
    </section>
  );
}
