import { useEffect, useMemo, useState, useRef } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { api } from '../api';
import CardGlass from '../components/CardGlass';
import BadgeEstado, { estadoDeMiembro } from '../components/BadgeEstado';
import EmptyState from '../components/EmptyState';
import PageTransition from '../components/PageTransition';
import Modal from '../components/Modal';
import Ripple from '../components/Ripple';
import QRCode from 'qrcode';

// Componente personalizado para input de fecha con formato automático DD/MM/YYYY
function DateInputWithAutoFormat({ value, onChange, placeholder, ...props }) {
  const formatDateString = (input) => {
    // Remover todos los caracteres que no sean dígitos
    const cleaned = input.replace(/\D/g, '');
    
    // Limitar a 8 dígitos máximo
    const truncated = cleaned.slice(0, 8);
    
    // Aplicar formato DD/MM/YYYY
    let formatted = '';
    if (truncated.length > 0) {
      formatted += truncated.slice(0, 2);
    }
    if (truncated.length > 2) {
      formatted += '/' + truncated.slice(2, 4);
    }
    if (truncated.length > 4) {
      formatted += '/' + truncated.slice(4, 8);
    }
    
    return formatted;
  };

  const handleChange = (e) => {
    const rawValue = e.target.value;
    const formatted = formatDateString(rawValue);
    onChange(formatted);
  };

  return (
    <input
      {...props}
      type="text"
      value={value}
      onChange={handleChange}
      placeholder={placeholder || "DD/MM/YYYY"}
      maxLength={10}
      inputMode="numeric"
    />
  );
}

// Función para convertir DD/MM/YYYY a formato ISO (YYYY-MM-DD)
function convertToISODate(dateString) {
  if (!dateString || dateString.length !== 10) return dateString;
  
  const parts = dateString.split('/');
  if (parts.length !== 3) return dateString;
  
  const [day, month, year] = parts;
  return `${year}-${month}-${day}`;
}

