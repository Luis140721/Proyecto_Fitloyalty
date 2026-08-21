import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import LegalLayout from '../components/LegalLayout';

export default function EliminarCuentaPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!confirm) { setError('Debes marcar la casilla de confirmación.'); return; }
    setError('');
    setSubmitting(true);
    try {
      await api.delete('/auth/account', { data: { reason } });
      logout();
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo procesar la solicitud. Escríbenos a datos@fitloyalty.co.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LegalLayout
      title="Eliminar cuenta y datos"
      subtitle="Ejerce tu derecho de supresión conforme al artículo 15 de la Ley 1581 de 2012. Esta acción es irreversible."
      updated="20 de agosto de 2026"
    >
      <h2>¿Qué significa eliminar tu cuenta?</h2>
      <p>
        Al eliminar tu cuenta de FitLoyalty, se procederá a:
      </p>
      <ul>
        <li><strong>Eliminar permanentemente</strong> todos los datos del gimnasio: miembros, membresías, check-ins, usuarios de staff y configuraciones.</li>
        <li><strong>Revocar todos los tokens</strong> de acceso activos (JWT) de todos los usuarios del gimnasio.</li>
        <li><strong>Conservar logs de auditoría</strong> por 30 días por obligaciones legales, tras lo cual se destruyen.</li>
        <li><strong>Cancelar la facturación</strong> del plan activo de inmediato.</li>
      </ul>
      <div className="legal-callout">
        <div className="legal-callout__title">
          <span className="material-symbols-outlined">warning</span>
          Acción irreversible
        </div>
        <p>
          Una vez eliminados, los datos <strong>no se pueden recuperar</strong>. Si quieres volver a
          usar FitLoyalty, deberás crear una cuenta nueva desde cero. Si solo quieres pausar tu
          cuenta temporalmente, escríbenos a <a href="mailto:hola@fitloyalty.co">hola@fitloyalty.co</a>{' '}
          en lugar de eliminarla.
        </p>
      </div>

      <h2>Plazo de eliminación</h2>
      <p>
        La eliminación se procesa en un plazo máximo de <strong>10 días hábiles</strong> conforme al
        artículo 14 del Decreto 1377 de 2013. Durante ese período, la cuenta queda inaccesible pero
        los datos pueden existir en backups que se destruyen 30 días después.
      </p>

      <h2>Derecho de los miembros del gimnasio</h2>
      <p>
        Si eres el Administrador, al eliminar la cuenta también se eliminan los datos de todos los
        miembros registrados. Si un miembro desea ejercer su derecho de supresión de forma
        individual sin eliminar toda la cuenta del gimnasio, debe solicitarlo directamente al
        gimnasio, quien lo gestionará desde la sección de Miembros.
      </p>

      {done ? (
        <>
          <h2>Solicitud recibida</h2>
          <div className="legal-callout">
            <div className="legal-callout__title">
              <span className="material-symbols-outlined">check_circle</span>
              Cuenta en proceso de eliminación
            </div>
            <p>
              Tu solicitud se ha procesado correctamente. La eliminación completa se completará en
              un máximo de 10 días hábiles. Has sido cerrado sesión. Si tienes dudas, escribe a{' '}
              <a href="mailto:datos@fitloyalty.co">datos@fitloyalty.co</a>.
            </p>
          </div>
          <div style={{ marginTop: 24 }}>
            <Link to="/" className="btn btn-primary">
              <span className="material-symbols-outlined icon">home</span>
              Volver al inicio
            </Link>
          </div>
        </>
      ) : (
        <>
          <h2>Solicitar eliminación</h2>
          {user ? (
            <form onSubmit={onSubmit} className="legal-delete-form" noValidate>
              {error && (
                <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
                  <span className="material-symbols-outlined icon">error</span>
                  <span>{error}</span>
                </div>
              )}
              <label className="field" style={{ marginBottom: 16 }}>
                <span className="field-label">Motivo (opcional)</span>
                <textarea
                  className="field-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Cuéntanos por qué eliminas tu cuenta. Nos ayuda a mejorar."
                  rows={3}
                  style={{ resize: 'vertical', fontFamily: 'var(--font-body)' }}
                />
              </label>
              <label className="legal-checkbox">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />
                <span>
                  Entiendo que esta acción es <strong>irreversible</strong> y que todos los datos
                  del gimnasio <strong>"{user?.gymName || user?.name}"</strong> serán eliminados
                  permanentemente, incluyendo miembros, membresías y check-ins.
                </span>
              </label>
              <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !confirm}
                  style={{ background: 'var(--error)', borderColor: 'var(--error)' }}
                >
                  <span className="material-symbols-outlined icon">delete_forever</span>
                  {submitting ? 'Procesando...' : 'Eliminar cuenta definitivamente'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => navigate(-1)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="legal-callout">
              <div className="legal-callout__title">
                <span className="material-symbols-outlined">login</span>
                Inicia sesión para eliminar tu cuenta
              </div>
              <p>
                Para proteger tu cuenta, solo el Administrador del gimnasio puede solicitar la
                eliminación.{' '}
                <Link to="/login">Inicia sesión</Link> y vuelve a esta página.
              </p>
            </div>
          )}
        </>
      )}

      <h2>Contacto</h2>
      <p>
        Si prefieres que eliminemos tu cuenta manualmente o tienes dudas sobre el proceso, escríbenos
        a <a href="mailto:datos@fitloyalty.co">datos@fitloyalty.co</a> con el asunto "Eliminar
        cuenta" e incluye el nombre de tu gimnasio.
      </p>
    </LegalLayout>
  );
}
