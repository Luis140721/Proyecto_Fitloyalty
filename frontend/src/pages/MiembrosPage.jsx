import { useEffect, useMemo, useState, useRef } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { es } from 'date-fns/locale/es';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { fechaDia, formatearFechaDia } from '../fechas';
import { useAuth } from '../context/AuthContext';
import CardGlass from '../components/CardGlass';
import IconoWhatsapp from '../components/IconoWhatsapp';
import BadgeEstado, { estadoDeMiembro } from '../components/BadgeEstado';
import EmptyState from '../components/EmptyState';
import PageTransition from '../components/PageTransition';
import Modal from '../components/Modal';
import Ripple from '../components/Ripple';
import {
  RepresentanteCampos, CasillaAutorizacion, CasillaDatosSensibles, HistorialAutorizaciones,
  CasillaMensajesComerciales,
} from '../components/AutorizacionesMiembro';
import { abrirWhatsappAutorizado } from '../lib/contactoWhatsapp';
import { aplicarCambio } from '../lib/formularioMiembro';
import { esMenor, edadEnAnios, isoADate, erroresRepresentante } from '../lib/autorizaciones';
import { avisoContrasenaFicha, errorContrasenaApp, telefonoSirveParaApp } from '../lib/contrasenaApp';
import QRCode from 'qrcode';

// CampoFecha usa locale="es": sin registrarlo, el calendario sale en ingles.
registerLocale('es', es);

/** Mensaje de error bajo un campo. No renderiza nada si no hay error. */
function ErrorCampo({ msg }) {
  if (!msg) return null;
  return (
    <span className="field-error" role="alert">
      <span className="material-symbols-outlined icon" aria-hidden="true">error</span>
      {msg}
    </span>
  );
}

/** Fecha de hoy en el formato "DD/MM/YYYY" que usa el formulario. */
function hoyEnTexto() {
  const h = new Date();
  return `${String(h.getDate()).padStart(2, '0')}/${String(h.getMonth() + 1).padStart(2, '0')}/${h.getFullYear()}`;
}

/** Convierte "DD/MM/YYYY" a Date. Devuelve null si aun no esta completa. */
function textoAFecha(texto) {
  if (!texto || texto.length !== 10) return null;
  const [d, m, a] = texto.split('/').map(Number);
  if (!d || !m || !a) return null;
  const fecha = new Date(a, m - 1, d);
  // Descarta fechas imposibles como 31/02: el Date las "corrige" sola.
  if (fecha.getDate() !== d || fecha.getMonth() !== m - 1) return null;
  return fecha;
}

/**
 * Acepta "DD/MM/YYYY" o "YYYY-MM-DD" y devuelve un Date. Devuelve null si el
 * texto aun no es una fecha completa: mientras se teclea llegan cadenas como
 * "03/" que new Date() convierte en Invalid Date y hacen reventar
 * toISOString() mas adelante.
 */
function aFecha(texto) {
  if (!texto) return null;
  if (texto.includes('/')) return textoAFecha(texto);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return null;
  const f = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(f.getTime()) ? null : f;
}

