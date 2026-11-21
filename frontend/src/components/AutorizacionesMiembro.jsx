/**
 * components/AutorizacionesMiembro.jsx
 *
 * Piezas del formulario de miembros para RQNF-17 (Ley 1581 de 2012, arts. 6
 * y 7; Decreto 1377 de 2013, arts. 6, 7 y 12):
 *
 *   - RepresentanteCampos: datos del representante legal de un menor.
 *   - CasillaDatosSensibles: autorizacion separada y opcional para tratar
 *     condiciones medicas y alergias, con el texto de que no es obligatoria.
 *   - HistorialAutorizaciones: la prueba de cada autorizacion (fecha,
 *     version del texto, canal y quien la registro).
 *   - CasillaMensajesComerciales: RQNF-16 (Ley 2300 de 2023), el interruptor
 *     de mensajes comerciales con sus canales.
 *
 * Las usan el alta y la edicion de MiembrosPage. Los textos vienen de
 * lib/autorizaciones.js, que son los mismos que guarda el backend.
 */
import {
  TEXTOS_AUTORIZACION, NOMBRES_AUTORIZACION, TIPOS_DOC_REPRESENTANTE, PARENTESCOS,
} from '../lib/autorizaciones';

function ErrorTexto({ msg }) {
  if (!msg) return null;
  return (
    <span className="field-error" role="alert">
      <span className="material-symbols-outlined icon">error</span>
      {msg}
    </span>
  );
}

/**
 * Datos del representante legal. `valores` es el formulario completo y
 * `onChange(campo, valor)` cambia un campo.
 */
export function RepresentanteCampos({ valores, onChange, errores = {}, edad }) {
  const clase = (campo) => `field-input${errores[campo] ? ' field-input--error' : ''}`;
  return (
    <div className="legal-bloque" style={{ border: '1px solid var(--primary)', borderRadius: 'var(--radius)', padding: 14, margin: '8px 0 12px' }}>
      <p style={{ margin: '0 0 10px', fontSize: 13 }}>
        <span className="material-symbols-outlined icon" style={{ verticalAlign: 'middle', marginRight: 6 }}>family_restroom</span>
        {edad !== null && edad !== undefined ? `El miembro tiene ${edad} años: ` : 'El miembro es menor de edad: '}
        los datos y la autorización de su representante legal son obligatorios.
      </p>
      <div className="auth-form-row">
        <label className="field" style={{ flex: 2 }}>
          <span className="field-label">Nombre del representante legal *</span>
          <input
            className={clase('representante_nombre')}
            value={valores.representante_nombre || ''}
            onChange={(e) => onChange('representante_nombre', e.target.value)}
            placeholder="Nombre y apellido"
            aria-invalid={errores.representante_nombre ? 'true' : undefined}
          />
          <ErrorTexto msg={errores.representante_nombre} />
        </label>
      </div>
      <div className="auth-form-row">
        <label className="field">
          <span className="field-label">Tipo de documento *</span>
          <select
            className={clase('representante_tipo_documento')}
            value={valores.representante_tipo_documento || ''}
            onChange={(e) => onChange('representante_tipo_documento', e.target.value)}
          >
            <option value="">Seleccionar...</option>
            {TIPOS_DOC_REPRESENTANTE.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <ErrorTexto msg={errores.representante_tipo_documento} />
        </label>
        <label className="field">
          <span className="field-label">Número de documento *</span>
          <input
            className={clase('representante_documento')}
            value={valores.representante_documento || ''}
            onChange={(e) => onChange('representante_documento', e.target.value)}
            placeholder="123456789"
            aria-invalid={errores.representante_documento ? 'true' : undefined}
          />
          <ErrorTexto msg={errores.representante_documento} />
        </label>
      </div>
      <div className="auth-form-row">
        <label className="field">
          <span className="field-label">Parentesco *</span>
          <select
            className={clase('representante_parentesco')}
            value={valores.representante_parentesco || ''}
            onChange={(e) => onChange('representante_parentesco', e.target.value)}
          >
            <option value="">Seleccionar...</option>
            {PARENTESCOS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <ErrorTexto msg={errores.representante_parentesco} />
        </label>
        <label className="field">
          <span className="field-label">Teléfono del representante *</span>
          <input
            className={clase('representante_telefono')}
            value={valores.representante_telefono || ''}
            onChange={(e) => onChange('representante_telefono', e.target.value)}
            placeholder="3001234567"
            inputMode="numeric"
            aria-invalid={errores.representante_telefono ? 'true' : undefined}
          />
          <ErrorTexto msg={errores.representante_telefono} />
        </label>
      </div>
    </div>
  );
}

/** Casilla con el texto completo de una autorizacion. */
export function CasillaAutorizacion({ tipo, checked, onChange, obligatoria = false, error, nota }) {
  return (
    <label className="field" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 4 }}
        aria-describedby={`texto-autorizacion-${tipo}`}
      />
      <span className="field-label" style={{ margin: 0, fontSize: 13, fontWeight: 400, lineHeight: 1.45 }}>
        <strong>{NOMBRES_AUTORIZACION[tipo]}{obligatoria ? ' *' : ' (opcional)'}.</strong>{' '}
        <span id={`texto-autorizacion-${tipo}`}>{TEXTOS_AUTORIZACION[tipo]}</span>
        {nota && <span style={{ display: 'block', marginTop: 4, color: 'var(--on-surface-variant)' }}>{nota}</span>}
        <ErrorTexto msg={error} />
      </span>
    </label>
  );
}

