import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import '../styles/landing.css';

const SOLUTIONS = [
  {
    icon: 'account_balance',
    title: 'Control Financiero',
    text: 'Visualiza los ingresos, suscripciones activas y proyección de caja en tiempo real. Soporte nativo para moneda local (COP) y precisión de pago al centavo.',
    span: 'wide',
  },
  {
    icon: 'qr_code_scanner',
    title: 'Accesos con QR',
    text: 'Genera pases únicos dinámicos en la app del socio. Olvida la lista y deja que el QR se encargue de la entrada.',
    span: 'narrow',
  },
  {
    icon: 'tune',
    title: 'Perfiles Detallados',
    text: 'Información actualizada: estado de cuenta y renovación automática. Todo a un clic de distancia.',
    span: 'narrow',
  },
  {
    icon: 'storefront',
    title: 'Arquitectura Multi-Sede',
    text: 'Pensada para crecer: gestiona múltiples ubicaciones bajo una misma cuenta madre. Reportes consolidados y permisos por rol para tu equipo de administradores.',
    span: 'wide',
  },
];

const PAINS = [
  { icon: 'close', title: 'Cobros a mano cada mes', text: 'Persiguiendo pagos por WhatsApp y contando billetes. Una hora cada día.' },
  { icon: 'close', title: 'Lista en papel y celular', text: 'Quiénes deben, quiénes vencieron y quién lleva 2 meses sin venir. Imposible saberlo.' },
  { icon: 'close', title: 'No sabes si está al día', text: 'Dejas entrar, el mes siguiente no paga y nadie entendió por qué.' },
  { icon: 'close', title: 'Cuentas claras no en Excel', text: 'Cuatro hojas distintas, tres versiones distintas y al final nadie sabe cuánto entró.' },
];

const STEPS = [
  { num: '01', title: 'Crea tu gimnasio', text: 'En menos de 2 minutos: nombre, ciudad y método de cobro. Sin tarjeta de crédito.', time: '~ 2 min' },
  { num: '02', title: 'Agrega tus miembros', text: 'Carga uno a uno o importa desde Excel. Cada quien recibe su QR automático.', time: '~ 5 min' },
  { num: '03', title: 'Cobra y deja entrar', text: 'Configura tu día de cobro. Escanea códigos desde el celular o compu. Listo.', time: '~ 3 min' },
];

const PRICING = [
  {
    name: 'Prueba 14 días',
    price: '$0',
    period: 'Cancela cuando quieras',
    featured: false,
    tag: 'Gratis',
    features: [
      'Hasta 30 miembros activos',
      'QR de acceso ilimitado',
      'Cobros recurrentes en COP',
      'Reportes de asistencia',
      'Soporte por WhatsApp',
    ],
    cta: 'Empezar gratis',
    note: 'No pedimos tarjeta',
  },
  {
    name: 'Plan Gimnasio',
    price: '$39.900',
    period: 'COP / mes',
    featured: true,
    tag: 'Recomendado',
    features: [
      'Miembros ilimitados',
      'Roles: dueño, entrenador, recep',
      'Multi-sede (próximamente)',
      'Reportes avanzados',
      'Soporte prioritario',
    ],
    cta: 'Probar 14 días',
    note: 'Cancela cuando quieras',
  },
];

const FAQ = [
  { q: '¿Necesito conocimientos técnicos?', a: 'No. Si sabes mandar audios de WhatsApp, sabes usar FitLoyalty. Te guiamos paso a paso al activar tu gimnasio.' },
  { q: '¿Cómo recibo el dinero de las mensualidades?', a: 'FitLoyalty cobra directo a tu cuenta de cobro (PSE, Nequi o DaviPlata). Nunca tocamos tu dinero.' },
  { q: '¿Y si tengo muchos miembros?', a: 'Empieza con el plan de 14 días. Si tienes más de 30 miembros activos, te llevamos al plan Gimnasio.' },
  { q: '¿Funciona en mi celular?', a: 'Sí. Funciona en cualquier celular moderno o computador con navegador. No necesitas instalar nada.' },
  { q: '¿Cómo cancelo?', a: 'Con un clic en tu panel. Sin cláusulas, sin letra pequeña, sin perder tus datos.' },
];