/** Convierte Date a "DD/MM/YYYY". */
function fechaATexto(fecha) {
  if (!fecha) return '';
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${fecha.getFullYear()}`;
}

/**
 * Campo de fecha: se puede ESCRIBIR (23/11/2005, con las barras puestas
 * automaticamente) y ademas abre un calendario con selectores rapidos de
 * mes y ano, para no tener que pasar 30 anos flecha a flecha al poner una
 * fecha de nacimiento.
 *
 * El valor viaja siempre como texto "DD/MM/YYYY", que es el formato que ya
 * usaba el formulario.
 */
function CampoFecha({ value, onChange, placeholder, anosAtras = 100, ...props }) {
  const hoy = new Date();
  return (
    <DatePicker
      selected={textoAFecha(value)}
      /* Al escribir a mano, react-datepicker no mueve el mes que muestra;
         openToDate lo obliga a saltar al ano y mes recien tecleados. */
      openToDate={textoAFecha(value) || undefined}
      locale="es"
      onChange={(fecha) => onChange(fechaATexto(fecha))}
      /* onChangeRaw deja escribir a mano y reutiliza el auto-formateo. */
      onChangeRaw={(e) => {
        if (e?.target?.value === undefined) return;
        const limpio = e.target.value.replace(/\D/g, '').slice(0, 8);
        let txt = limpio.slice(0, 2);
        if (limpio.length > 2) txt += '/' + limpio.slice(2, 4);
        if (limpio.length > 4) txt += '/' + limpio.slice(4, 8);
        onChange(txt);
      }}
      value={value}
      dateFormat="dd/MM/yyyy"
      /* Sin esto, al teclear el primer digito react-datepicker leia "1" como
         el dia 1 del mes actual y el campo se quedaba en 01/11/2026. Asi solo
         acepta una fecha escrita completa (DD/MM/AAAA). */
      strictParsing
      placeholderText={placeholder || 'DD/MM/YYYY'}
      className="field-input"
      showMonthDropdown
      showYearDropdown
      dropdownMode="select"
      yearDropdownItemNumber={anosAtras}
      scrollableYearDropdown
      minDate={new Date(hoy.getFullYear() - anosAtras, 0, 1)}
      maxDate={new Date(hoy.getFullYear() + 10, 11, 31)}
      popperPlacement="bottom-start"
      {...props}
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

/* Duracion de cada plan, en dias. Lo que no este aqui dura un mes. */
const DIAS_POR_PLAN = {
  MENSUAL: 30,
  TRIMESTRAL: 90,
  SEMESTRAL: 180,
  ANUAL: 365,
};

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
  // RQF-15: contrasena de la app del miembro (lib/contrasenaApp.js). Es
  // opcional: vacia, el alta no la asigna y la ficha no cambia la que haya.
  password: '',
  // Salud y emergencia
  contacto_emergencia: '',
  telefono_emergencia: '',
  condiciones_medicas: '',
  alergias: '',
  // Plan y cobros
  tipo_plan: 'MENSUAL',
  // La fecha de inicio arranca en HOY: es lo habitual al inscribir a alguien,
  // y asi la fecha de vencimiento se calcula sola desde el primer momento.
  fecha_inicio: '',
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
  // RQNF-17: autorizacion separada y opcional de datos sensibles, y
  // representante legal (obligatorio si el miembro es menor de edad).
  autorizo_datos_sensibles: false,
  representante_nombre: '',
  representante_tipo_documento: '',
  representante_documento: '',
  representante_parentesco: '',
  representante_telefono: '',
  autoriza_representante: false,
  // RQNF-16: mensajes comerciales (opcional, apagado por defecto).
  acepta_mensajes_comerciales: false,
  canales_comerciales: [],
  activo: true
};

const CAMPOS_REPRESENTANTE = [
  'representante_nombre', 'representante_tipo_documento', 'representante_documento',
  'representante_parentesco', 'representante_telefono',
];

/**
 * RQNF-17: lo que se le manda al backend sobre autorizaciones y
 * representante. Sin autorizacion de datos sensibles no se mandan condiciones
 * medicas ni alergias; si no es menor, no se manda representante.
 */
// Lo que una persona escribe, elige o marca en el alta. Lo demas (fechas,
// estado del pago, valor sugerido del plan) lo calcula el formulario solo y no
// cuenta como borrador.
const CAMPOS_DEL_BORRADOR = [
  'nombre', 'tipo_documento', 'documento', 'fecha_nacimiento', 'genero', 'telefono', 'email', 'direccion',
  'password',
  'contacto_emergencia', 'telefono_emergencia', 'condiciones_medicas', 'alergias',
  'tipo_plan', 'valor_pagado', 'metodo_pago', 'referencia_pago', 'activar_recordatorio',
  'objetivo', 'nivel_experiencia', 'observaciones',
  ...CAMPOS_REPRESENTANTE,
  'acepto_terminos', 'autorizo_datos', 'autorizo_datos_sensibles', 'autoriza_representante',
  'acepta_mensajes_comerciales', 'canales_comerciales',
];

/** true si en el alta hay algo distinto de como viene el formulario en blanco. */
function hayBorrador(f) {
  const comparable = (v) => (Array.isArray(v) ? v.join(',') : String(v ?? '').trim());
  return CAMPOS_DEL_BORRADOR.some((k) => comparable(f[k]) !== comparable(empty[k]));
}

// RQNF-17: marca de «no se sabe que quedo en el servidor» para un dato de salud.
const NO_SE_SABE = Symbol('no se sabe');

/** Dos textos de la ficha son el mismo dato: null, undefined y '' cuentan igual. */
function mismoTexto(a, b) {
  return String(a ?? '').trim() === String(b ?? '').trim();
}

/** RQNF-16: true si la aceptacion comercial de `a` y la de `b` son la misma decision. */
function mismaDecisionComercial(a, b) {
  const canales = (x) => [...(x.canales_comerciales || [])].sort().join(',');
  return Boolean(a.acepta_mensajes_comerciales) === Boolean(b.acepta_mensajes_comerciales)
    && canales(a) === canales(b);
}

function payloadLegal(f, menor) {
  const p = { autorizo_datos_sensibles: Boolean(f.autorizo_datos_sensibles) };
  // RQNF-16: aceptacion de mensajes comerciales y sus canales.
  p.acepta_mensajes_comerciales = Boolean(f.acepta_mensajes_comerciales);
  p.canales_comerciales = p.acepta_mensajes_comerciales ? (f.canales_comerciales || []) : [];
  if (!p.autorizo_datos_sensibles) {
    p.condiciones_medicas = '';
    p.alergias = '';
  }
  if (menor) {
    for (const k of CAMPOS_REPRESENTANTE) p[k] = (f[k] || '').trim();
    p.representante_telefono = p.representante_telefono.replace(/\D/g, '');
    p.autoriza_representante = Boolean(f.autoriza_representante);
  }
  return p;
}

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
  { id: 'vence30', label: 'Vence en 30 días' },
  { id: 'vencido',label: 'Vencido' },
  { id: 'riesgo', label: 'En riesgo' },
  { id: 'congelado', label: 'Congelado' },
  { id: 'desactivados', label: 'Desactivados' },
];

/** La ventana de «Próximos vencimientos» del Dashboard: de hoy a 30 dias, sin congeladas. */
const venceEn30 = (m) => !m.congelada && m.dias_para_vencer != null
  && m.dias_para_vencer >= 0 && m.dias_para_vencer <= 30;

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

/**
 * Formulario en blanco para un miembro NUEVO. Es una funcion y no una
 * constante a proposito: la fecha de inicio se calcula en el momento de
 * abrir el formulario, no cuando se cargo el modulo. Si no, una pestana
 * abierta desde ayer propondria la fecha de ayer.
 */
function formularioVacio() {
  return { ...empty, fecha_inicio: hoyEnTexto() };
}

export default function MiembrosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Miembros a los que ya se les escribio en esta sesion, para marcar el boton.
  const [contactados, setContactados] = useState(() => new Set());
  // Si el chat se abrio pero el envio no quedo registrado (RQF-09).
  const [avisoEnvio, setAvisoEnvio] = useState('');
  const [items, setItems]   = useState([]);
  const [q, setQ]           = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(formularioVacio);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(empty);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  // RQF-15: error del campo «Contraseña de la app» de la ficha, y el campo,
  // para llevar ahi a la persona si el error no esta a la vista.
  const [errorClaveEdit, setErrorClaveEdit] = useState('');
  const campoClaveFicha = useRef(null);
  const [editLoading, setEditLoading] = useState(false);
  // La ficha solo se guarda con el registro completo ya cargado: antes de eso
  // el formulario es la fila de la lista, y guardarla vaciaba campos y
  // registraba una revocacion (datos sensibles, mensajes comerciales) que
  // nadie decidio. RQNF-16 y RQNF-17.
  const [editCompleto, setEditCompleto] = useState(false);
  // RQNF-16: la aceptacion comercial tal como llego con el registro. Solo se
  // manda al guardar si el personal la cambio en esta ficha: si viajara
  // siempre, guardar otro campo despues de que el miembro se diera de baja
  // (por el enlace o la app, con la ficha abierta) registraria una aceptacion
  // que nadie decidio.
  const comercialesCargados = useRef(null);
  // RQNF-17: lo mismo con la autorizacion de datos sensibles y los datos de
  // salud, tal como llegaron con el registro. El miembro puede revocarla desde
  // la app: si viajara siempre, guardar otro campo con la ficha abierta la
  // volveria a registrar y devolveria los datos de salud que se borraron.
  const sensiblesCargados = useRef(null);
  // Cual ficha se pidio de ultima: la respuesta de una anterior no pisa la actual.
  const fichaPedida = useRef(0);
  // De que miembro es la ficha en pantalla (null si no hay ninguna abierta).
  const fichaMiembro = useRef(null);
  // Para no abrir la ficha de la URL encima del alta a medio llenar.
  const altaAbierta = useRef(false);
  useEffect(() => { altaAbierta.current = open; }, [open]);
  // La URL sin ?ficha que esta pagina acaba de poner: no es una busqueda nueva.
  const urlSinFicha = useRef(null);
  const [editQr, setEditQr] = useState('');      // imagen del QR en el detalle
  // RQNF-17: autorizaciones del miembro que se edita (vigentes e historial).
  const [autorizacionesEdit, setAutorizacionesEdit] = useState(null);
  // Plan del miembro que se esta editando. Va aparte del resto de la ficha
  // porque vive en otra tabla y se guarda con su propia peticion.
  const [planForm, setPlanForm] = useState(null);
  const [planGuardando, setPlanGuardando] = useState(false);
  const [planMsg, setPlanMsg] = useState('');
  const [planError, setPlanError] = useState('');
  // Congelar la membresia (RQF-04): solo el administrador.
  const { user } = useAuth();
  const esAdmin = user?.role === 'admin';
  const [congelaciones, setCongelaciones] = useState([]);
  const [motivoCongelar, setMotivoCongelar] = useState('');
  const [congelando, setCongelando] = useState(false);
  const [qrCopiado, setQrCopiado] = useState(false);
  // «Copiado» vuelve a «Copiar código» a los 2 s; el timer se cancela al
  // cerrar la ficha o salir de la pagina.
  const avisoQrCopiado = useRef(null);
  const montada = useRef(true);
  useEffect(() => {
    montada.current = true;
    return () => { montada.current = false; clearTimeout(avisoQrCopiado.current); };
  }, []);
  const [enviandoContrato, setEnviandoContrato] = useState(false);
  const [editInfo, setEditInfo] = useState('');
  const [error, setError] = useState('');
  // Por que no se pudo traer la lista. Va aparte de `error` (alta, desactivar...)
  // para que una carga buena lo quite sin borrar otros avisos.
  const [errorCarga, setErrorCarga] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdMember, setCreatedMember] = useState(null);
  const [qrImage, setQrImage] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [activeSection, setActiveSection] = useState('personales');
  const [gymConfig, setGymConfig] = useState(null);
  const qrCanvasRef = useRef(null);
  // Errores por campo del formulario de creacion: { documento: 'mensaje', ... }
  const [formErrors, setFormErrors] = useState({});

  // Confirm desactivar
  const [confirmDeactivate, setConfirmDeactivate] = useState(null); // miembro a desactivar
  // Confirm eliminar permanentemente
  const [confirmDelete, setConfirmDelete] = useState(null); // miembro a eliminar

  /* ---------- Validacion del formulario de alta ----------
     Cada seccion valida solo SUS campos. Al intentar pasar a otra seccion o
     al enviar, se marca lo que falta debajo del campo correspondiente en vez
     de mostrar un unico aviso generico arriba. */
  const SECCIONES = ['personales', 'salud', 'cobros', 'adicional', 'terminos'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const fechaValida = (t) => !t || textoAFecha(t) !== null;

  const validarSeccion = (seccion, f = form) => {
    const e = {};
    if (seccion === 'personales') {
      if (!f.nombre?.trim()) e.nombre = 'Escribe el nombre del miembro.';
      else if (f.nombre.trim().length < 2) e.nombre = 'El nombre es demasiado corto.';
      if (!f.documento?.trim()) e.documento = 'Escribe el número de documento.';
      else if (f.documento.trim().length < 5) e.documento = 'El documento parece incompleto.';
      const tel = (f.telefono || '').replace(/\D/g, '');
      if (!tel) e.telefono = 'Escribe el teléfono.';
      else if (tel.length !== 10) e.telefono = `Debe tener 10 dígitos (escribiste ${tel.length}).`;
      if (f.email?.trim() && !EMAIL_RE.test(f.email.trim())) e.email = 'Este correo no tiene un formato válido.';
      const errorClave = errorContrasenaApp(f.password);
      if (errorClave) e.password = errorClave;
      if (!fechaValida(f.fecha_nacimiento)) e.fecha_nacimiento = 'Fecha incompleta o inexistente. Usa DD/MM/AAAA.';
      else if (f.fecha_nacimiento && textoAFecha(f.fecha_nacimiento) > new Date()) {
        e.fecha_nacimiento = 'La fecha de nacimiento no puede ser futura.';
      }
      // RQNF-17: si es menor de edad, los datos del representante son obligatorios.
      if (esMenor(textoAFecha(f.fecha_nacimiento), f.tipo_documento)) Object.assign(e, erroresRepresentante(f));
    }
    if (seccion === 'salud') {
      const tel = (f.telefono_emergencia || '').replace(/\D/g, '');
      if (tel && tel.length !== 10) e.telefono_emergencia = `Debe tener 10 dígitos (escribiste ${tel.length}).`;
    }
    if (seccion === 'cobros') {
      if (!f.fecha_inicio?.trim()) e.fecha_inicio = 'Indica cuándo empieza el plan.';
      else if (!fechaValida(f.fecha_inicio)) e.fecha_inicio = 'Fecha incompleta o inexistente. Usa DD/MM/AAAA.';
      if (!fechaValida(f.fecha_fin)) e.fecha_fin = 'Fecha incompleta o inexistente. Usa DD/MM/AAAA.';
      const ini = textoAFecha(f.fecha_inicio), fin = textoAFecha(f.fecha_fin);
      if (ini && fin && fin < ini) e.fecha_fin = 'El vencimiento no puede ser anterior al inicio.';
      if (f.valor_total !== '' && Number(f.valor_total) < 0) e.valor_total = 'El valor no puede ser negativo.';
      if (f.valor_pagado !== '' && Number(f.valor_pagado) < 0) e.valor_pagado = 'El valor no puede ser negativo.';
      if (f.valor_total && f.valor_pagado && Number(f.valor_pagado) > Number(f.valor_total)) {
        e.valor_pagado = 'Lo pagado no puede superar el valor del plan.';
      }
    }
    if (seccion === 'terminos') {
      if (!f.acepto_terminos) e.acepto_terminos = 'Debes aceptar los términos para registrar al miembro.';
      if (!f.autorizo_datos) e.autorizo_datos = 'Falta la autorización de tratamiento de datos.';
      if (esMenor(textoAFecha(f.fecha_nacimiento), f.tipo_documento) && !f.autoriza_representante) {
        e.autoriza_representante = 'El miembro es menor de edad: falta la autorización de su representante legal.';
      }
    }
    return e;
  };

  // RQNF-17: ¿el miembro del alta o de la edicion es menor de edad?
  const menorAlta = esMenor(textoAFecha(form.fecha_nacimiento), form.tipo_documento);
  const edadAlta = edadEnAnios(textoAFecha(form.fecha_nacimiento));
  const menorEdit = esMenor(isoADate(editForm.fecha_nacimiento), editForm.tipo_documento);
  const edadEdit = edadEnAnios(isoADate(editForm.fecha_nacimiento));

  /** Lleva el foco al primer campo marcado en rojo. */
  const enfocarPrimerError = () => {
    setTimeout(() => {
      const primero = document.querySelector('.form-section .field-input--error');
      if (primero) { primero.focus(); primero.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }, 0);
  };

  /**
   * Cambia de seccion validando la actual. Solo bloquea al AVANZAR: volver a
   * una seccion anterior siempre se permite, para no dejar al usuario
   * atrapado mientras corrige.
   */
  const irASeccion = (destino) => {
    const iActual = SECCIONES.indexOf(activeSection);
    const iDestino = SECCIONES.indexOf(destino);
    if (iDestino <= iActual) { setActiveSection(destino); return; }

    const errores = validarSeccion(activeSection);
    if (Object.keys(errores).length > 0) {
      setFormErrors((prev) => ({ ...prev, ...errores }));
      enfocarPrimerError();
      return;
    }
    setFormErrors({});
    setActiveSection(destino);
  };

  // Ripple handlers.
  const crearRipple = Ripple({ opacity: 0.30 });
  const guardarRipple = Ripple({ opacity: 0.30 });
  const desactivarRipple = Ripple({ opacity: 0.30 });

  /*
   * Numero de la ultima carga pedida. Con la red lenta las respuestas pueden
   * llegar en desorden: si la carga inicial respondia despues de la recarga que
   * sigue a un alta, su lista (sin el miembro nuevo) reemplazaba a la buena.
   * Ahora solo cuenta la respuesta de la ultima carga pedida.
   */
  const ultimaCargaRef = useRef(0);

  const load = async (query = '', includeInactive = false) => {
    const carga = ++ultimaCargaRef.current;
    setLoading(true);
    try {
      const { data } = await api.get('/admin/miembros', { 
        params: { q: query, pageSize: 100, includeInactive } 
      });
      if (carga !== ultimaCargaRef.current) return;
      setItems(data.miembros);
      setErrorCarga('');
      return data.miembros;
    } catch (err) {
      if (carga !== ultimaCargaRef.current) return;
      setErrorCarga(err.message || 'Error al cargar miembros.');
    } finally {
      if (carga === ultimaCargaRef.current) setLoading(false);
    }
  };

  /*
   * Los avisos de la campana llevan a esta pantalla con ?q=<nombre>. Se
   * respeta esa busqueda en la carga inicial para caer directo en el miembro
   * del aviso en vez de en la lista completa. El Dashboard llega ademas con
   * ?filtro=<id de FILTROS> («Ver todos») o ?ficha=<id del miembro> (la fila).
   */
  useEffect(() => {
    const esSoloSinFicha = urlSinFicha.current === searchParams.toString();
    urlSinFicha.current = null;
    if (esSoloSinFicha) return;
    const inicial = searchParams.get('q') || '';
    setQ(inicial); // la caja dice lo mismo que se busco: si no, un filtro repetia la busqueda vieja
    const pedido = searchParams.get('filtro');
    const filtroInicial = FILTROS.some((f) => f.id === pedido) ? pedido : 'todos';
    setFiltro(filtroInicial); // tambien al llegar desde la campana: otro filtro podria esconder al miembro del aviso
    const idFicha = Number(searchParams.get('ficha')) || null;
    const fichaAntes = fichaPedida.current;
    load(inicial, filtroInicial === 'desactivados').then((miembros) => {
      // Sin lista (fallo, la reemplazo otra o la persona salio) no se toca nada.
      if (!idFicha || !miembros || !montada.current) return;
      const m = miembros.find((x) => x.id_miembro === idFicha);
      // Se respeta lo que la persona tenga abierto: otra ficha (o que abrio y
      // cerro mientras cargaba la lista) o un alta a medio llenar.
      const libre = fichaMiembro.current === null && fichaPedida.current === fichaAntes && !altaAbierta.current;
      if (m && libre) openEdit(m);
      // La ficha se abre una vez: al volver atras o recargar no se abre sola.
      const sinFicha = new URLSearchParams(searchParams);
      sinFicha.delete('ficha');
      urlSinFicha.current = sinFicha.toString();
      setSearchParams(sinFicha, { replace: true });
    });
  }, [searchParams]);

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
    const inicio = aFecha(fechaInicio);
    if (!inicio) return '';          // fecha a medio escribir: aun no hay que calcular
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + (DIAS_POR_PLAN[tipoPlan] ?? 30));
    return fechaATexto(fin);
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
    const fin = aFecha(fechaFin);
    if (!fin) return '';
    const proxima = new Date(fin);
    proxima.setDate(proxima.getDate() + 1);
    return fechaATexto(proxima);
  };

  /*
   * Las fechas derivadas se calculan aqui y no dentro de cada onChange. En el
   * onChange solo se recalculaban al TOCAR el tipo de plan o la fecha de
   * inicio, asi que un formulario recien abierto (que ya trae MENSUAL y la
   * fecha de hoy puestas) se quedaba con "Calculada automaticamente" vacio
   * hasta que el usuario cambiaba algo a mano.
   */
  useEffect(() => {
    const fin = calcularFechaFin(form.tipo_plan, form.fecha_inicio);
    const proxima = calcularProximaFechaCobro(fin);
    if (fin === form.fecha_fin && proxima === form.proxima_fecha_cobro) return;
    setForm((f) => ({ ...f, fecha_fin: fin, proxima_fecha_cobro: proxima }));
  }, [form.tipo_plan, form.fecha_inicio, form.fecha_fin, form.proxima_fecha_cobro]);

  // Manejar cambios en campos que afectan cálculos automáticos
  const handleFormChange = (field, value) => {
    // Al escribir se retira el error de ESE campo, no el del formulario entero.
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const sig = { ...prev, [field]: undefined };
      // Si ya no queda ninguno, se retira tambien el aviso general de arriba.
      if (!Object.values(sig).some(Boolean)) setError('');
      return sig;
    });

    // Sobre el formulario ANTERIOR (setForm con funcion): dos cambios en el
    // mismo evento se suman y no se pisan. El precio sugerido por plan y el
    // estado del pago siguen igual (lib/formularioMiembro.js).
    setForm((prev) => aplicarCambio(prev, field, value, { gymConfig, estadoPago: determinarEstadoPago }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');

    /* Valida TODAS las secciones, no solo la visible: el usuario puede llegar
       al boton de guardar sin haber pasado por alguna. Si algo falla, se salta
       a la primera seccion con problemas y se marcan los campos. */
    let todos = {};
    let primeraSeccionMala = null;
    for (const s of SECCIONES) {
      const e2 = validarSeccion(s);
      if (Object.keys(e2).length > 0 && !primeraSeccionMala) primeraSeccionMala = s;
      todos = { ...todos, ...e2 };
    }
    if (primeraSeccionMala) {
      setFormErrors(todos);
      setActiveSection(primeraSeccionMala);
      setError('Revisa los campos marcados antes de guardar.');
      enfocarPrimerError();
      return;
    }
    setFormErrors({});

    setSubmitting(true);
    setError('');
    
    try {
      const payload = { ...form };
      if (!payload.email) delete payload.email;
      // RQF-15: sin contrasena de la app, el miembro queda sin ella (se la
      // pueden asignar despues en su ficha).
      if (!payload.password) delete payload.password;
      // RQNF-17: el representante solo viaja si es menor; sin autorizacion
      // de datos sensibles no viajan condiciones medicas ni alergias.
      for (const k of [...CAMPOS_REPRESENTANTE, 'autoriza_representante']) delete payload[k];
      Object.assign(payload, payloadLegal(form, menorAlta));

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
        // Los calculos devuelven DD/MM/YYYY; al backend van en ISO.
        payload.fecha_fin = convertToISODate(calcularFechaFin(payload.tipo_plan, payload.fecha_inicio));
      }
      if (!payload.estado_pago) {
        payload.estado_pago = determinarEstadoPago(payload.valor_total, payload.valor_pagado);
      }
      if (!payload.proxima_fecha_cobro) {
        payload.proxima_fecha_cobro = convertToISODate(calcularProximaFechaCobro(payload.fecha_fin));
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
      setForm(formularioVacio());
      setOpen(false);
      load(q);
      setInfo(data.datos_sensibles_descartados
        ? 'Miembro creado. No se guardaron condiciones médicas ni alergias porque no se autorizó el tratamiento de datos sensibles.'
        : 'Miembro creado exitosamente.');
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
    const pedido = ++fichaPedida.current;
    fichaMiembro.current = m.id_miembro;
    setEditing(m);
    setEditError('');
    setErrorClaveEdit('');
    setEditInfo(''); // el «Contrato enviado al…» era de la ficha anterior
    setEditQr('');
    // Precarga con lo que ya tenemos para que el modal abra sin espera.
    setEditForm({ ...empty, ...m, activo: m.activo !== false });
    setEditCompleto(false);
    comercialesCargados.current = null;
    sensiblesCargados.current = null;
    // El plan, las congelaciones y el «Copiado» son de la ficha anterior.
    setPlanForm(null);
    setPlanMsg(''); setPlanError('');
    setCongelaciones([]);
    setMotivoCongelar('');
    clearTimeout(avisoQrCopiado.current);
    setQrCopiado(false);
    setEditLoading(true);
    try {
      const { data } = await api.get(`/admin/miembros/${m.id_miembro}`);
      if (pedido !== fichaPedida.current) return; // ya se abrio otra ficha o se cerro esta
      // Sin el registro no hay ficha completa: no se guarda sobre la fila de la lista.
      if (!data.miembro) throw new Error('No pudimos cargar los datos completos del miembro.');
      const full = data.miembro;
      setEditing(full);
      setEditForm({
        ...empty,
        ...full,
        // <input type="date"> necesita AAAA-MM-DD, no un ISO completo.
        fecha_nacimiento: full.fecha_nacimiento ? String(full.fecha_nacimiento).slice(0, 10) : '',
        activo: full.activo !== false,
        // RQNF-17: los null del representante pasan a '' para los inputs.
        ...Object.fromEntries(CAMPOS_REPRESENTANTE.map((k) => [k, full[k] || ''])),
        autorizo_datos_sensibles: Boolean(full.autorizo_datos_sensibles),
        autoriza_representante: false,
        acepta_mensajes_comerciales: Boolean(full.acepta_mensajes_comerciales),
        canales_comerciales: full.canales_comerciales || [],
      });
      setAutorizacionesEdit(data.autorizaciones || null);
      comercialesCargados.current = {
        acepta_mensajes_comerciales: Boolean(full.acepta_mensajes_comerciales),
        canales_comerciales: full.canales_comerciales || [],
      };
      sensiblesCargados.current = {
        autorizo_datos_sensibles: Boolean(full.autorizo_datos_sensibles),
        condiciones_medicas: full.condiciones_medicas,
        alergias: full.alergias,
      };
      setEditCompleto(true);
      if (full.codigo_qr) {
        try {
          const imagen = await QRCode.toDataURL(full.codigo_qr);
          if (pedido === fichaPedida.current) setEditQr(imagen);
        } catch (_) { /* si falla el dibujo, igual mostramos el codigo en texto */ }
      }
      if (pedido !== fichaPedida.current) return;
      await cargarPlan(m.id_miembro, pedido);
    } catch (err) {
      if (pedido !== fichaPedida.current) return;
      setEditError(err.message || 'No pudimos cargar los datos completos del miembro.');
    } finally {
      if (pedido === fichaPedida.current) setEditLoading(false);
    }
  };

  /** Trae el plan vigente del miembro y lo pasa al formato del formulario. */
  const cargarPlan = async (idMiembro, pedido = fichaPedida.current) => {
    setPlanError(''); setPlanMsg('');
    try {
      const { data } = await api.get(`/admin/miembros/${idMiembro}/plan`);
      // El plan de una ficha que ya no esta en pantalla no se muestra en otra:
      // «Guardar plan» lo guardaria en el miembro equivocado.
      if (pedido !== fichaPedida.current) return;
      const p = data.plan;
      setPlanForm({
        tipo_plan: p?.tipo_plan || 'MENSUAL',
        fecha_inicio: p?.fecha_inicio ? fechaATexto(fechaDia(p.fecha_inicio)) : hoyEnTexto(),
        fecha_fin: p?.fecha_fin ? fechaATexto(fechaDia(p.fecha_fin)) : '',
        valor_total: p?.valor_total != null ? String(Math.round(Number(p.valor_total))) : '',
        valor_pagado: p?.valor_pagado != null ? String(Math.round(Number(p.valor_pagado))) : '0',
        metodo_pago: p?.metodo_pago || 'EFECTIVO',
        referencia_pago: p?.referencia_pago || '',
        estado_pago: p?.estado_pago || 'PENDIENTE',
        existe: Boolean(p),
        congelado_desde: p?.congelado_desde || null,
        dias_congelado: p?.dias_congelado ?? 0,
      });
      setCongelaciones(data.congelaciones || []);
    } catch (err) {
      if (pedido !== fichaPedida.current) return;
      setPlanError('No pudimos cargar el plan de este miembro.');
      setPlanForm(null);
      setCongelaciones([]);
    }
  };

  /**
   * Congela o descongela la membresia vigente. Al descongelar, el backend corre
   * el vencimiento tantos dias como estuvo congelada (RQF-04).
   */
  const cambiarCongelamiento = async (accion) => {
    if (!editing?.id_miembro || congelando) return;
    if (accion === 'congelar'
      && !window.confirm('¿Congelar la membresía? Mientras esté congelada no contará como vencida y, al descongelarla, el vencimiento se correrá los días que estuvo congelada.')) {
      return;
    }
    // La ficha desde la que se pulso: si la respuesta llega con la ficha de
    // otro miembro en pantalla (o sin ficha), ni el plan ni el aviso caen ahi.
    // Si es la de este mismo miembro, reabierta, si se entera.
    const pedido = fichaPedida.current;
    const idMiembro = editing.id_miembro;
    const nombre = editing.nombre;
    const enPantalla = () => pedido === fichaPedida.current || fichaMiembro.current === idMiembro;
    setPlanError(''); setPlanMsg('');
    setCongelando(true);
    try {
      const { data } = await api.post(
        `/admin/miembros/${idMiembro}/${accion}`,
        accion === 'congelar' ? { motivo: motivoCongelar.trim() } : {}
      );
      if (enPantalla()) {
        if (pedido === fichaPedida.current) setMotivoCongelar('');
        // El aviso va despues de recargar: cargarPlan limpia planMsg al empezar.
        await cargarPlan(idMiembro);
        if (enPantalla()) {
          setPlanMsg(data.message || (accion === 'congelar' ? 'Membresía congelada.' : 'Membresía descongelada.'));
        }
      }
      await load(q, filtro === 'desactivados');
    } catch (err) {
      const motivo = err.message || 'No pudimos cambiar el congelamiento.';
      if (enPantalla()) setPlanError(motivo);
      // Sin su ficha en pantalla, el error va al aviso de la pagina: no se pierde.
      else setError(`No se pudo ${accion === 'congelar' ? 'congelar' : 'descongelar'} la membresía de ${nombre}: ${motivo}`);
    } finally {
      setCongelando(false);
    }
  };

  /**
   * Cambia un campo del plan y recalcula lo que depende de el: el vencimiento
   * sale del tipo de plan, y el estado del pago de los valores. Igual que en
   * el alta, para que las dos pantallas se comporten igual.
   */
  const cambiarPlan = (campo, valor) => {
    setPlanMsg('');
    setPlanForm((prev) => {
      const sig = { ...prev, [campo]: valor };
      if (campo === 'tipo_plan' || campo === 'fecha_inicio') {
        sig.fecha_fin = calcularFechaFin(sig.tipo_plan, sig.fecha_inicio);
      }
      if (campo === 'tipo_plan' && gymConfig) {
        // Mismo cuidado que en el alta: solo se propone un precio real.
        const sugerido = Number(gymConfig[`plan_${String(valor).toLowerCase()}_valor`]);
        if (Number.isFinite(sugerido) && sugerido > 0) {
          sig.valor_total = String(Math.round(sugerido));
        }
      }
      sig.estado_pago = determinarEstadoPago(sig.valor_total, sig.valor_pagado);
      return sig;
    });
  };

  const guardarPlan = async () => {
    if (!planForm || !editing) return;
    setPlanError(''); setPlanMsg('');

    const inicio = textoAFecha(planForm.fecha_inicio);
    const fin = textoAFecha(planForm.fecha_fin);
    if (!inicio) return setPlanError('La fecha de inicio no es valida. Usa DD/MM/AAAA.');
    if (!fin) return setPlanError('La fecha de vencimiento no es valida. Usa DD/MM/AAAA.');
    if (fin < inicio) return setPlanError('El vencimiento no puede ser anterior al inicio.');
    if (Number(planForm.valor_pagado) > Number(planForm.valor_total)) {
      return setPlanError('Lo pagado no puede superar el valor del plan.');
    }

    // Igual que al congelar: la respuesta solo vale para la ficha de ese miembro.
    const pedido = fichaPedida.current;
    const idMiembro = editing.id_miembro;
    const nombre = editing.nombre;
    const enPantalla = () => pedido === fichaPedida.current || fichaMiembro.current === idMiembro;
    setPlanGuardando(true);
    try {
      await api.put(`/admin/miembros/${idMiembro}/plan`, {
        tipo_plan: planForm.tipo_plan,
        fecha_inicio: convertToISODate(planForm.fecha_inicio),
        fecha_fin: convertToISODate(planForm.fecha_fin),
        valor_total: Number(planForm.valor_total) || 0,
        valor_pagado: Number(planForm.valor_pagado) || 0,
        metodo_pago: planForm.metodo_pago,
        referencia_pago: planForm.referencia_pago || '',
        proxima_fecha_cobro: convertToISODate(calcularProximaFechaCobro(planForm.fecha_fin)),
      });
      if (enPantalla()) {
        await cargarPlan(idMiembro);
        if (enPantalla()) setPlanMsg('Plan actualizado.');
      }
      await load(q, filtro === 'desactivados');
    } catch (err) {
      const motivo = err.message || 'No pudimos guardar el plan.';
      if (enPantalla()) setPlanError(motivo);
      // Sin su ficha en pantalla, el error va al aviso de la pagina: no se pierde.
      else setError(`No se guardó el plan de ${nombre}: ${motivo}`);
    } finally {
      setPlanGuardando(false);
    }
  };

  /**
   * Escribe al miembro por WhatsApp con el mensaje que arma el servidor segun
   * su situacion (plan vencido, por vencer, o lleva tiempo sin venir). No se
   * envia solo: se abre el chat para que la persona lo revise, que es ademas
   * lo unico que permite WhatsApp desde un enlace.
   */
  const escribirPorWhatsapp = async (m, e) => {
    e.stopPropagation();                 // no abrir la ficha al mismo tiempo
    const w = m.whatsapp;
    if (!w?.telefono) return;
    setAvisoEnvio('');
    // RQNF-16 (Ley 2300 de 2023): se registra antes de abrir el chat; el
    // servidor revisa el horario, la frecuencia y, si es de retencion, que el
    // miembro haya aceptado mensajes comerciales. Si no, no se abre.
    const r = await abrirWhatsappAutorizado(async () => {
      // mensaje: el texto que se abre en WhatsApp (va a mensaje_copiado).
      const { data } = await api.post('/admin/notificaciones/enviado', {
        idMiembro: m.id_miembro,
        canal: 'WHATSAPP',
        tipo: w.motivo,
        mensaje: w.mensaje,
        antesDeAbrir: true,
      });
      return `https://wa.me/${w.telefono}?text=${encodeURIComponent(data.mensaje || w.mensaje || '')}`;
    });
    if (r.ok) {
      setContactados((prev) => new Set(prev).add(m.id_miembro));
    } else {
      setAvisoEnvio(r.error?.code === 'CONTACTO_NO_PERMITIDO'
        ? `No se abrió WhatsApp: ${r.error.message}`
        : `No se abrió WhatsApp porque no pudimos registrar el envío a ${m.nombre}. Intenta de nuevo.`);
    }
  };

  /** Boton de WhatsApp de una fila. Solo sale si hay algo que decirle. */
  const BotonWhatsapp = ({ m }) => {
    if (!m.whatsapp) return null;
    if (!m.whatsapp.telefono) {
      return (
        <span className="wa-fila wa-fila--sin" title="Sin un teléfono válido registrado">
          Sin teléfono
        </span>
      );
    }
    const ya = contactados.has(m.id_miembro);
    return (
      <button
        type="button"
        className={`wa-fila${ya ? ' wa-fila--enviado' : ''}`}
        onClick={(e) => escribirPorWhatsapp(m, e)}
        title={`Escribirle a ${m.nombre} por WhatsApp`}
      >
        <IconoWhatsapp />
        {ya ? 'Enviado' : 'Avisar'}
      </button>
    );
  };

  /** Copia el codigo QR al portapapeles y confirma en el propio boton. */
  const copiarCodigoQr = async () => {
    const codigo = editing?.codigo_qr;
    if (!codigo) return;
    const pedido = fichaPedida.current;
    try {
      await navigator.clipboard.writeText(codigo);
      // La persona salio, cerro la ficha o abrio otra mientras se copiaba.
      if (!montada.current || pedido !== fichaPedida.current) return;
      setQrCopiado(true);
      clearTimeout(avisoQrCopiado.current);
      avisoQrCopiado.current = setTimeout(() => setQrCopiado(false), 2000);
    } catch (_) {
      if (!montada.current || pedido !== fichaPedida.current) return;
      setEditError('Tu navegador bloqueó el portapapeles. Copia el código a mano.');
    }
  };

  /**
   * Envia el contrato de membresia al miembro por WhatsApp via el backend.
   * El backend genera el texto prod-ready y lo manda. Si el cliente de
   * WhatsApp no esta autenticado, devuelve exito=false y le avisamos al
   * admin que escanee el QR desde los logs de Render.
   */
  const enviarContratoPorWhatsapp = async () => {
    if (!editing?.id_miembro || enviandoContrato) return;
    const pedido = fichaPedida.current;
    setEnviandoContrato(true);
    setEditError('');
    try {
      const r = await api.post(
        `/admin/miembros/${editing.id_miembro}/contrato/enviar`,
        { version: 'v1' }
      );
      if (pedido !== fichaPedida.current) return; // la respuesta llego con otra ficha, o sin ficha
      const data = r.data || r;
      if (data.exito) {
        setEditInfo(`Contrato enviado al ${data.telefono}.`);
      } else {
        setEditError(
          data.mensaje ||
            'No se pudo enviar el WhatsApp. Verifica que el cliente este autenticado (QR en logs de Render).'
        );
      }
      if (data.cliente_listo === false) {
        setEditError(
          data.mensaje ||
            'El cliente de WhatsApp no esta autenticado en el servidor. Pide que escaneen el QR desde los logs de Render.'
        );
      }
    } catch (err) {
      if (pedido !== fichaPedida.current) return;
      setEditError(err.response?.data?.error || err.message || 'No se pudo enviar el contrato.');
    } finally {
      setEnviandoContrato(false);
    }
  };

  const closeEdit = () => {
    if (editSaving) return;
    fichaPedida.current += 1; // una respuesta que llegue tarde ya no aplica
    fichaMiembro.current = null;
    clearTimeout(avisoQrCopiado.current);
    setEditCompleto(false);
    setEditLoading(false);
    setEditing(null);
    setPlanForm(null);
    setPlanMsg(''); setPlanError('');
    setCongelaciones([]);
    setMotivoCongelar('');
    setEditForm(empty);
    setEditError('');
    setErrorClaveEdit('');
    setEditInfo('');
    setEditQr('');
    setQrCopiado(false);
    setAutorizacionesEdit(null);
  };

  const onSaveEdit = async (e) => {
    e.preventDefault();
    if (!editing || !editCompleto) return;
    setEditError('');
    // RQF-15: una contrasena de la app muy corta no se envia; el backend la
    // rechazaria con un 400 y la persona no sabria cual campo arreglar.
    const errorClave = errorContrasenaApp(editForm.password);
    if (errorClave) {
      setErrorClaveEdit(errorClave);
      // «Guardar cambios» esta en el pie del modal: si la persona bajo por la
      // ficha, el campo y su aviso pueden haber quedado fuera de la vista.
      campoClaveFicha.current?.focus();
      campoClaveFicha.current?.scrollIntoView?.({ block: 'center' });
      return;
    }
    setEditSaving(true);
    // Si este guardado llevaba la decision comercial y falla en el cliente,
    // el servidor pudo haberla aplicado (un corte por tiempo, por ejemplo).
    let llevabaComerciales = false;
    let llevabaSensibles = [];
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
      // RQF-15: la contrasena de la app solo viaja si se escribio una; vacia,
      // el backend conserva la que el miembro tenga.
      if (editForm.password) payload.password = editForm.password;
      // Un correo vacio se envia tal cual: el backend lo guarda como null
      // (updateSchema de routes/miembros.js). Si se quitara del payload, borrar
      // el correo en la ficha no tendria efecto y el viejo seguiria guardado.
      // RQNF-17: autorizacion de datos sensibles (desmarcarla la revoca y
      // borra esos datos) y representante legal si es menor.
      Object.assign(payload, payloadLegal(editForm, menorEdit));
      // RQNF-16: sin cambios en la aceptacion comercial, no viaja (ver comercialesCargados).
      if (comercialesCargados.current && mismaDecisionComercial(payload, comercialesCargados.current)) {
        delete payload.acepta_mensajes_comerciales;
        delete payload.canales_comerciales;
      }
      // RQNF-17: sin cambios en la autorizacion de datos sensibles, no viaja; y
      // cada dato de salud solo viaja si cambio (ver sensiblesCargados), tambien
      // cuando la autorizacion si cambia: al otorgarla el servidor conserva lo
      // que haya, y al revocarla lo borra todo. Si solo cambian datos de salud,
      // van sin la autorizacion y el servidor decide con la vigente.
      const sensibles = sensiblesCargados.current;
      if (sensibles) {
        if (Boolean(payload.autorizo_datos_sensibles) === sensibles.autorizo_datos_sensibles) {
          delete payload.autorizo_datos_sensibles;
        }
        for (const k of ['condiciones_medicas', 'alergias']) {
          if (sensibles[k] !== NO_SE_SABE && mismoTexto(payload[k], sensibles[k])) delete payload[k];
        }
      }
      llevabaComerciales = 'acepta_mensajes_comerciales' in payload;
      llevabaSensibles = ['autorizo_datos_sensibles', 'condiciones_medicas', 'alergias'].filter((k) => k in payload);
      const { data: guardado } = await api.put(`/admin/miembros/${editing.id_miembro}`, payload);
      fichaPedida.current += 1; // lo que llegue tarde de esta ficha ya no aplica
      fichaMiembro.current = null;
      setEditLoading(false);
      setEditInfo('');
      clearTimeout(avisoQrCopiado.current);
      setQrCopiado(false);
      setPlanForm(null);
      setPlanMsg(''); setPlanError('');
      setCongelaciones([]);
      setMotivoCongelar('');
      setEditCompleto(false);
      setEditing(null);
      setEditForm(empty);
      setEditQr('');
      setAutorizacionesEdit(null);
      setInfo(guardado?.message || 'Miembro actualizado.');
      load(q);
    } catch (err) {
      // Si el servidor rechazo el guardado (400 a 499), no aplico nada: lo
      // cargado sigue valiendo. Con cualquier otro fallo (sin conexion, corte
      // por tiempo, 5xx) ya no se sabe que quedo en el servidor.
      const rechazado = err.status >= 400 && err.status < 500;
      if (!rechazado) {
        // El siguiente guardado manda la decision que haya en pantalla, aunque
        // sea igual a como llego.
        if (llevabaComerciales) comercialesCargados.current = null;
        // Lo mismo con los datos sensibles. Si el guardado llevaba la
        // autorizacion, se olvida todo; si solo llevaba textos de salud, se
        // olvidan esos textos y la autorizacion sigue sin viajar.
        if (llevabaSensibles.includes('autorizo_datos_sensibles')) {
          sensiblesCargados.current = null;
        } else if (llevabaSensibles.length > 0 && sensiblesCargados.current) {
          sensiblesCargados.current = {
            ...sensiblesCargados.current,
            ...Object.fromEntries(llevabaSensibles.map((k) => [k, NO_SE_SABE])),
          };
        }
      }
      setEditError(err.message || 'No se pudo actualizar.');
    } finally {
      setEditSaving(false);
    }
  };

  /** Deja el asistente del alta en blanco: de un miembro al siguiente no pasa nada. */
  const reiniciarAlta = () => {
    setForm(formularioVacio());
    setFormErrors({});
    setError(''); // «Revisa los campos marcados…» o el error del servidor eran del alta anterior
    setActiveSection('personales');
  };

  /** Abre el alta, siempre en blanco y con la fecha de hoy. */
  const abrirAlta = () => {
    reiniciarAlta();
    setOpen(true);
  };

  /**
   * Cierra el alta sin crear al miembro y descarta lo escrito. Los datos y las
   * autorizaciones (contrato, tratamiento de datos, datos sensibles, mensajes
   * comerciales) son de la persona que se estaba registrando: si quedaran en el
   * formulario, el siguiente miembro podria salir con autorizaciones que no dio.
   */
  const cerrarAlta = () => {
    // Con el miembro creandose no se cierra: se crearia igual, y su respuesta
    // caeria sobre el alta que hubiera abierta en ese momento.
    if (submitting) return;
    if (hayBorrador(form)
      && !window.confirm('¿Cerrar sin crear el miembro? Se descarta lo que escribiste: el siguiente registro empieza en blanco.')) {
      return;
    }
    reiniciarAlta();
    setOpen(false);
  };

  const filtrados = useMemo(() => {
    if (filtro === 'todos') return items;
    if (filtro === 'desactivados') return items.filter(m => !m.activo);
    return items.filter((m) => {
      if (filtro === 'al-dia')    return !m.vencido && !m.vencePronto && !m.enRiesgo && !m.congelada;
      if (filtro === 'vence')     return !!m.vencePronto;
      if (filtro === 'vence30')   return venceEn30(m);
      if (filtro === 'vencido')   return !!m.vencido;
      if (filtro === 'riesgo')    return !!m.enRiesgo;
      if (filtro === 'congelado') return !!m.congelada;
      return true;
    });
  }, [items, filtro]);

  const counts = useMemo(() => ({
    todos: items.filter(m => m.activo).length,
    'al-dia': items.filter((m) => m.activo && !m.vencido && !m.vencePronto && !m.enRiesgo && !m.congelada).length,
    vence: items.filter((m) => m.activo && m.vencePronto).length,
    vence30: items.filter((m) => m.activo && venceEn30(m)).length,
    vencido: items.filter((m) => m.activo && m.vencido).length,
    riesgo: items.filter((m) => m.activo && m.enRiesgo).length,
    congelado: items.filter((m) => m.activo && m.congelada).length,
    desactivados: items.filter(m => !m.activo).length,
  }), [items]);

  /*
   * Lo que se ve en la tabla y en las tarjetas cuando no hay filas. Si la
   * ultima carga fallo no se sabe si el gimnasio tiene miembros: antes salia
   * "Sin miembros que mostrar" con el API caido. Ahora se dice que no se
   * pudieron cargar y se ofrece reintentar con la misma busqueda y filtro.
   */
  const sinFilas = errorCarga ? (
    <EmptyState
      icono="cloud_off"
      titulo="No pudimos cargar los miembros"
      descripcion="Revisa la conexión y vuelve a intentarlo."
      ctaLabel="Reintentar"
      ctaIcono="refresh"
      onCta={() => load(q, filtro === 'desactivados')}
    />
  ) : (
    <EmptyState
      icono="group_off"
      titulo="Sin miembros que mostrar"
      descripcion="No hay miembros que coincidan con el filtro actual."
      ctaLabel="Nuevo miembro"
      onCta={() => { if (!open) abrirAlta(); }}
    />
  );

  return (
    <PageTransition>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-head__title">Miembros</h1>
          <p className="admin-page-head__lead">Agrega, busca y gestiona a todos los miembros de tu gimnasio.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => load(q)} disabled={loading}>
            <span className="material-symbols-outlined icon" aria-hidden="true">refresh</span>
            Actualizar
          </button>
          <button
            className="btn btn-primary"
            onClick={() => (open ? cerrarAlta() : abrirAlta())}
            disabled={open && submitting}
          >
            <span className="material-symbols-outlined icon" aria-hidden="true">{open ? 'close' : 'person_add'}</span>
            {open ? 'Cerrar' : 'Nuevo miembro'}
          </button>
        </div>
      </header>

      {errorCarga && (
        <div className="alert alert-error anim-scale-in" role="alert">
          <span className="material-symbols-outlined icon" aria-hidden="true">error</span>
          <span>{errorCarga}</span>
        </div>
      )}
      {error && (
        <div className="alert alert-error anim-scale-in" role="alert">
          <span className="material-symbols-outlined icon" aria-hidden="true">error</span>
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div className="alert alert-success anim-scale-in" role="status">
          <span className="material-symbols-outlined icon" aria-hidden="true">check_circle</span>
          <span>{info}</span>
        </div>
      )}
      {avisoEnvio && (
        <div className="alert alert-warning anim-scale-in" role="status">
          <span className="material-symbols-outlined icon">info</span>
          <span>{avisoEnvio}</span>
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
                onClick={() => irASeccion(section.id)}
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
                      className={`field-input${formErrors.nombre ? ' field-input--error' : ''}`}
                      required value={form.nombre}
                      onChange={(e) => handleFormChange('nombre', e.target.value)}
                      placeholder="Nombre y apellido"
                      aria-invalid={formErrors.nombre ? 'true' : undefined}
                    />
                    <ErrorCampo msg={formErrors.nombre} />
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
                      className={`field-input${formErrors.documento ? ' field-input--error' : ''}`}
                      required value={form.documento}
                      onChange={(e) => handleFormChange('documento', e.target.value)}
                      placeholder="123456789"
                      aria-invalid={formErrors.documento ? 'true' : undefined}
                    />
                    <ErrorCampo msg={formErrors.documento} />
                  </label>
                </div>
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Fecha nacimiento</span>
                    <CampoFecha
                      value={form.fecha_nacimiento}
                      onChange={(value) => handleFormChange('fecha_nacimiento', value)}
                      className={`field-input${formErrors.fecha_nacimiento ? ' field-input--error' : ''}`}
                      placeholder="DD/MM/YYYY"
                    />
                    <ErrorCampo msg={formErrors.fecha_nacimiento} />
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
                {/* RQNF-17: menor de edad -> representante legal obligatorio */}
                {menorAlta && (
                  <RepresentanteCampos
                    valores={form}
                    onChange={handleFormChange}
                    errores={formErrors}
                    edad={edadAlta}
                  />
                )}
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Teléfono / WhatsApp *</span>
                    <input
                      className={`field-input${formErrors.telefono ? ' field-input--error' : ''}`}
                      required value={form.telefono}
                      onChange={(e) => handleFormChange('telefono', e.target.value)}
                      placeholder="3001234567"
                      inputMode="numeric"
                      aria-invalid={formErrors.telefono ? 'true' : undefined}
                    />
                    <ErrorCampo msg={formErrors.telefono} />
                  </label>
                  <label className="field">
                    <span className="field-label">Email</span>
                    <input
                      className={`field-input${formErrors.email ? ' field-input--error' : ''}`}
                      type="email"
                      value={form.email}
                      onChange={(e) => handleFormChange('email', e.target.value)}
                      placeholder="correo@ejemplo.com"
                      aria-invalid={formErrors.email ? 'true' : undefined}
                    />
                    <ErrorCampo msg={formErrors.email} />
                  </label>
                </div>
                {/* RQF-15: el miembro entra a la app con su telefono y esta contrasena. */}
                <div className="auth-form-row">
                  <label className="field" style={{ flex: 1 }}>
                    <span id="etiqueta-clave-alta" className="field-label">Contraseña de la app</span>
                    <input
                      className={`field-input${formErrors.password ? ' field-input--error' : ''}`}
                      type="password"
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => handleFormChange('password', e.target.value)}
                      placeholder="Opcional, mínimo 6 caracteres"
                      aria-invalid={formErrors.password ? 'true' : undefined}
                      aria-labelledby="etiqueta-clave-alta"
                      aria-describedby="ayuda-clave-alta"
                    />
                    <ErrorCampo msg={formErrors.password} />
                    <span id="ayuda-clave-alta" className="field-hint">
                      Con su teléfono y esta contraseña el miembro entra a la app FitLoyalty. Si la dejas vacía, se la puedes asignar después en su ficha.
                      {form.password && !telefonoSirveParaApp(form.telefono)
                        && ' Con este teléfono no podrá entrar: la app pide 10 dígitos que empiecen por 3.'}
                    </span>
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
                      className={`field-input${formErrors.telefono_emergencia ? ' field-input--error' : ''}`}
                      value={form.telefono_emergencia}
                      onChange={(e) => handleFormChange('telefono_emergencia', e.target.value)}
                      placeholder="3001234567"
                      inputMode="numeric"
                      aria-invalid={formErrors.telefono_emergencia ? 'true' : undefined}
                    />
                    <ErrorCampo msg={formErrors.telefono_emergencia} />
                  </label>
                </div>
                {/* RQNF-17: autorizacion separada y opcional de datos sensibles */}
                <CasillaDatosSensibles
                  checked={form.autorizo_datos_sensibles}
                  onChange={(v) => handleFormChange('autorizo_datos_sensibles', v)}
                  menor={menorAlta}
                />
                <label className="field">
                  <span className="field-label">Condiciones médicas / lesiones</span>
                  <textarea
                    className="field-input"
                    value={form.autorizo_datos_sensibles ? form.condiciones_medicas : ''}
                    onChange={(e) => handleFormChange('condiciones_medicas', e.target.value)}
                    placeholder={form.autorizo_datos_sensibles
                      ? 'Información relevante sobre condiciones médicas'
                      : 'Requiere la autorización de datos sensibles'}
                    disabled={!form.autorizo_datos_sensibles}
                    rows={3}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Alergias</span>
                  <textarea
                    className="field-input"
                    value={form.autorizo_datos_sensibles ? form.alergias : ''}
                    onChange={(e) => handleFormChange('alergias', e.target.value)}
                    placeholder={form.autorizo_datos_sensibles
                      ? 'Alergias a medicamentos, alimentos, etc.'
                      : 'Requiere la autorización de datos sensibles'}
                    disabled={!form.autorizo_datos_sensibles}
                    rows={2}
                  />
                </label>
              </div>
            )}

            {/* C) Plan y COBROS */}
            {activeSection === 'cobros' && (
              <div className="form-section anim-fade-up" style={{ border: '2px solid var(--primary)', borderRadius: 'var(--radius)', padding: 20, background: 'var(--surface-container-low)' }}>
                <h4 style={{ marginBottom: 16, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined icon" aria-hidden="true">payments</span>
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
                    <CampoFecha
                      value={form.fecha_inicio}
                      onChange={(value) => handleFormChange('fecha_inicio', value)}
                      className={`field-input${formErrors.fecha_inicio ? ' field-input--error' : ''}`}
                      placeholder="DD/MM/YYYY"
                      anosAtras={5}
                      required
                    />
                    <ErrorCampo msg={formErrors.fecha_inicio} />
                  </label>
                </div>
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Fecha fin (calculada automáticamente)</span>
                    <CampoFecha
                      value={form.fecha_fin}
                      onChange={(value) => handleFormChange('fecha_fin', value)}
                      className="field-input"
                      placeholder="Calculada automáticamente"
                      readOnly
                    />
                    <ErrorCampo msg={formErrors.fecha_fin} />
                  </label>
                  <label className="field">
                    <span className="field-label">Valor total del plan *</span>
                    <input
                      className={`field-input${formErrors.valor_total ? ' field-input--error' : ''}`}
                      type="number"
                      required value={form.valor_total}
                      onChange={(e) => handleFormChange('valor_total', e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      aria-invalid={formErrors.valor_total ? 'true' : undefined}
                    />
                    <ErrorCampo msg={formErrors.valor_total} />
                  </label>
                </div>
                <div className="auth-form-row">
                  <label className="field">
                    <span className="field-label">Valor pagado hoy</span>
                    <input
                      className={`field-input${formErrors.valor_pagado ? ' field-input--error' : ''}`}
                      type="number"
                      value={form.valor_pagado}
                      onChange={(e) => handleFormChange('valor_pagado', e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      aria-invalid={formErrors.valor_pagado ? 'true' : undefined}
                    />
                    <ErrorCampo msg={formErrors.valor_pagado} />
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
                    {/* Igual que "fecha fin": la calcula el formulario, no se
                        escribe a mano. Antes era un DatePicker suelto que leia
                        el texto con new Date(), y "04/09/2027" se interpretaba
                        como el 9 de abril. */}
                    <CampoFecha
                      value={form.proxima_fecha_cobro}
                      onChange={(value) => handleFormChange('proxima_fecha_cobro', value)}
                      className="field-input"
                      placeholder="Calculada automáticamente"
                      readOnly
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
                {/* RQNF-17: cada autorizacion por separado, con el texto (v1)
                    que el backend guarda como prueba. */}
                {menorAlta && (
                  <p className="field-hint" style={{ marginBottom: 12 }}>
                    El miembro es menor de edad: estas autorizaciones las da su representante legal
                    {form.representante_nombre ? `, ${form.representante_nombre}` : ''}.
                  </p>
                )}
                <CasillaAutorizacion
                  tipo="TERMINOS"
                  obligatoria
                  checked={form.acepto_terminos}
                  onChange={(v) => handleFormChange('acepto_terminos', v)}
                  error={formErrors.acepto_terminos}
                />
                <CasillaAutorizacion
                  tipo="TRATAMIENTO_DATOS"
                  obligatoria
                  checked={form.autorizo_datos}
                  onChange={(v) => handleFormChange('autorizo_datos', v)}
                  error={formErrors.autorizo_datos}
                />
                {menorAlta && (
                  <CasillaAutorizacion
                    tipo="REPRESENTANTE_MENOR"
                    obligatoria
                    checked={form.autoriza_representante}
                    onChange={(v) => handleFormChange('autoriza_representante', v)}
                    error={formErrors.autoriza_representante}
                  />
                )}
                <p className="field-hint" style={{ marginTop: 4 }}>
                  Datos sensibles (salud): {form.autorizo_datos_sensibles ? 'autorizados' : 'no autorizados'}.
                  {' '}Es opcional y se marca en «Salud y emergencia».
                </p>
                {/* RQNF-16: opcional; solo si el miembro lo acepta en ese momento. */}
                <CasillaMensajesComerciales
                  checked={form.acepta_mensajes_comerciales}
                  onChange={(v) => handleFormChange('acepta_mensajes_comerciales', v)}
                  canales={form.canales_comerciales}
                  onCanales={(v) => handleFormChange('canales_comerciales', v)}
                  menor={menorAlta}
                />
              </div>
            )}

            {/* Botones de navegación y acción */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const i = SECCIONES.indexOf(activeSection);
                  if (i > 0) irASeccion(SECCIONES[i - 1]);
                }}
                disabled={activeSection === 'personales'}
              >
                ← Anterior
              </button>
              
              <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
                Paso {SECCIONES.indexOf(activeSection) + 1} de {SECCIONES.length}
              </div>
              
              {/* Cada boton con su key: sin ella React reutilizaba el mismo
                  <button> y, durante el clic en "Siguiente" del paso 4, le
                  cambiaba el tipo a "submit"; el navegador enviaba entonces el
                  formulario con un solo clic (los terminos salian en rojo, o el
                  miembro se creaba si ya estaban marcados). Con la key se monta
                  un boton nuevo y el del clic sale del formulario. */}
              {activeSection !== 'terminos' ? (
                <button
                  key="siguiente"
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const i = SECCIONES.indexOf(activeSection);
                    if (i < SECCIONES.length - 1) irASeccion(SECCIONES[i + 1]);
                  }}
                >
                  Siguiente →
                </button>
              ) : (
                <button
                  key="crear"
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  /* El segundo clic de un doble clic en "Siguiente →" del paso 4
                     puede caer aqui: con la pagina desplazada hasta el final, el
                     paso 5 es mas bajo, el navegador sube el desplazamiento y este
                     boton queda justo bajo el puntero. event.detail cuenta los
                     clics seguidos (1 en un clic normal, 0 con el teclado), asi
                     que solo se ignora el segundo de un doble clic. */
                  onClick={(e) => { if (e.detail > 1) e.preventDefault(); }}
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
          <span className="material-symbols-outlined icon" aria-hidden="true">search</span>
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
        {/* La barra sola no le dice nada a un lector de pantalla: se anuncia como progreso. */}
        {loading && <div className="bar-loader" role="progressbar" aria-label="Cargando miembros" />}
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Miembro</th>
                <th>Documento</th>
                <th>Contacto</th>
                <th>QR</th>
                <th className="col-estado">Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 && <SkeletonRows cols={6} rows={6} />}

              {!loading && filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 24 }}>
                    {sinFilas}
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
                    <td className="col-estado">
                      <div className="celda-estado">
                        <BadgeEstado estado={estadoDeMiembro(m)} />
                        <BotonWhatsapp m={m} />
                      </div>
                    </td>
                    <td className="row-actions">
                      {m.activo ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => { e.stopPropagation(); askDeactivate(m); }}
                          aria-label={`Desactivar a ${m.nombre}`}
                        >
                          <span className="material-symbols-outlined icon" aria-hidden="true">person_remove</span>
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => { e.stopPropagation(); askDelete(m); }}
                            aria-label={`Eliminar permanentemente a ${m.nombre}`}
                            title="Eliminar permanentemente"
                          >
                            <span className="material-symbols-outlined icon" aria-hidden="true" style={{ color: 'var(--error)' }}>delete_forever</span>
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => { e.stopPropagation(); openEdit(m); }}
                            aria-label={`Reactivar a ${m.nombre}`}
                            title="Reactivar"
                          >
                            <span className="material-symbols-outlined icon" aria-hidden="true" style={{ color: 'var(--success)' }}>person_add</span>
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
            sinFilas
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
                  <div className="celda-estado">
                    <BadgeEstado estado={estadoDeMiembro(m)} />
                    <BotonWhatsapp m={m} />
                  </div>
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
                {/* Las acciones de la tabla: aqui no hay fila que tocar, asi que la ficha lleva boton
                    (un miembro desactivado se reactiva en ella, con «Miembro activo»). */}
                <footer className="miembro-card__actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openEdit(m)}
                    aria-label={`Ver ficha de ${m.nombre}`}
                  >
                    <span className="material-symbols-outlined icon" aria-hidden="true">badge</span>
                    Ver ficha
                  </button>
                  {m.activo ? (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => askDeactivate(m)}
                      aria-label={`Desactivar a ${m.nombre}`}
                    >
                      <span className="material-symbols-outlined icon" aria-hidden="true">person_remove</span>
                      Desactivar
                    </button>
                  ) : (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => askDelete(m)}
                      aria-label={`Eliminar permanentemente a ${m.nombre}`}
                    >
                      <span className="material-symbols-outlined icon" aria-hidden="true">delete_forever</span>
                      Eliminar
                    </button>
                  )}
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
              disabled={editSaving || !editCompleto}
            >
              <span className="material-symbols-outlined icon" aria-hidden="true">save</span>
              {editSaving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </>
        }
      >
        <form id="miembros-edit-form" className="auth-form" onSubmit={onSaveEdit} noValidate>
          {editError && (
            <div className="alert alert-error" role="alert" style={{ marginBottom: 12 }}>
              <span className="material-symbols-outlined icon" aria-hidden="true">error</span>
              <span>{editError}</span>
            </div>
          )}
          {editInfo && (
            <div className="alert alert-success" role="status" style={{ marginBottom: 12 }}>
              <span className="material-symbols-outlined icon" aria-hidden="true">check_circle</span>
              <span>{editInfo}</span>
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
                    <span className="material-symbols-outlined" aria-hidden="true">qr_code_2</span>
                  </div>}
              <div className="miembro-qr-panel__body">
                <span className="field-label">Código QR</span>
                <code className="miembro-qr-panel__codigo">{editing.codigo_qr}</code>
                <div className="miembro-qr-panel__acciones">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={copiarCodigoQr}>
                    <span className="material-symbols-outlined icon" aria-hidden="true">
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
                      <span className="material-symbols-outlined icon" aria-hidden="true">download</span>
                      Descargar
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={enviarContratoPorWhatsapp}
                    disabled={enviandoContrato || !editing?.id_miembro}
                    title="Envia el contrato de membresia por WhatsApp al miembro"
                  >
                    <span className="material-symbols-outlined icon" aria-hidden="true">
                      {enviandoContrato ? 'hourglass_empty' : 'description'}
                    </span>
                    {enviandoContrato ? 'Enviando...' : 'Enviar contrato'}
                  </button>
                </div>
              </div>
            </section>
          )}

          {editLoading && (
            <p className="field-hint" style={{ marginBottom: 12 }}>
              Cargando los datos completos del miembro…
            </p>
          )}
          {editing && !editLoading && !editCompleto && (
            <p className="field-hint" role="status" style={{ marginBottom: 12 }}>
              No se cargaron los datos completos del miembro, así que no se pueden guardar cambios. Cierra la ficha y vuelve a abrirla.
            </p>
          )}

          {/* --- Plan del miembro ------------------------------------------
              Vive en otra tabla, asi que tiene su propio boton de guardar y
              no viaja con el resto de la ficha. */}
          {/* Si el plan no cargo no hay editor, pero el motivo se ve igual. */}
          {!planForm && planError && <p className="field-error">{planError}</p>}
          {planForm && (
            <section className="plan-editor">
              <header className="plan-editor__cabecera">
                <div>
                  <h4>Plan y cobro</h4>
                  <p>
                    {planForm.existe
                      ? 'Cambia el plan, renueva el vencimiento o registra un pago.'
                      : 'Este miembro aún no tiene plan. Créale uno acá.'}
                  </p>
                </div>
                <span className={`plan-editor__estado plan-editor__estado--${planForm.estado_pago.toLowerCase()}`}>
                  {planForm.estado_pago}
                </span>
              </header>

              <div className="auth-form-row">
                <label className="field">
                  <span className="field-label">Tipo de plan</span>
                  <select
                    className="field-input"
                    value={planForm.tipo_plan}
                    onChange={(e) => cambiarPlan('tipo_plan', e.target.value)}
                  >
                    {TIPOS_PLAN.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Inicio</span>
                  <CampoFecha
                    value={planForm.fecha_inicio}
                    onChange={(v) => cambiarPlan('fecha_inicio', v)}
                    anosAtras={5}
                  />
                </label>
              </div>

              <div className="auth-form-row">
                <label className="field">
                  <span className="field-label">Vence</span>
                  <CampoFecha
                    value={planForm.fecha_fin}
                    onChange={(v) => cambiarPlan('fecha_fin', v)}
                    anosAtras={5}
                  />
                  <span className="field-hint">Se calcula sola al cambiar el plan, pero puedes ajustarla.</span>
                </label>
                <label className="field">
                  <span className="field-label">Valor del plan</span>
                  <input
                    className="field-input"
                    type="number"
                    min="0"
                    value={planForm.valor_total}
                    onChange={(e) => cambiarPlan('valor_total', e.target.value)}
                    placeholder="0"
                  />
                </label>
              </div>

              <div className="auth-form-row">
                <label className="field">
                  <span className="field-label">Valor pagado</span>
                  <input
                    className="field-input"
                    type="number"
                    min="0"
                    value={planForm.valor_pagado}
                    onChange={(e) => cambiarPlan('valor_pagado', e.target.value)}
                    placeholder="0"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Método de pago</span>
                  <select
                    className="field-input"
                    value={planForm.metodo_pago}
                    onChange={(e) => cambiarPlan('metodo_pago', e.target.value)}
                  >
                    {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>

              <label className="field">
                <span className="field-label">Referencia o comprobante</span>
                <input
                  className="field-input"
                  value={planForm.referencia_pago}
                  onChange={(e) => cambiarPlan('referencia_pago', e.target.value)}
                  placeholder="Número de transacción, recibo…"
                />
              </label>

              {planError && <p className="field-error">{planError}</p>}
              {planMsg && <p className="field-ok">{planMsg}</p>}

              <button
                type="button"
                className="btn btn-primary btn-sm plan-editor__guardar"
                onClick={guardarPlan}
                disabled={planGuardando}
              >
                <span className="material-symbols-outlined icon" aria-hidden="true">savings</span>
                {planGuardando ? 'Guardando…' : 'Guardar plan'}
              </button>

              {/* --- Congelar la membresia (RQF-04) ----------------------- */}
              {planForm.existe && (
                <div className="plan-congelar" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  {planForm.congelado_desde ? (
                    <p style={{ fontSize: 13, marginBottom: 10 }}>
                      <span className="material-symbols-outlined icon" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }}>ac_unit</span>
                      Congelada desde el {formatearFechaDia(planForm.congelado_desde)}
                      {` (${planForm.dias_congelado} ${planForm.dias_congelado === 1 ? 'día' : 'días'}).`}
                      {' '}Al descongelarla, el vencimiento se correrá esos días.
                    </p>
                  ) : (
                    <p style={{ fontSize: 13, marginBottom: 10, color: 'var(--on-surface-variant)' }}>
                      Si el miembro va a dejar de venir por un tiempo (viaje, incapacidad), congela la membresía:
                      no contará como vencida y los días congelados se suman al vencimiento al descongelarla.
                    </p>
                  )}

                  {esAdmin ? (
                    planForm.congelado_desde ? (
                      <button type="button" className="btn btn-secondary btn-sm"
                        onClick={() => cambiarCongelamiento('descongelar')} disabled={congelando}>
                        <span className="material-symbols-outlined icon" aria-hidden="true">sunny</span>
                        {congelando ? 'Descongelando…' : 'Descongelar membresía'}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          className="field-input"
                          style={{ flex: '1 1 220px' }}
                          value={motivoCongelar}
                          maxLength={200}
                          onChange={(e) => setMotivoCongelar(e.target.value)}
                          placeholder="Motivo (opcional): viaje, incapacidad…"
                          aria-label="Motivo del congelamiento"
                        />
                        <button type="button" className="btn btn-secondary btn-sm"
                          onClick={() => cambiarCongelamiento('congelar')} disabled={congelando}>
                          <span className="material-symbols-outlined icon" aria-hidden="true">ac_unit</span>
                          {congelando ? 'Congelando…' : 'Congelar membresía'}
                        </button>
                      </div>
                    )
                  ) : (
                    <p className="field-hint">Solo el administrador puede congelar o descongelar la membresía.</p>
                  )}

                  {congelaciones.length > 0 && (
                    <ul style={{ marginTop: 12, fontSize: 12, color: 'var(--on-surface-variant)', paddingLeft: 18 }}>
                      {congelaciones.map((c) => (
                        <li key={c.id_congelacion}>
                          {formatearFechaDia(c.fecha_inicio)}
                          {c.fecha_fin
                            ? ` → ${formatearFechaDia(c.fecha_fin)} (${c.dias} ${c.dias === 1 ? 'día' : 'días'})`
                            : ' → sigue congelada'}
                          {c.motivo ? ` · ${c.motivo}` : ''}
                          {c.congelada_por ? ` · congeló ${c.congelada_por}` : ''}
                          {c.descongelada_por ? `, descongeló ${c.descongelada_por}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
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
          {/* RQF-15: la ficha solo sabe si ya hay contrasena de la app (password_asignada), nunca cual es. */}
          <div className="auth-form-row">
            <label className="field" style={{ flex: 1 }}>
              <span id="etiqueta-clave-ficha" className="field-label">Contraseña de la app</span>
              <input
                ref={campoClaveFicha}
                className={`field-input${errorClaveEdit ? ' field-input--error' : ''}`}
                aria-labelledby="etiqueta-clave-ficha"
                type="password"
                autoComplete="new-password"
                value={editForm.password || ''}
                onChange={(e) => {
                  const valor = e.target.value;
                  setErrorClaveEdit('');
                  setEditForm((f) => ({ ...f, password: valor }));
                }}
                placeholder={editing?.password_asignada ? 'Escribe una nueva solo si quieres cambiarla' : 'Mínimo 6 caracteres'}
                aria-invalid={errorClaveEdit ? 'true' : undefined}
                aria-describedby="ayuda-clave-ficha"
              />
              <ErrorCampo msg={errorClaveEdit} />
              <span id="ayuda-clave-ficha" className="field-hint">
                {avisoContrasenaFicha({
                  passwordAsignada: editing?.password_asignada,
                  appAcceso: editing?.app_acceso,
                  telefono: editForm.telefono,
                })}
              </span>
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
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setEditForm({ ...editForm, fecha_nacimiento: e.target.value })}
              />
            </label>
          </div>

          {/* RQNF-17: menor de edad -> representante legal y su autorizacion */}
          {menorEdit && (
            <>
              <RepresentanteCampos
                valores={editForm}
                onChange={(campo, valor) => setEditForm((f) => ({ ...f, [campo]: valor }))}
                edad={edadEdit}
              />
              <CasillaAutorizacion
                tipo="REPRESENTANTE_MENOR"
                obligatoria
                checked={editForm.autoriza_representante}
                onChange={(v) => setEditForm((f) => ({ ...f, autoriza_representante: v }))}
                nota={autorizacionesEdit?.vigentes?.REPRESENTANTE_MENOR?.otorgada
                  ? `Ya registrada el ${new Date(autorizacionesEdit.vigentes.REPRESENTANTE_MENOR.fecha).toLocaleDateString('es-CO')}. Márcala de nuevo solo si cambian los datos del representante.`
                  : 'Todavía no está registrada: márcala para poder guardar.'}
              />
            </>
          )}

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

          {/* RQNF-17: autorizacion de datos sensibles. Desmarcarla y guardar
              la revoca, deja constancia en el historial y borra los datos. */}
          <CasillaDatosSensibles
            checked={editForm.autorizo_datos_sensibles}
            onChange={(v) => setEditForm((f) => ({ ...f, autorizo_datos_sensibles: v }))}
            menor={menorEdit}
            aviso={
              editing?.autorizo_datos_sensibles && !editForm.autorizo_datos_sensibles
                ? 'Al guardar se revoca la autorización y se borran las condiciones médicas y las alergias. Queda constancia en el historial.'
                : editing?.datos_sensibles_sin_autorizacion && !editForm.autorizo_datos_sensibles
                  ? 'Este miembro tiene datos de salud guardados sin una autorización separada (registro anterior). Si guardas sin marcar la autorización, se borran.'
                  : null
            }
          />
          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Condiciones médicas</span>
              <textarea
                className="field-input"
                rows={2}
                value={editForm.condiciones_medicas || ''}
                onChange={(e) => setEditForm({ ...editForm, condiciones_medicas: e.target.value })}
                placeholder={editForm.autorizo_datos_sensibles ? 'Lesiones, tratamientos, etc.' : 'Requiere la autorización de datos sensibles'}
                disabled={!editForm.autorizo_datos_sensibles}
              />
            </label>
            <label className="field">
              <span className="field-label">Alergias</span>
              <textarea
                className="field-input"
                rows={2}
                value={editForm.alergias || ''}
                onChange={(e) => setEditForm({ ...editForm, alergias: e.target.value })}
                placeholder={editForm.autorizo_datos_sensibles ? 'Alimentos, medicamentos…' : 'Requiere la autorización de datos sensibles'}
                disabled={!editForm.autorizo_datos_sensibles}
              />
            </label>
          </div>
          {/* RQNF-16 (Ley 2300 de 2023): el interruptor de mensajes comerciales.
              Apagarlo y guardar da de baja al miembro; queda en el historial. */}
          <CasillaMensajesComerciales
            checked={editForm.acepta_mensajes_comerciales}
            onChange={(v) => setEditForm((f) => ({ ...f, acepta_mensajes_comerciales: v }))}
            canales={editForm.canales_comerciales}
            onCanales={(v) => setEditForm((f) => ({ ...f, canales_comerciales: v }))}
            menor={menorEdit}
            aviso={editing?.acepta_mensajes_comerciales && !editForm.acepta_mensajes_comerciales
              ? 'Al guardar, el miembro deja de recibir campañas y mensajes de retención. Queda constancia en el historial.'
              : null}
          />
          <details style={{ marginBottom: 8 }}>
            <summary className="field-label" style={{ cursor: 'pointer' }}>Historial de autorizaciones</summary>
            <HistorialAutorizaciones historial={autorizacionesEdit?.historial} />
          </details>

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
              <span className="material-symbols-outlined icon" aria-hidden="true">person_remove</span>
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
              <span className="material-symbols-outlined icon" aria-hidden="true">delete_forever</span>
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
              <span className="material-symbols-outlined icon" aria-hidden="true">chat</span>
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
              <span className="material-symbols-outlined icon" aria-hidden="true">content_copy</span>
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