/**
 * Autorizacion de datos sensibles. Es opcional: si no se marca, el backend
 * no guarda condiciones medicas ni alergias.
 */
export function CasillaDatosSensibles({ checked, onChange, menor = false, aviso }) {
  return (
    <div style={{ background: 'var(--surface-container-low)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 12 }}>
      <CasillaAutorizacion
        tipo="DATOS_SENSIBLES"
        checked={checked}
        onChange={onChange}
        nota={menor ? 'El miembro es menor de edad: esta autorización la da su representante legal.' : null}
      />
      <p className="field-hint" style={{ margin: 0 }}>
        {checked
          ? 'Las condiciones médicas y las alergias se guardarán solo para cuidar la seguridad del miembro.'
          : 'Sin esta autorización no se guardan condiciones médicas ni alergias. No es obligatoria: la membresía no depende de ella.'}
      </p>
      {aviso && (
        <div className="alert alert-warning" role="status" style={{ marginTop: 10, marginBottom: 0 }}>
          <span className="material-symbols-outlined icon">info</span>
          <span>{aviso}</span>
        </div>
      )}
    </div>
  );
}

const CANALES_COMERCIALES = [
  { valor: 'WHATSAPP', etiqueta: 'WhatsApp' },
  { valor: 'EMAIL', etiqueta: 'Correo' },
];

/**
 * RQNF-16 (Ley 2300 de 2023, arts. 2 y 5): interruptor de mensajes
 * comerciales y canales. Es opcional y va apagado por defecto: solo se
 * enciende si el miembro (o su representante, si es menor) lo acepta. Al
 * apagarlo y guardar, el miembro deja de recibir campañas y mensajes de
 * retencion; queda constancia en el historial.
 *
 *   checked / onChange(bool)         acepta o no
 *   canales / onCanales(['WHATSAPP'])  por donde
 */
export function CasillaMensajesComerciales({ checked, onChange, canales = [], onCanales, menor = false, aviso }) {
  const marcado = (c) => (canales || []).includes(c);
  const alternarCanal = (c, valor) => {
    const nuevos = CANALES_COMERCIALES.map((x) => x.valor)
      .filter((x) => (x === c ? valor : marcado(x)));
    onCanales(nuevos);
  };
  const activar = (valor) => {
    onChange(valor);
    // Para aceptar hace falta un canal: si no hay, se propone WhatsApp.
    if (valor && (!canales || canales.length === 0)) onCanales(['WHATSAPP']);
  };
  return (
    <div style={{ background: 'var(--surface-container-low)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 12 }}>
      <label className="field" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <input
          type="checkbox"
          role="switch"
          aria-checked={Boolean(checked)}
          checked={Boolean(checked)}
          onChange={(e) => activar(e.target.checked)}
          style={{ marginTop: 4 }}
          aria-describedby="texto-autorizacion-MENSAJES_COMERCIALES"
        />
        <span className="field-label" style={{ margin: 0, fontSize: 13, fontWeight: 400, lineHeight: 1.45 }}>
          <strong>{NOMBRES_AUTORIZACION.MENSAJES_COMERCIALES} (opcional).</strong>{' '}
          <span id="texto-autorizacion-MENSAJES_COMERCIALES">{TEXTOS_AUTORIZACION.MENSAJES_COMERCIALES}</span>
          {menor && <span style={{ display: 'block', marginTop: 4, color: 'var(--on-surface-variant)' }}>El miembro es menor de edad: esta decisión la toma su representante legal.</span>}
        </span>
      </label>
      {checked && (
        <div style={{ display: 'flex', gap: 16, marginLeft: 26, marginBottom: 6 }} role="group" aria-label="Canales autorizados">
          {CANALES_COMERCIALES.map((c) => (
            <label key={c.valor} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={marcado(c.valor)}
                onChange={(e) => alternarCanal(c.valor, e.target.checked)}
              />
              {c.etiqueta}
            </label>
          ))}
        </div>
      )}
      <p className="field-hint" style={{ margin: 0 }}>
        {checked
          ? (canales && canales.length > 0
            ? 'Recibirá campañas y mensajes de retención solo por los canales marcados y en el horario de la Ley 2300.'
            : 'Marca al menos un canal o apaga los mensajes comerciales.')
          : 'Sin esta aceptación no recibe campañas ni mensajes de retención. Los avisos de su plan (vencimiento) sí le llegan.'}
      </p>
      {aviso && (
        <div className="alert alert-warning" role="status" style={{ marginTop: 10, marginBottom: 0 }}>
          <span className="material-symbols-outlined icon">info</span>
          <span>{aviso}</span>
        </div>
      )}
    </div>
  );
}

const CANALES = { PANEL: 'panel del gimnasio', APP: 'app del miembro', ENLACE: 'enlace de baja' };
const NOMBRE_CANAL_COMERCIAL = { WHATSAPP: 'WhatsApp', EMAIL: 'correo' };

/** Historial de autorizaciones (lo mas reciente primero). */
export function HistorialAutorizaciones({ historial }) {
  if (!historial || historial.length === 0) {
    return <p className="field-hint">Todavía no hay autorizaciones registradas para este miembro.</p>;
  }
  return (
    <ul style={{ fontSize: 12, color: 'var(--on-surface-variant)', paddingLeft: 18, margin: '4px 0 12px' }}>
      {historial.map((a, i) => (
        <li key={`${a.tipo}-${a.fecha}-${i}`}>
          {new Date(a.fecha).toLocaleString('es-CO')}
          {' · '}{NOMBRES_AUTORIZACION[a.tipo] || a.tipo}
          {': '}<strong>{a.otorgada ? 'otorgada' : (['DATOS_SENSIBLES', 'MENSAJES_COMERCIALES'].includes(a.tipo) ? 'no otorgada o revocada' : 'no otorgada')}</strong>
          {a.otorgada && Array.isArray(a.canales) && a.canales.length > 0
            ? ` (${a.canales.map((c) => NOMBRE_CANAL_COMERCIAL[c] || c).join(' y ')})` : ''}
          {` · texto ${a.version} · ${CANALES[a.canal] || a.canal}`}
          {a.detalle?.motivo === 'MAYOR_DE_EDAD' ? ' · cumplió 18 años' : ''}
          {a.registrada_por ? ` · registró ${a.registrada_por}` : ''}
          {a.detalle?.otorgada_por === 'REPRESENTANTE_LEGAL' ? ' · por el representante legal' : ''}
        </li>
      ))}
    </ul>
  );
}