// Función para convertir formato ISO a DD/MM/YYYY
function convertFromISODate(isoDate) {
  if (!isoDate || isoDate.length !== 10) return isoDate;
  
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

const empty = {
  // Datos personales
  nombre: '',
  tipo_documento: 'CC',
  documento: '',
  fecha_nacimiento: '',
  genero: '',
  telefono: '',
  email: '',
  direccion: '',
  // Salud y emergencia
  contacto_emergencia: '',
  telefono_emergencia: '',
  condiciones_medicas: '',
  alergias: '',
  // Plan y cobros
  tipo_plan: 'MENSUAL',
  fecha_inicio: '', // Fecha actual por defecto - se formateará automáticamente
  fecha_fin: '',
  valor_total: '',
  valor_pagado: '0',
  metodo_pago: 'EFECTIVO',
  referencia_pago: '',
  estado_pago: 'PENDIENTE',
  proxima_fecha_cobro: '',
  activar_recordatorio: false,
  dias_recordatorio: 7,
  // Info adicional
  objetivo: '',
  nivel_experiencia: '',
  observaciones: '',
  // Términos
  acepto_terminos: false,
  autorizo_datos: false,
  activo: true
};

const TIPOS_DOCUMENTO = ['CC', 'TI', 'NIT', 'CE', 'PP'];
const GENEROS = ['Masculino', 'Femenino', 'Otro', 'Prefiero no decir'];
const TIPOS_PLAN = ['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'CLASES_SUELTAS', 'ILIMITADO', 'OTRO'];
const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'PSE', 'NEQUI', 'DAVIPLATA', 'OTRO'];
const ESTADOS_PAGO = ['PENDIENTE', 'PAGADO', 'PARCIAL'];
const OBJETIVOS = ['Perder peso', 'Ganar músculo', 'Resistencia', 'Salud general', 'Mejorar postura', 'Otro'];
const NIVELES_EXPERIENCIA = ['Principiante', 'Intermedio', 'Avanzado'];
const FILTROS = [
  { id: 'todos',  label: 'Todos' },
  { id: 'al-dia', label: 'Al día' },
  { id: 'vence',  label: 'Vence pronto' },
  { id: 'vencido',label: 'Vencido' },
  { id: 'riesgo', label: 'En riesgo' },
  { id: 'desactivados', label: 'Desactivados' },
];

// Nota: el antiguo statusChip() se reemplazo por el componente <BadgeEstado />.

function SkeletonRows({ cols, rows = 6 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={`sk-${i}`} aria-hidden="true">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j}>
              <span
                className="skeleton"
                style={{ display: 'block', height: 14, width: j === 0 ? '60%' : '85%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function MiembrosPage() {
  const [items, setItems]   = useState([]);
  const [q, setQ]           = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(empty);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editQr, setEditQr] = useState('');      // imagen del QR en el detalle
  const [qrCopiado, setQrCopiado] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdMember, setCreatedMember] = useState(null);
  const [qrImage, setQrImage] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [activeSection, setActiveSection] = useState('personales');
  const [gymConfig, setGymConfig] = useState(null);
  const qrCanvasRef = useRef(null);

  // Confirm desactivar
  const [confirmDeactivate, setConfirmDeactivate] = useState(null); // miembro a desactivar
  // Confirm eliminar permanentemente
  const [confirmDelete, setConfirmDelete] = useState(null); // miembro a eliminar

  // Ripple handlers.
  const crearRipple = Ripple({ opacity: 0.30 });
  const guardarRipple = Ripple({ opacity: 0.30 });
  const desactivarRipple = Ripple({ opacity: 0.30 });

  const load = async (query = '', includeInactive = false) => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/miembros', { 
        params: { q: query, pageSize: 100, includeInactive } 
      });
      setItems(data.miembros);
    } catch (err) {
      setError(err.message || 'Error al cargar miembros.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Cargar configuración del gimnasio
  const loadGymConfig = async () => {
    try {
      const { data } = await api.get('/admin/config');
      setGymConfig(data.config);
    } catch (err) {
      console.error('No se pudo cargar la configuración del gimnasio:', err);
    }
  };

  useEffect(() => { loadGymConfig(); }, []);

  const onSearch = (e) => { e.preventDefault(); load(q, filtro === 'desactivados' ? true : false); };

  const toggleFiltro = (nuevoFiltro) => {
    setFiltro(nuevoFiltro);
    const includeInactive = nuevoFiltro === 'desactivados';
    load(q, includeInactive);
  };

  // Desactivar miembro (soft delete)
  const desactivar = async (id) => {
    try {
      await api.delete(`/admin/miembros/${id}`);
      setConfirmDeactivate(null);
      load(q, filtro === 'desactivados' ? true : false);
    } catch (err) {
      setError(err.message || 'No se pudo desactivar el miembro.');
    }
  };

  // Eliminar miembro permanentemente (hard delete)
  const eliminarPermanentemente = async (id) => {
    try {
      await api.delete(`/admin/miembros/${id}/permanent`);
      setConfirmDelete(null);
      load(q, filtro === 'desactivados' ? true : false);
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el miembro permanentemente.');
    }
  };

  const askDeactivate = (m) => setConfirmDeactivate(m);
  const askDelete = (m) => setConfirmDelete(m);

  const doDeactivate = async () => {
    const m = confirmDeactivate;
    if (!m) return;
    try {
      await api.delete(`/admin/miembros/${m.id_miembro}`);
      setConfirmDeactivate(null);
      load(q, filtro === 'desactivados' ? true : false);
    } catch (err) {
      setError(err.message || 'No se pudo desactivar el miembro.');
    }
  };

  const doDelete = async () => {
    const m = confirmDelete;
    if (!m) return;
    try {
      await api.delete(`/admin/miembros/${m.id_miembro}/permanent`);
      setConfirmDelete(null);
      load(q, filtro === 'desactivados' ? true : false);
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el miembro permanentemente.');
    }
  };

  // Calcular fecha fin automáticamente según tipo de plan
  const calcularFechaFin = (tipoPlan, fechaInicio) => {
    if (!fechaInicio) return '';
    
    // Convertir de DD/MM/YYYY a ISO si es necesario
    const isoDate = fechaInicio.includes('/') ? convertToISODate(fechaInicio) : fechaInicio;
    const inicio = new Date(isoDate);
    let dias = 30;
    
    switch (tipoPlan) {
      case 'MENSUAL': dias = 30; break;
      case 'TRIMESTRAL': dias = 90; break;
      case 'SEMESTRAL': dias = 180; break;
      case 'ANUAL': dias = 365; break;
      default: dias = 30;
    }
    
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + dias);
    const isoResult = fin.toISOString().split('T')[0];
    
    // Convertir de vuelta a DD/MM/YYYY
    return convertFromISODate(isoResult);
  };

  // Determinar estado del pago
  const determinarEstadoPago = (valorTotal, valorPagado) => {
    const total = parseFloat(valorTotal) || 0;
    const pagado = parseFloat(valorPagado) || 0;
    if (pagado >= total && total > 0) return 'PAGADO';
    if (pagado > 0) return 'PARCIAL';
    return 'PENDIENTE';
  };

  // Calcular próxima fecha de cobro
  const calcularProximaFechaCobro = (fechaFin) => {
    if (!fechaFin) return '';
    
    // Convertir de DD/MM/YYYY a ISO si es necesario
    const isoDate = fechaFin.includes('/') ? convertToISODate(fechaFin) : fechaFin;
    const fin = new Date(isoDate);
    const proxima = new Date(fin);
    proxima.setDate(proxima.getDate() + 1);
    const isoResult = proxima.toISOString().split('T')[0];
    
    // Convertir de vuelta a DD/MM/YYYY
    return convertFromISODate(isoResult);
  };

  // Manejar cambios en campos que afectan cálculos automáticos
  const handleFormChange = (field, value) => {
    const newForm = { ...form, [field]: value };
    
    // Si cambia tipo de plan, sugerir valor desde configuración
    if (field === 'tipo_plan' && gymConfig) {
      const valorKey = `plan_${value.toLowerCase()}_valor`;
      const valorSugerido = gymConfig[valorKey] || 0;
      newForm.valor_total = valorSugerido.toString();
    }
    
    // Si cambia tipo de plan o fecha inicio, recalcular fecha fin
    if (field === 'tipo_plan' || field === 'fecha_inicio') {
      const fechaFin = calcularFechaFin(
        field === 'tipo_plan' ? value : form.tipo_plan,
        field === 'fecha_inicio' ? value : form.fecha_inicio
      );
      newForm.fecha_fin = fechaFin;
      
      // Recalcular próxima fecha de cobro
      const proximaCobro = calcularProximaFechaCobro(fechaFin);
      newForm.proxima_fecha_cobro = proximaCobro;
    }
    
    // Si cambian valores de pago, recalcular estado
    if (field === 'valor_total' || field === 'valor_pagado') {
      const estadoPago = determinarEstadoPago(
        field === 'valor_total' ? value : form.valor_total,
        field === 'valor_pagado' ? value : form.valor_pagado
      );
      newForm.estado_pago = estadoPago;
    }
    
    setForm(newForm);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    
    // Validar términos
    if (!form.acepto_terminos) {
      setError('Debes aceptar los términos y condiciones.');
      return;
    }
    
    setSubmitting(true);
    setError('');
    
    try {
      const payload = { ...form };
      if (!payload.email) delete payload.email;
      
      // Convertir fechas de DD/MM/YYYY a formato ISO para el backend
      if (payload.fecha_inicio && payload.fecha_inicio.includes('/')) {
        payload.fecha_inicio = convertToISODate(payload.fecha_inicio);
      }
      if (payload.fecha_fin && payload.fecha_fin.includes('/')) {
        payload.fecha_fin = convertToISODate(payload.fecha_fin);
      }
      if (payload.fecha_nacimiento && payload.fecha_nacimiento.includes('/')) {
        payload.fecha_nacimiento = convertToISODate(payload.fecha_nacimiento);
      }
      if (payload.proxima_fecha_cobro && payload.proxima_fecha_cobro.includes('/')) {
        payload.proxima_fecha_cobro = convertToISODate(payload.proxima_fecha_cobro);
      }
      
      // Calcular fechas automáticamente si no están definidas
      if (!payload.fecha_inicio) {
        payload.fecha_inicio = new Date().toISOString().split('T')[0];
      }
      if (!payload.fecha_fin) {
        payload.fecha_fin = calcularFechaFin(payload.tipo_plan, payload.fecha_inicio);
      }
      if (!payload.estado_pago) {
        payload.estado_pago = determinarEstadoPago(payload.valor_total, payload.valor_pagado);
      }
      if (!payload.proxima_fecha_cobro) {
        payload.proxima_fecha_cobro = calcularProximaFechaCobro(payload.fecha_fin);
      }
      
      const { data } = await api.post('/admin/miembros', payload);
      
      // Generar QR visualmente - usar el código QR cifrado que viene del backend
      const qrImageUrl = await QRCode.toDataURL(data.miembro.codigo_qr);
      
      // Guardar la imagen del QR en base de datos
      try {
        await api.put(`/admin/miembros/${data.miembro.id_miembro}`, { qr_imagen: qrImageUrl });
      } catch (err) {
        console.error('No se pudo guardar la imagen del QR:', err);
      }
      
      setCreatedMember(data.miembro);
      setQrImage(qrImageUrl);
      setShowQRModal(true);
      setForm(empty);
      setOpen(false);
      load(q);
      setInfo('Miembro creado exitosamente.');
    } catch (err) {
      setError(err.message || 'No se pudo crear el miembro.');
    } finally {
      setSubmitting(false);
    }
  };

  // Generar enlace de WhatsApp
  const generarWhatsAppLink = () => {
    if (!createdMember) return '';
    // Limpiar el número de teléfono: remover espacios, guiones, paréntesis y el signo +
    const telefono = createdMember.telefono.replace(/[\s\-\(\)\+]/g, '');
    const mensaje = encodeURIComponent(
      `Hola ${createdMember.nombre}, bienvenido/a a tu gimnasio. Este es tu código de acceso personal. Muéstralo en la entrada cada vez que vengas.`
    );
    return `https://wa.me/${telefono}?text=${mensaje}`;
  };

  // Abre modal de edicion con el form prellenado.
  /**
   * Abre el detalle/edicion de un miembro.
   *
   * Pide el registro completo a la API en vez de usar el objeto de la lista:
   * la lista no trae todas las columnas, y si el formulario las precargara
   * vacias, al guardar las borraria. Tambien genera aqui la imagen del QR
   * para poder mostrarla junto al formulario.
   */
  const openEdit = async (m) => {
    setEditing(m);
    setEditError('');
    setEditQr('');
    // Precarga con lo que ya tenemos para que el modal abra sin espera.
    setEditForm({ ...empty, ...m, activo: m.activo !== false });
    setEditLoading(true);
    try {
      const { data } = await api.get(`/admin/miembros/${m.id_miembro}`);
      const full = data.miembro || m;
      setEditing(full);
      setEditForm({
        ...empty,
        ...full,
        // <input type="date"> necesita AAAA-MM-DD, no un ISO completo.
        fecha_nacimiento: full.fecha_nacimiento ? String(full.fecha_nacimiento).slice(0, 10) : '',
        activo: full.activo !== false,
      });
      if (full.codigo_qr) {
        try { setEditQr(await QRCode.toDataURL(full.codigo_qr)); }
        catch (_) { /* si falla el dibujo, igual mostramos el codigo en texto */ }
      }
    } catch (err) {
      setEditError(err.message || 'No pudimos cargar los datos completos del miembro.');
    } finally {
      setEditLoading(false);
    }
  };

  /** Copia el codigo QR al portapapeles y confirma en el propio boton. */
  const copiarCodigoQr = async () => {
    const codigo = editing?.codigo_qr;
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      setQrCopiado(true);
      setTimeout(() => setQrCopiado(false), 2000);
    } catch (_) {
      setEditError('Tu navegador bloqueó el portapapeles. Copia el código a mano.');
    }
  };

  const closeEdit = () => {
    if (editSaving) return;
    setEditing(null);
    setEditForm(empty);
    setEditError('');
    setEditQr('');
    setQrCopiado(false);
  };

  const onSaveEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setEditError('');
    setEditSaving(true);
    try {
      /* Solo se envian los campos que el backend acepta actualizar. El
         formulario arrastra claves del objeto `empty` (plan, pagos...) que
         viven en otras tablas: si se enviaran, zod rechazaria la peticion. */
      const EDITABLES = [
        'nombre', 'documento', 'telefono', 'email', 'activo',
        'tipo_documento', 'fecha_nacimiento', 'genero', 'codigo_pais_telefono',
        'ciudad', 'direccion', 'contacto_emergencia', 'telefono_emergencia',
        'condiciones_medicas', 'alergias', 'objetivo', 'nivel_experiencia',
        'observaciones',
      ];
      const payload = {};
      for (const k of EDITABLES) {
        if (editForm[k] !== undefined) payload[k] = editForm[k];
      }
      if (!payload.email) delete payload.email;
      await api.put(`/admin/miembros/${editing.id_miembro}`, payload);
      setEditing(null);
      setEditForm(empty);
      setEditQr('');
      setInfo('Miembro actualizado.');
      load(q);
    } catch (err) {
      setEditError(err.message || 'No se pudo actualizar.');
    } finally {
      setEditSaving(false);
    }
  };

  const filtrados = useMemo(() => {
    if (filtro === 'todos') return items;
    if (filtro === 'desactivados') return items.filter(m => !m.activo);
    return items.filter((m) => {
      if (filtro === 'al-dia')    return !m.vencido && !m.vencePronto && !m.enRiesgo;
      if (filtro === 'vence')     return !!m.vencePronto;
      if (filtro === 'vencido')   return !!m.vencido;
      if (filtro === 'riesgo')    return !!m.enRiesgo;
      return true;
    });
  }, [items, filtro]);

  const counts = useMemo(() => ({
    todos: items.filter(m => m.activo).length,
    'al-dia': items.filter((m) => m.activo && !m.vencido && !m.vencePronto && !m.enRiesgo).length,
    vence: items.filter((m) => m.activo && m.vencePronto).length,
    vencido: items.filter((m) => m.activo && m.vencido).length,
    riesgo: items.filter((m) => m.activo && m.enRiesgo).length,
    desactivados: items.filter(m => !m.activo).length,
  }), [items]);

  return (
    <PageTransition>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-head__title">Miembros</h1>
          <p className="admin-page-head__lead">Agrega, busca y gestiona a todos los miembros de tu gimnasio.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => load(q)} disabled={loading}>
            <span className="material-symbols-outlined icon">refresh</span>
            Actualizar
          </button>
          <button className="btn btn-primary" onClick={() => setOpen((o) => !o)}>
            <span className="material-symbols-outlined icon">{open ? 'close' : 'person_add'}</span>
            {open ? 'Cerrar' : 'Nuevo miembro'}
          </button>
        </div>
      </header>

      {error && (
        <div className="alert alert-error anim-scale-in" role="alert">
          <span className="material-symbols-outlined icon">error</span>
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div className="alert alert-success anim-scale-in" role="status">
          <span className="material-symbols-outlined icon">check_circle</span>
          <span>{info}</span>
        </div>
      )}

      {open && (
        <section className="chart-card anim-scale-in" style={{ marginBottom: 24 }}>
          <header className="chart-card__head">
            <div>
              <h3>Nuevo miembro</h3>
              <p>Completa el formulario para registrar un nuevo cliente con su plan de cobros.</p>
            </div>
          </header>
          
          {/* Navegación por secciones */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { id: 'personales', label: 'Datos personales' },
              { id: 'salud', label: 'Salud y emergencia' },
              { id: 'cobros', label: 'Plan y cobros' },
              { id: 'adicional', label: 'Info adicional' },
              { id: 'terminos', label: 'Términos' }
            ].map((section) => (
              <button
                key={section.id}
                type="button"
                className={`btn btn-ghost btn-sm ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
                style={{
                  backgroundColor: activeSection === section.id ? 'var(--primary)' : 'transparent',
                  color: activeSection === section.id ? 'white' : 'var(--on-surface)',
                  border: activeSection === section.id ? 'none' : '1px solid var(--border)',
                  fontWeight: activeSection === section.id ? 600 : 400
                }}
              >
                {section.label}
              </button>
            ))}
          </div>

          <form className="auth-form" onSubmit={onSubmit} noValidate style={{ maxWidth: 900 }}>
            {/* A) Datos personales */}
            {activeSection === 'personales' && (
              <div className="form-section anim-fade-up">
                <h4 style={{ marginBottom: 16, color: 'var(--primary)' }}>Datos personales</h4>
                <div className="auth-form-row">
                  <label className="field" style={{ flex: 2 }}>
                    <span className="field-label">Nombre completo *</span>
                    <input
                      className="field-input"
                      required value={form.nombre}
                      onChange={(e) => handleFormChange('nombre', e.target.value)}
                      placeholder="Nombre y apellido"
                      style={{ borderColor: !form.nombre && submitting ? 'var(--error)' : '' }}
                    />
                    {!form.nombre && submitting && (
                      <span style={{ color: 'var(--error)', fontSize: 12, marginTop: 4 }}>El nombre es requerido</span>
                    )}
                  </label>
                </div>
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Tipo documento *</span>
                    <select
                      className="field-input"
                      value={form.tipo_documento}
                      onChange={(e) => handleFormChange('tipo_documento', e.target.value)}
                      style={{ borderColor: !form.tipo_documento && submitting ? 'var(--error)' : '' }}
                    >
                      {TIPOS_DOCUMENTO.map(tipo => (
                        <option key={tipo} value={tipo}>{tipo}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Número documento *</span>
                    <input
                      className="field-input"
                      required value={form.documento}
                      onChange={(e) => handleFormChange('documento', e.target.value)}
                      placeholder="123456789"
                      style={{ borderColor: !form.documento && submitting ? 'var(--error)' : '' }}
                    />
                    {!form.documento && submitting && (
                      <span style={{ color: 'var(--error)', fontSize: 12, marginTop: 4 }}>El documento es requerido</span>
                    )}
                  </label>
                </div>
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Fecha nacimiento</span>
                    <DateInputWithAutoFormat
                      value={form.fecha_nacimiento}
                      onChange={(value) => handleFormChange('fecha_nacimiento', value)}
                      className="field-input"
                      placeholder="DD/MM/YYYY"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Género</span>
                    <select
                      className="field-input"
                      value={form.genero}
                      onChange={(e) => handleFormChange('genero', e.target.value)}
                    >
                      <option value="">Seleccionar...</option>
                      {GENEROS.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Teléfono / WhatsApp *</span>
                    <input
                      className="field-input"
                      required value={form.telefono}
                      onChange={(e) => handleFormChange('telefono', e.target.value)}
                      placeholder="3001234567"
                      inputMode="numeric"
                      style={{ borderColor: !form.telefono && submitting ? 'var(--error)' : '' }}
                    />
                    {!form.telefono && submitting && (
                      <span style={{ color: 'var(--error)', fontSize: 12, marginTop: 4 }}>El teléfono es requerido</span>
                    )}
                  </label>
                  <label className="field">
                    <span className="field-label">Email</span>
                    <input
                      className="field-input"
                      type="email"
                      value={form.email}
                      onChange={(e) => handleFormChange('email', e.target.value)}
                      placeholder="correo@ejemplo.com"
                      style={{ borderColor: form.email && !form.email.includes('@') && submitting ? 'var(--error)' : '' }}
                    />
                    {form.email && !form.email.includes('@') && submitting && (
                      <span style={{ color: 'var(--error)', fontSize: 12, marginTop: 4 }}>Email inválido</span>
                    )}
                  </label>
                </div>
                <div className="auth-form-row">
                  <label className="field" style={{ flex: 1 }}>
                    <span className="field-label">Dirección completa</span>
                    <input
                      className="field-input"
                      value={form.direccion}
                      onChange={(e) => handleFormChange('direccion', e.target.value)}
                      placeholder="Calle 123 #45-67, Barrio"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* B) Salud y emergencia */}
            {activeSection === 'salud' && (
              <div className="form-section anim-fade-up">
                <h4 style={{ marginBottom: 16, color: 'var(--primary)' }}>Salud y emergencia</h4>
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Contacto de emergencia</span>
                    <input
                      className="field-input"
                      value={form.contacto_emergencia}
                      onChange={(e) => handleFormChange('contacto_emergencia', e.target.value)}
                      placeholder="Nombre del contacto"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Teléfono emergencia</span>
                    <input
                      className="field-input"
                      value={form.telefono_emergencia}
                      onChange={(e) => handleFormChange('telefono_emergencia', e.target.value)}
                      placeholder="3001234567"
                      inputMode="numeric"
                    />
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">Condiciones médicas / lesiones</span>
                  <textarea
                    className="field-input"
                    value={form.condiciones_medicas}
                    onChange={(e) => handleFormChange('condiciones_medicas', e.target.value)}
                    placeholder="Información relevante sobre condiciones médicas"
                    rows={3}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Alergias</span>
                  <textarea
                    className="field-input"
                    value={form.alergias}
                    onChange={(e) => handleFormChange('alergias', e.target.value)}
                    placeholder="Alergias a medicamentos, alimentos, etc."
                    rows={2}
                  />
                </label>
              </div>
            )}

            {/* C) Plan y COBROS */}
            {activeSection === 'cobros' && (
              <div className="form-section anim-fade-up" style={{ border: '2px solid var(--primary)', borderRadius: 'var(--radius)', padding: 20, background: 'var(--surface-container-low)' }}>
                <h4 style={{ marginBottom: 16, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined icon">payments</span>
                  Plan y COBROS
                </h4>
                <p style={{ marginBottom: 16, fontSize: 13, color: 'var(--on-surface-variant)' }}>
                  Esta sección es fundamental para controlar los ingresos de tu gimnasio. Registra correctamente los pagos y fechas para evitar perder dinero por planes vencidos.
                </p>
                
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Tipo de plan *</span>
                    <select
                      className="field-input"
                      required value={form.tipo_plan}
                      onChange={(e) => handleFormChange('tipo_plan', e.target.value)}
                    >
                      {TIPOS_PLAN.map(tipo => (
                        <option key={tipo} value={tipo}>{tipo}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Fecha inicio *</span>
                    <DateInputWithAutoFormat
                      value={form.fecha_inicio}
                      onChange={(value) => handleFormChange('fecha_inicio', value)}
                      className="field-input"
                      placeholder="DD/MM/YYYY"
                      required
                    />
                  </label>
                </div>
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Fecha fin (calculada automáticamente)</span>
                    <DateInputWithAutoFormat
                      value={form.fecha_fin}
                      onChange={(value) => handleFormChange('fecha_fin', value)}
                      className="field-input"
                      placeholder="Calculada automáticamente"
                      readOnly
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Valor total del plan *</span>
                    <input
                      className="field-input"
                      type="number"
                      required value={form.valor_total}
                      onChange={(e) => handleFormChange('valor_total', e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                    />
                  </label>
                </div>
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Valor pagado hoy</span>
                    <input
                      className="field-input"
                      type="number"
                      value={form.valor_pagado}
                      onChange={(e) => handleFormChange('valor_pagado', e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Estado del pago</span>
                    <select
                      className="field-input"
                      value={form.estado_pago}
                      onChange={(e) => handleFormChange('estado_pago', e.target.value)}
                      style={{ 
                        background: form.estado_pago === 'PAGADO' ? 'var(--success-container)' : 
                                  form.estado_pago === 'PARCIAL' ? 'var(--warning-container)' : 
                                  'var(--error-container)'
                      }}
                    >
                      {ESTADOS_PAGO.map(estado => (
                        <option key={estado} value={estado}>{estado}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Método de pago *</span>
                    <select
                      className="field-input"
                      required value={form.metodo_pago}
                      onChange={(e) => handleFormChange('metodo_pago', e.target.value)}
                    >
                      {METODOS_PAGO.map(metodo => (
                        <option key={metodo} value={metodo}>{metodo}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Referencia / comprobante</span>
                    <input
                      className="field-input"
                      value={form.referencia_pago}
                      onChange={(e) => handleFormChange('referencia_pago', e.target.value)}
                      placeholder="Número de referencia"
                    />
                  </label>
                </div>
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Próxima fecha de cobro</span>
                    <DatePicker
                      selected={form.proxima_fecha_cobro ? new Date(form.proxima_fecha_cobro) : null}
                      onChange={(date) => handleFormChange('proxima_fecha_cobro', date ? date.toISOString().split('T')[0] : '')}
                      dateFormat="dd/MM/yyyy"
                      className="field-input"
                      placeholderText="Calculada automáticamente"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Activar recordatorio</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={form.activar_recordatorio}
                        onChange={(e) => handleFormChange('activar_recordatorio', e.target.checked)}
                      />
                      <input
                        className="field-input"
                        type="number"
                        value={form.dias_recordatorio}
                        onChange={(e) => handleFormChange('dias_recordatorio', parseInt(e.target.value))}
                        style={{ width: 80 }}
                        disabled={!form.activar_recordatorio}
                      />
                      <span style={{ fontSize: 12 }}>días antes</span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* D) Información adicional */}
            {activeSection === 'adicional' && (
              <div className="form-section anim-fade-up">
                <h4 style={{ marginBottom: 16, color: 'var(--primary)' }}>Información adicional</h4>
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Objetivo principal</span>
                    <select
                      className="field-input"
                      value={form.objetivo}
                      onChange={(e) => handleFormChange('objetivo', e.target.value)}
                    >
                      <option value="">Seleccionar...</option>
                      {OBJETIVOS.map(obj => (
                        <option key={obj} value={obj}>{obj}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Nivel de experiencia</span>
                    <select
                      className="field-input"
                      value={form.nivel_experiencia}
                      onChange={(e) => handleFormChange('nivel_experiencia', e.target.value)}
                    >
                      <option value="">Seleccionar...</option>
                      {NIVELES_EXPERIENCIA.map(nivel => (
                        <option key={nivel} value={nivel}>{nivel}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">Observaciones / notas del entrenador</span>
                  <textarea
                    className="field-input"
                    value={form.observaciones}
                    onChange={(e) => handleFormChange('observaciones', e.target.value)}
                    placeholder="Notas adicionales sobre el cliente"
                    rows={4}
                  />
                </label>
              </div>
            )}

            {/* E) Términos */}
            {activeSection === 'terminos' && (
              <div className="form-section anim-fade-up">
                <h4 style={{ marginBottom: 16, color: 'var(--primary)' }}>Términos y condiciones</h4>
                <label className="field" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    required
                    checked={form.acepto_terminos}
                    onChange={(e) => handleFormChange('acepto_terminos', e.target.checked)}
                    style={{ marginTop: 4 }}
                  />
                  <span className="field-label" style={{ margin: 0, fontSize: 14 }}>
                    Acepto los términos y condiciones del gimnasio *
                  </span>
                </label>
                <label className="field" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={form.autorizo_datos}
                    onChange={(e) => handleFormChange('autorizo_datos', e.target.checked)}
                    style={{ marginTop: 4 }}
                  />
                  <span className="field-label" style={{ margin: 0, fontSize: 14 }}>
                    Autorizo el uso de mis datos para fines administrativos y de contacto
                  </span>
                </label>
              </div>
            )}

            {/* Botones de navegación y acción */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const sections = ['personales', 'salud', 'cobros', 'adicional', 'terminos'];
                  const currentIndex = sections.indexOf(activeSection);
                  if (currentIndex > 0) {
                    setActiveSection(sections[currentIndex - 1]);
                  }
                }}
                disabled={activeSection === 'personales'}
              >
                ← Anterior
              </button>
              
              <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
                Paso {['personales', 'salud', 'cobros', 'adicional', 'terminos'].indexOf(activeSection) + 1} de 5
              </div>
              
              {activeSection !== 'terminos' ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const sections = ['personales', 'salud', 'cobros', 'adicional', 'terminos'];
                    const currentIndex = sections.indexOf(activeSection);
                    if (currentIndex < sections.length - 1) {
                      setActiveSection(sections[currentIndex + 1]);
                    }
                  }}
                >
                  Siguiente →
                </button>
              ) : (
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Creando miembro...' : 'Crear miembro'}
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      <div className="filter-bar">
        <form onSubmit={onSearch} className="search-input filter-bar__search" role="search">
          <span className="material-symbols-outlined icon">search</span>
          <input
            placeholder="Buscar por nombre, documento, correo o código QR"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar miembros"
          />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={loading}>
            Buscar
          </button>
        </form>

        <div className="filter-bar__chips" role="tablist" aria-label="Filtros">
          {FILTROS.map((f) => (
            <button
              type="button"
              key={f.id}
              role="tab"
              aria-selected={filtro === f.id}
              className={`chip${filtro === f.id ? ' chip-active' : ''}`}
              onClick={() => toggleFiltro(f.id)}
            >
              {f.label}
              <span className="chip-count">{counts[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="table-card miembros-table">
        {loading && <div className="bar-loader" />}
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Miembro</th>
                <th>Documento</th>
                <th>Contacto</th>
                <th>QR</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 && <SkeletonRows cols={6} rows={6} />}

              {!loading && filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 24 }}>
                    <EmptyState
                      icono="group_off"
                      titulo="Sin miembros que mostrar"
                      descripcion="No hay miembros que coincidan con el filtro actual."
                      ctaLabel="Nuevo miembro"
                      onCta={() => setOpen(true)}
                    />
                  </td>
                </tr>
              )}

              {filtrados.map((m, idx) => {
                const initials = (m.nombre || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                const delayClass = `anim-delay-${(idx % 8) + 1}`;
                return (
                  <tr
                    key={m.id_miembro}
                    className={`member-row-clickable anim-fade-up ${delayClass}`}
                    onClick={() => openEdit(m)}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="avatar avatar-primary">{initials}</span>
                        <div>
                          <strong style={{ display: 'block' }}>{m.nombre}</strong>
                          {m.email && (
                            <small style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>
                              {m.email}
                            </small>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{m.documento}</td>
                    <td>{m.telefono}</td>
                    <td>
                      <code style={{
                        fontFamily: 'var(--font-label)',
                        fontSize: 12,
                        padding: '4px 8px',
                        background: 'var(--surface-container-lowest)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border-subtle)',
                      }}>
                        {m.codigo_qr}
                      </code>
                    </td>
                    <td><BadgeEstado estado={estadoDeMiembro(m)} /></td>
                    <td className="row-actions">
                      {m.activo ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => { e.stopPropagation(); askDeactivate(m); }}
                          aria-label={`Desactivar a ${m.nombre}`}
                        >
                          <span className="material-symbols-outlined icon">person_remove</span>
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => { e.stopPropagation(); askDelete(m); }}
                            aria-label={`Eliminar permanentemente a ${m.nombre}`}
                            title="Eliminar permanentemente"
                          >
                            <span className="material-symbols-outlined icon" style={{ color: 'var(--error)' }}>delete_forever</span>
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => { e.stopPropagation(); openEdit(m); }}
                            aria-label={`Reactivar a ${m.nombre}`}
                            title="Reactivar"
                          >
                            <span className="material-symbols-outlined icon" style={{ color: 'var(--success)' }}>person_add</span>
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Vista movil (<900px): cada miembro es una CardGlass (tarea 21-ago).
            En escritorio se muestra la tabla original; CSS decide cual se ve. */}
        <div className="miembros-cards">
          {filtrados.length === 0 && !loading && (
            <EmptyState
              icono="group_off"
              titulo="Sin miembros que mostrar"
              descripcion="No hay miembros que coincidan con el filtro actual."
              ctaLabel="Nuevo miembro"
              onCta={() => setOpen(true)}
            />
          )}
          {filtrados.map((m) => {
            const initials = (m.nombre || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
            return (
              <CardGlass as="article" key={m.id_miembro} className="miembro-card">
                <header className="miembro-card__head">
                  <span className="avatar avatar-primary">{initials}</span>
                  <div className="miembro-card__id">
                    <strong>{m.nombre}</strong>
                    {m.email && <small>{m.email}</small>}
                  </div>
                  <BadgeEstado estado={estadoDeMiembro(m)} />
                </header>
                <dl className="miembro-card__data">
                  <div>
                    <dt>Documento</dt>
                    <dd>{m.documento}</dd>
                  </div>
                  <div>
                    <dt>Telefono</dt>
                    <dd>{m.telefono}</dd>
                  </div>
                  <div className="miembro-card__qr">
                    <dt>QR</dt>
                    <dd><code>{m.codigo_qr}</code></dd>
                  </div>
                </dl>
                <footer className="miembro-card__actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onDelete(m)}
                    aria-label={`Desactivar a ${m.nombre}`}
                  >
                    <span className="material-symbols-outlined icon">person_remove</span>
                    Desactivar
                  </button>
                </footer>
              </CardGlass>
            );
          })}
        </div>
        <div className="table-card__foot">
          <span>Mostrando {filtrados.length} de {items.length} miembros</span>
          <span>{items.filter((m) => m.vencido).length} con membresía vencida</span>
        </div>
      </section>

      {/* Modal de edicion */}
      <Modal
        open={Boolean(editing)}
        onClose={closeEdit}
        title={editing ? `Editar ${editing.nombre}` : 'Editar miembro'}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={closeEdit}
              disabled={editSaving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="miembros-edit-form"
              className="btn btn-primary ripple-host"
              onClick={guardarRipple}
              disabled={editSaving}
            >
              <span className="material-symbols-outlined icon">save</span>
              {editSaving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </>
        }
      >
        <form id="miembros-edit-form" className="auth-form" onSubmit={onSaveEdit} noValidate>
          {editError && (
            <div className="alert alert-error" role="alert" style={{ marginBottom: 12 }}>
              <span className="material-symbols-outlined icon">error</span>
              <span>{editError}</span>
            </div>
          )}

          {/* ---------- Codigo QR del miembro ----------
              El mismo QR que se muestra al registrar, disponible tambien aqui
              para reimprimirlo o reenviarlo sin tener que crear el miembro de
              nuevo. */}
          {editing?.codigo_qr && (
            <section className="miembro-qr-panel">
              {editQr
                ? <img src={editQr} alt={`Código QR de ${editing.nombre}`} className="miembro-qr-panel__img" />
                : <div className="miembro-qr-panel__img miembro-qr-panel__img--vacio">
                    <span className="material-symbols-outlined">qr_code_2</span>
                  </div>}
              <div className="miembro-qr-panel__body">
                <span className="field-label">Código QR</span>
                <code className="miembro-qr-panel__codigo">{editing.codigo_qr}</code>
                <div className="miembro-qr-panel__acciones">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={copiarCodigoQr}>
                    <span className="material-symbols-outlined icon">
                      {qrCopiado ? 'check' : 'content_copy'}
                    </span>
                    {qrCopiado ? 'Copiado' : 'Copiar código'}
                  </button>
                  {editQr && (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={editQr}
                      download={`qr-${editing.documento || editing.codigo_qr}.png`}
                    >
                      <span className="material-symbols-outlined icon">download</span>
                      Descargar
                    </a>
                  )}
                </div>
              </div>
            </section>
          )}

          {editLoading && (
            <p className="field-hint" style={{ marginBottom: 12 }}>
              Cargando los datos completos del miembro…
            </p>
          )}

          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Nombre completo</span>
              <input
                className="field-input"
                required
                value={editForm.nombre}
                onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                placeholder="Nombre y apellido"
              />
            </label>
            <label className="field">
              <span className="field-label">Documento</span>
              <input
                className="field-input"
                required
                value={editForm.documento}
                onChange={(e) => setEditForm({ ...editForm, documento: e.target.value })}
                placeholder="Cédula"
              />
            </label>
          </div>
          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Teléfono</span>
              <input
                className="field-input"
                required
                value={editForm.telefono}
                onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
                placeholder="3001234567"
                inputMode="numeric"
              />
            </label>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                className="field-input"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="correo@ejemplo.com"
              />
            </label>
          </div>
          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Tipo de documento</span>
              <select
                className="field-input"
                value={editForm.tipo_documento || 'CC'}
                onChange={(e) => setEditForm({ ...editForm, tipo_documento: e.target.value })}
              >
                {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Fecha de nacimiento</span>
              <input
                className="field-input"
                type="date"
                value={editForm.fecha_nacimiento || ''}
                onChange={(e) => setEditForm({ ...editForm, fecha_nacimiento: e.target.value })}
              />
            </label>
          </div>

          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Género</span>
              <select
                className="field-input"
                value={editForm.genero || ''}
                onChange={(e) => setEditForm({ ...editForm, genero: e.target.value })}
              >
                <option value="">Sin especificar</option>
                {GENEROS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Ciudad</span>
              <input
                className="field-input"
                value={editForm.ciudad || ''}
                onChange={(e) => setEditForm({ ...editForm, ciudad: e.target.value })}
                placeholder="Bogotá"
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Dirección</span>
            <input
              className="field-input"
              value={editForm.direccion || ''}
              onChange={(e) => setEditForm({ ...editForm, direccion: e.target.value })}
              placeholder="Calle 123 #45-67"
            />
          </label>

          <div className="auth-form-divider" style={{ margin: '6px 0 0' }}>SALUD Y EMERGENCIA</div>

          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Contacto de emergencia</span>
              <input
                className="field-input"
                value={editForm.contacto_emergencia || ''}
                onChange={(e) => setEditForm({ ...editForm, contacto_emergencia: e.target.value })}
                placeholder="Nombre y parentesco"
              />
            </label>
            <label className="field">
              <span className="field-label">Teléfono de emergencia</span>
              <input
                className="field-input"
                value={editForm.telefono_emergencia || ''}
                onChange={(e) => setEditForm({ ...editForm, telefono_emergencia: e.target.value })}
                placeholder="3001234567"
                inputMode="numeric"
              />
            </label>
          </div>

          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Condiciones médicas</span>
              <textarea
                className="field-input"
                rows={2}
                value={editForm.condiciones_medicas || ''}
                onChange={(e) => setEditForm({ ...editForm, condiciones_medicas: e.target.value })}
                placeholder="Lesiones, tratamientos, etc."
              />
            </label>
            <label className="field">
              <span className="field-label">Alergias</span>
              <textarea
                className="field-input"
                rows={2}
                value={editForm.alergias || ''}
                onChange={(e) => setEditForm({ ...editForm, alergias: e.target.value })}
                placeholder="Alimentos, medicamentos…"
              />
            </label>
          </div>

          <div className="auth-form-divider" style={{ margin: '6px 0 0' }}>ENTRENAMIENTO</div>

          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Objetivo</span>
              <select
                className="field-input"
                value={editForm.objetivo || ''}
                onChange={(e) => setEditForm({ ...editForm, objetivo: e.target.value })}
              >
                <option value="">Sin especificar</option>
                {OBJETIVOS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Nivel de experiencia</span>
              <select
                className="field-input"
                value={editForm.nivel_experiencia || ''}
                onChange={(e) => setEditForm({ ...editForm, nivel_experiencia: e.target.value })}
              >
                <option value="">Sin especificar</option>
                {NIVELES_EXPERIENCIA.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          <label className="field">
            <span className="field-label">Observaciones</span>
            <textarea
              className="field-input"
              rows={3}
              value={editForm.observaciones || ''}
              onChange={(e) => setEditForm({ ...editForm, observaciones: e.target.value })}
              placeholder="Notas internas sobre el miembro"
            />
          </label>

          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={Boolean(editForm.activo)}
              onChange={(e) => setEditForm({ ...editForm, activo: e.target.checked })}
            />
            <span className="field-label" style={{ margin: 0 }}>Miembro activo</span>
          </label>
        </form>
      </Modal>

      {/* Modal de confirmacion al desactivar */}
      <Modal
        open={Boolean(confirmDeactivate)}
        onClose={() => setConfirmDeactivate(null)}
        variant="danger"
        title="Desactivar miembro"
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirmDeactivate(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger ripple-host"
              onClick={(e) => { desactivarRipple(e); doDeactivate(); }}
            >
              <span className="material-symbols-outlined icon">person_remove</span>
              Sí, desactivar
            </button>
          </>
        }
      >
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          ¿Seguro que quieres desactivar a{' '}
          <strong>{confirmDeactivate?.nombre}</strong>?
        </p>
        <p style={{ marginTop: 10, color: 'var(--on-surface-variant)', fontSize: 13 }}>
          No podrá ingresar al gimnasio hasta que lo reactives. Esta acción puede
          revertirse editando al miembro.
        </p>
      </Modal>

      {/* Modal de confirmación para eliminación permanente */}
      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Eliminar miembro permanentemente"
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirmDelete(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger ripple-host"
              onClick={(e) => { desactivarRipple(e); doDelete(); }}
            >
              <span className="material-symbols-outlined icon">delete_forever</span>
              Sí, eliminar permanentemente
            </button>
          </>
        }
      >
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          ¿Seguro que quieres eliminar permanentemente a{' '}
          <strong>{confirmDelete?.nombre}</strong>?
        </p>
        <p style={{ marginTop: 10, color: 'var(--error)', fontSize: 13, fontWeight: 500 }}>
          Esta accion NO se puede deshacer. Se eliminaran todos los datos del miembro
          incluyendo historial de pagos, check-ins y QR.
        </p>
      </Modal>

      {/* Modal para mostrar QR generado */}
      <Modal
        open={showQRModal}
        onClose={() => setShowQRModal(false)}
        title="¡Miembro creado exitosamente!"
        footer={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowQRModal(false)}
          >
            Cerrar
          </button>
        }
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          {qrImage && (
            <div style={{ marginBottom: 20 }}>
              <img 
                src={qrImage} 
                alt="Código QR del miembro" 
                style={{ 
                  width: '100%',
                  maxWidth: 250,
                  height: 'auto',
                  margin: '0 auto',
                  display: 'block',
                  border: '2px solid var(--primary)',
                  borderRadius: 'var(--radius)'
                }} 
              />
              <p style={{ marginTop: 10, fontSize: 14, color: 'var(--on-surface-variant)', wordBreak: 'break-all' }}>
                Código QR: <strong>{createdMember?.codigo_qr}</strong>
              </p>
            </div>
          )}
          
          <div style={{ 
            background: 'var(--surface-container-low)', 
            padding: 16, 
            borderRadius: 'var(--radius)',
            marginBottom: 20,
            textAlign: 'left',
            fontSize: 13
          }}>
            <h5 style={{ margin: '0 0 10px 0', color: 'var(--primary)' }}>Información del cliente:</h5>
            <p style={{ margin: '4px 0' }}><strong>Nombre:</strong> {createdMember?.nombre}</p>
            <p style={{ margin: '4px 0' }}><strong>Documento:</strong> {createdMember?.documento}</p>
            <p style={{ margin: '4px 0' }}><strong>Teléfono:</strong> {createdMember?.telefono}</p>
          </div>

          <div style={{ 
            display: 'flex', 
            flexDirection: 'column',
            gap: 10,
            alignItems: 'center'
          }}>
            <a
              href={generarWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-success btn-lg"
              style={{ 
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                textDecoration: 'none',
                background: '#25D366',
                color: 'white',
                width: '100%',
                maxWidth: 300
              }}
            >
              <span className="material-symbols-outlined icon">chat</span>
              Enviar QR por WhatsApp
            </a>
            
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={async () => {
                try {
                  const response = await fetch(qrImage);
                  const blob = await response.blob();
                  await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                  ]);
                  alert('Imagen del QR copiada al portapapeles. Ahora puedes pegarla en WhatsApp.');
                } catch (err) {
                  console.error('Error al copiar:', err);
                  const link = document.createElement('a');
                  link.href = qrImage;
                  link.download = `qr-${createdMember?.codigo_qr}.png`;
                  link.click();
                  alert('La imagen se descargó. Puedes adjuntar el archivo descargado en WhatsApp.');
                }
              }}
              style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                maxWidth: 300
              }}
            >
              <span className="material-symbols-outlined icon">content_copy</span>
              Copiar QR
            </button>
          </div>
        </div>
      </Modal>

      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--on-surface-variant)' }}>
        El cliente deberá mostrar este QR cada vez que ingrese al gimnasio.
      </p>
    </PageTransition>
  );
}