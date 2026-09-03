import { useEffect, useState } from 'react';
import { api } from '../api';
import PageTransition from '../components/PageTransition';
import Ripple from '../components/Ripple';

export default function ConfigPage() {
  const [config, setConfig] = useState({
    plan_mensual_valor: 0,
    plan_trimestral_valor: 0,
    plan_semestral_valor: 0,
    plan_anual_valor: 0,
    plan_clases_suelta_valor: 0,
    plan_ilimitado_valor: 0,
    recordatorio_cobro_activo: true,
    dias_recordatorio_default: 7,
    dias_prueba: 7,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/config');
      setConfig(data.config);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la configuración.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfig(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const { data } = await api.put('/admin/config', config);
      setSuccess('Configuración guardada exitosamente.');
      setConfig(data.config);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  const crearRipple = Ripple({ opacity: 0.35 });

  if (loading) {
    return (
      <PageTransition>
        <div style={{ textAlign: 'center', padding: 100 }}>
          <span className="material-symbols-outlined anim-spin" style={{ fontSize: 48 }}>refresh</span>
          <p style={{ marginTop: 20 }}>Cargando configuración...</p>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-head__title">Configuración del Gimnasio</h1>
          <p className="admin-page-head__lead">
            Define los precios de los planes y configuraciones por defecto para el registro de miembros.
          </p>
        </div>
      </header>

      {error && (
        <div className="alert alert-error anim-scale-in" role="alert" style={{ marginBottom: 24 }}>
          <span className="material-symbols-outlined icon">error</span>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert alert-success anim-scale-in" role="alert" style={{ marginBottom: 24 }}>
          <span className="material-symbols-outlined icon">check_circle</span>
          <span>{success}</span>
        </div>
      )}

      <section className="chart-card anim-scale-in" style={{ maxWidth: 800 }}>
        <header className="chart-card__head">
          <div>
            <h3>Precios de Planes</h3>
            <p>Estos valores se usarán como sugerencia al registrar nuevos miembros.</p>
          </div>
        </header>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Plan Mensual</span>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: 8, color: 'var(--on-surface-variant)' }}>$</span>
                <input
                  className="field-input"
                  type="number"
                  value={config.plan_mensual_valor || ''}
                  onChange={(e) => setConfig({ ...config, plan_mensual_valor: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
            </label>
            <label className="field">
              <span className="field-label">Plan Trimestral</span>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: 8, color: 'var(--on-surface-variant)' }}>$</span>
                <input
                  className="field-input"
                  type="number"
                  value={config.plan_trimestral_valor || ''}
                  onChange={(e) => setConfig({ ...config, plan_trimestral_valor: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
            </label>
          </div>

          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Plan Semestral</span>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: 8, color: 'var(--on-surface-variant)' }}>$</span>
                <input
                  className="field-input"
                  type="number"
                  value={config.plan_semestral_valor || ''}
                  onChange={(e) => setConfig({ ...config, plan_semestral_valor: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
            </label>
            <label className="field">
              <span className="field-label">Plan Anual</span>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: 8, color: 'var(--on-surface-variant)' }}>$</span>
                <input
                  className="field-input"
                  type="number"
                  value={config.plan_anual_valor || ''}
                  onChange={(e) => setConfig({ ...config, plan_anual_valor: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
            </label>
          </div>

          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Clases Sueltas</span>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: 8, color: 'var(--on-surface-variant)' }}>$</span>
                <input
                  className="field-input"
                  type="number"
                  value={config.plan_clases_suelta_valor || ''}
                  onChange={(e) => setConfig({ ...config, plan_clases_suelta_valor: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
            </label>
            <label className="field">
              <span className="field-label">Plan Ilimitado</span>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: 8, color: 'var(--on-surface-variant)' }}>$</span>
                <input
                  className="field-input"
                  type="number"
                  value={config.plan_ilimitado_valor || ''}
                  onChange={(e) => setConfig({ ...config, plan_ilimitado_valor: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
            </label>
          </div>

          <header className="chart-card__head" style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <h3>Recordatorios de Cobro</h3>
              <p>Configuración para notificaciones de vencimiento de planes.</p>
            </div>
          </header>

          <div className="auth-form-row">
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={config.recordatorio_cobro_activo}
                onChange={(e) => setConfig({ ...config, recordatorio_cobro_activo: e.target.checked })}
              />
              <span className="field-label" style={{ margin: 0 }}>Activar recordatorios de cobro</span>
            </label>
            <label className="field">
              <span className="field-label">Días antes del vencimiento</span>
              <input
                className="field-input"
                type="number"
                value={config.dias_recordatorio_default || 7}
                onChange={(e) => setConfig({ ...config, dias_recordatorio_default: parseInt(e.target.value) || 7 })}
                min="1"
                max="30"
                disabled={!config.recordatorio_cobro_activo}
              />
            </label>
          </div>

          <header className="chart-card__head" style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <h3>Configuración General</h3>
              <p>Configuraciones generales del sistema.</p>
            </div>
          </header>

          <label className="field">
            <span className="field-label">Días de prueba para nuevos gimnasios</span>
            <input
              className="field-input"
              type="number"
              value={config.dias_prueba || 7}
              onChange={(e) => setConfig({ ...config, dias_prueba: parseInt(e.target.value) || 7 })}
              min="1"
              max="90"
            />
          </label>

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button
              type="submit"
              className="btn btn-primary btn-lg ripple-host"
              onClick={crearRipple}
              disabled={saving}
            >
              <span className="material-symbols-outlined icon">save</span>
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-lg"
              onClick={loadConfig}
              disabled={loading}
            >
              <span className="material-symbols-outlined icon">refresh</span>
              Restablecer
            </button>
          </div>
        </form>
      </section>
    </PageTransition>
  );
}