function HeroMock() {
  return (
    <div className="hero-mock" aria-hidden="true">
      <div className="hero-mock-bar"><span/><span/><span/></div>
      <div className="hero-mock-grid">
        <div className="hero-mock-tile uv">
          <h5>Miembros activos</h5>
          <strong>148</strong>
        </div>
        <div className="hero-mock-tile">
          <h5>Ingresos del mes</h5>
          <strong>$4.92M</strong>
        </div>
        <div className="hero-mock-chart">
          <svg viewBox="0 0 320 110" preserveAspectRatio="none">
            <defs>
              <linearGradient id="hp-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#7C5CE6" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#7C5CE6" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 90 L40 70 L80 80 L120 50 L160 55 L200 30 L240 35 L280 15 L320 20 L320 110 L0 110 Z"
              fill="url(#hp-fill)"
            />
            <path
              d="M0 90 L40 70 L80 80 L120 50 L160 55 L200 30 L240 35 L280 15 L320 20"
              fill="none"
              stroke="#7C5CE6"
              strokeWidth="2"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      {/* ---------- HEADER ---------- */}
      <header className="landing-header">
        <Link to="/" className="landing-brand" aria-label="Inicio FitLoyalty">
          <Logo height={32} />
        </Link>
        <nav className="landing-nav" aria-label="Navegación principal">
          <a className="landing-nav-link" href="#solucion">Solución</a>
          <a className="landing-nav-link" href="#como-funciona">Cómo funciona</a>
          <a className="landing-nav-link" href="#planes">Planes</a>
          <a className="landing-nav-link" href="#faq">FAQ</a>
          <Link className="btn btn-secondary btn-sm" to="/login">Iniciar sesión</Link>
          <Link className="btn btn-primary btn-sm" to="/register-owner">Crear cuenta</Link>
        </nav>
      </header>

      {/* ---------- HERO ---------- */}
      <section className="landing-hero">
        <div>
          <div className="hero-eyebrow">
            <span className="dot" />
            <span>Diseñado para gimnasios pequeños de <strong>Colombia</strong></span>
          </div>
          <h1 className="hero-title">
            El motor de tu <em>gimnasio</em>, sin enredos ni cobros a mano.
          </h1>
          <p className="hero-lead">
            FitLoyalty te cobra mensualidades en COP automáticamente, le entrega un QR único a cada miembro y te
            deja saber quién está al día desde un solo panel. Piénsalo como un asistente que conoce a todos tus clientes.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" to="/register-owner">
              Empieza gratis 14 días
              <span className="material-symbols-outlined icon">arrow_forward</span>
            </Link>
            <Link className="btn btn-secondary btn-lg" to="/login">
              Ya tengo cuenta
            </Link>
          </div>
          <div className="hero-cap">
            No pedimos tarjeta · Cancela cuando quieras · Listo en menos de 10 minutos
          </div>
          <ul className="hero-proof" aria-label="Pruebas sociales">
            <li>
              <span className="hero-proof-num">+12</span>
              gimnasios en Bogotá y Medellín ya lo usan
            </li>
            <li>
              <span className="hero-proof-num">98%</span>
              de los cobros llegan sin perseguir al miembro
            </li>
            <li>
              <span className="hero-proof-num">&lt; 1s</span>
              tiempo promedio de check-in por QR
            </li>
          </ul>
        </div>
        <HeroMock />
      </section>

      {/* ---------- DOLOR ---------- */}
      <section className="section" aria-labelledby="pain-title">
        <span className="section-eyebrow">EL PROBLEMA</span>
        <h2 className="section-title" id="pain-title">
          ¿Te suena conocido?
        </h2>
        <p className="section-lead">
          Estos son los cuatro dolores que escuchamos de los dueños de gimnasio todas las semanas.
        </p>
        <div className="pain-grid">
          {PAINS.map((p, i) => (
            <article className="pain-card" key={i}>
              <div className="x"><span className="material-symbols-outlined icon">{p.icon}</span></div>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- SOLUCIÓN (zig-zag) ---------- */}
      <section className="section" id="solucion" aria-labelledby="sol-title">
        <span className="section-eyebrow">LA SOLUCIÓN</span>
        <h2 className="section-title" id="sol-title">
          Todo lo que tu gimnasio necesita, en un solo lugar.
        </h2>
        <p className="section-lead">
          Cada módulo está pensado para una tarea específica. Si lo combinas con tus métodos actuales en menos de una
          semana ya estás funcionando sin estrés.
        </p>
        <div className="solution-grid">
          {SOLUTIONS.map((s, i) => (
            <article
              className={`solution-card glass-card s-pos-${i + 1}`}
              key={i}
            >
              <div className="solution-card__icon">
                <span className="material-symbols-outlined icon">{s.icon}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- CÓMO FUNCIONA ---------- */}
      <section className="section" id="como-funciona" aria-labelledby="how-title">
        <span className="section-eyebrow">CÓMO FUNCIONA</span>
        <h2 className="section-title" id="how-title">
          De cero a operando en menos de 10 minutos.
        </h2>
        <p className="section-lead">
          Sin tarjeta, sin instalar nada, sin enredos. Te guiamos paso a paso.
        </p>
        <div className="howto-steps">
          {STEPS.map((s, i) => (
            <article className="howto-step" key={i}>
              <div className="howto-step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <span className="howto-time">⏱ {s.time}</span>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- PLANES ---------- */}
      <section className="section" id="planes" aria-labelledby="planes-title">
        <span className="section-eyebrow">PLANES</span>
        <h2 className="section-title" id="planes-title">
          Empieza gratis. Crece cuando quieras.
        </h2>
        <p className="section-lead">
          Sin contratos, sin cláusulas, sin letra pequeña. Si te sirve, te quedas.
        </p>
        <div className="pricing-grid">
          {PRICING.map((p, i) => (
            <article className={`pricing-card${p.featured ? ' featured' : ''}`} key={i}>
              <span className={`pricing-tag ${p.featured ? 'featured' : 'muted'}`}>{p.tag}</span>
              <span className="pricing-name">{p.name}</span>
              <div className="pricing-price">
                <span className="pricing-amount">{p.price}</span>
                <span className="pricing-period">{p.period}</span>
              </div>
              <ul className="pricing-list">
                {p.features.map((f, j) => (
                  <li key={j}><span className="material-symbols-outlined icon">check</span>{f}</li>
                ))}
              </ul>
              <button
                className={`btn ${p.featured ? 'btn-primary' : 'btn-secondary'} btn-block btn-lg`}
                onClick={() => navigate('/register-owner')}
              >
                {p.cta}
              </button>
              <span className="pricing-note">{p.note}</span>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- TESTIMONIO ---------- */}
      <section className="testimonial" aria-label="Testimonio">
        <p className="testimonial-quote">
          “Dejé de perseguir pagos por WhatsApp. Lo que más me gusta es ver, en un solo panel, quién paga, quién
          vence hoy y quién abandonó.”
        </p>
        <div className="testimonial-author">
          <div className="testimonial-avatar">JR</div>
          <div className="testimonial-meta">
            <strong>Juan Ramírez</strong>
            <span>Dueño · IronBox Bogotá</span>
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="section" id="faq" aria-labelledby="faq-title">
        <span className="section-eyebrow">PREGUNTAS FRECUENTES</span>
        <h2 className="section-title" id="faq-title">
          Lo que siempre nos preguntan.
        </h2>
        <div className="faq-list">
          {FAQ.map((f, i) => (
            <details className="faq-item" key={i}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- FINAL CTA ---------- */}
      <section className="landing-final">
        <h2>Deja de perseguir pagos hoy mismo.</h2>
        <p>Crea tu gimnasio gratis. Sin tarjeta. En menos de 2 minutos.</p>
        <button
          className="btn btn-primary btn-lg"
          onClick={() => navigate('/register-owner')}
        >
          Empezar gratis 14 días
          <span className="material-symbols-outlined icon">arrow_forward</span>
        </button>
      </section>

      {/* ---------- FOOTER ---------- */}
      <footer className="landing-footer">
        <div className="footer-cols">
          <div>
            <Link to="/" className="landing-brand" aria-label="Inicio FitLoyalty">
              <Logo height={28} />
            </Link>
            <p className="footer-tag">
              La herramienta hecha en Colombia para los gimnasios pequeños que quieren crecer sin volverse locos
              con los cobros.
            </p>
          </div>
          <div>
            <div className="footer-title">Producto</div>
            <Link to="/login">Iniciar sesión</Link>
            <Link to="/register-owner">Crear cuenta</Link>
            <a href="#planes">Planes</a>
          </div>
          <div>
            <div className="footer-title">Empresa</div>
            <a href="#solucion">Cómo funciona</a>
            <a href="#faq">FAQ</a>
            <a href="mailto:fitloyaltysaas@gmail.com">Contacto</a>
          </div>
          <div>
            <div className="footer-title">Legal</div>
            <Link to="/legal/terminos">Términos y condiciones</Link>
            <Link to="/legal/privacidad">Política de privacidad</Link>
            <Link to="/legal/datos">Política de datos</Link>
            <Link to="/legal/eliminar-cuenta">Eliminar cuenta</Link>
          </div>
        </div>
        <div className="footer-bottom">© {new Date().getFullYear()} FitLoyalty</div>
      </footer>
    </div>
  );
}