import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const ICONS = {
  qr: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <line x1="14" y1="14" x2="21" y2="14" />
      <line x1="14" y1="21" x2="21" y2="21" />
      <line x1="14" y1="14" x2="14" y2="21" />
      <line x1="21" y1="14" x2="21" y2="21" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
      <rect x="3" y="11" width="18" height="11" rx="0" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
};

export default function LandingPage() {
  return (
    <div>
      {/* ============================================================
          HEADER — navegación principal con anclas
          ============================================================ */}
      <header className="landing-header">
        <Link to="/" className="brand-row" aria-label="FitLoyalty, ir al inicio">
          <div className="brand-mark">FL</div>
          <div className="brand-name">FitLoyalty</div>
        </Link>
        <nav className="landing-nav" aria-label="Navegación principal">
          <a href="#solucion" className="nav-link">Qué hace</a>
          <a href="#como-funciona" className="nav-link">Cómo funciona</a>
          <a href="#precios" className="nav-link">Precios</a>
          <a href="#preguntas" className="nav-link">Preguntas</a>
          <Link to="/login" className="btn btn-secondary btn-sm">Iniciar sesión</Link>
          <Link to="/register" className="btn btn-primary btn-sm">Empezar gratis</Link>
        </nav>
      </header>

      {/* ============================================================
          HERO — propuesta de valor + prueba social + CTA doble
          ============================================================ */}
      <section className="landing-hero">
        <div className="hero-badge">
          <span className="hero-badge-dot" aria-hidden="true" />
          7 días gratis · Sin tarjeta de crédito
        </div>

        <h1>
          Deja de administrar tu gimnasio<br />
          en una <span className="hl-orange">hoja de cálculo.</span>
        </h1>

        <p>
          FitLoyalty te da check-in por QR, control de miembros y métricas de retención
          en un solo panel, pensado para gimnasios de barrio en Colombia.
        </p>

        <div className="landing-cta">
          <Link to="/register" className="btn btn-primary">
            Crear mi gimnasio gratis
            <span className="btn-arrow" aria-hidden="true">→</span>
          </Link>
          <Link to="/login" className="btn btn-secondary">Ya tengo cuenta</Link>
        </div>

        <ul className="hero-proof" aria-label="Confianza">
          <li>
            <span className="hero-proof-num">+200</span>
            miembros por gimnasio en promedio
          </li>
          <li>
            <span className="hero-proof-num">3 min</span>
            para registrar tu primer ingreso
          </li>
          <li>
            <span className="hero-proof-num">100%</span>
            en español de Colombia
          </li>
        </ul>
      </section>

      {/* ============================================================
          DOLOR — el problema real del gimnasio de barrio
          ============================================================ */}
      <section className="landing-pain" id="problema">
        <div className="section-eyebrow">El problema</div>
        <h2 className="section-title">
          Esto es lo que casi todo gimnasio de barrio está haciendo hoy.
        </h2>

        <div className="pain-grid">
          <article className="pain-card pain-card-no">
            <span className="pain-x" aria-hidden="true">×</span>
            <h3>Llevas los miembros en una hoja de Excel</h3>
            <p>Y nadie sabe si está vencido hasta que llega a la puerta y hay pelea.</p>
          </article>

          <article className="pain-card pain-card-no">
            <span className="pain-x" aria-hidden="true">×</span>
            <h3>No tienes idea de quién dejó de venir</h3>
            <p>Hasta que un día cancela, y ya es demasiado tarde para recuperarlo.</p>
          </article>

          <article className="pain-card pain-card-no">
            <span className="pain-x" aria-hidden="true">×</span>
            <h3>Tu recepcionista «anota» los ingresos en un cuaderno</h3>
            <p>Y al final del mes no sabes cuánta gente real entró al gimnasio.</p>
          </article>
        </div>
      </section>

      {/* ============================================================
          SOLUCIÓN — qué hace FitLoyalty cada día (concretos)
          ============================================================ */}
      <section className="landing-solution" id="solucion">
        <div className="section-eyebrow">La solución</div>
        <h2 className="section-title">
          FitLoyalty es el sistema que sí usa tu equipo.
          <span className="section-sub"> Esto es lo que hace cada día.</span>
        </h2>

        <div className="solution-grid">
          <article className="solution-card">
            <div className="solution-icon">{ICONS.qr}</div>
            <div className="solution-tag">Check-in</div>
            <h3>Escanea el QR y entra quien deba entrar.</h3>
            <p>
              Tu recepcionista escanea el QR del miembro con el celular o busca el documento.
              El sistema le avisa en verde si la membresía está al día y en amarillo si vence esta semana.
              Si está vencida, no entra.
            </p>
            <ul className="solution-list">
              <li>Cero filas en la puerta.</li>
              <li>Cero «es que la factura la perdí».</li>
              <li>Funciona con lectores QR USB desde $50.000.</li>
            </ul>
          </article>

          <article className="solution-card">
            <div className="solution-icon">{ICONS.team}</div>
            <div className="solution-tag">Staff</div>
            <h3>Tú invitas, ellos no se registran solos.</h3>
            <p>
              Tu recepcionista o un segundo dueño llega al gimnasio sin que tengas que crearle una cuenta.
              Tú le envías un correo, ella abre el link y crea su contraseña en menos de 30 segundos.
              Tú decides quién entra y quién sale.
            </p>
            <ul className="solution-list">
              <li>Sin autogestión de cuentas que se te descontrolen.</li>
              <li>Bajas a un usuario en un solo clic.</li>
              <li>Cada persona ve solo lo que le corresponde.</li>
            </ul>
          </article>

          <article className="solution-card">
            <div className="solution-icon">{ICONS.chart}</div>
            <div className="solution-tag">Retención</div>
            <h3>Te dice a quién llamar antes de que cancele.</h3>
            <p>
              El panel calcula automáticamente quiénes llevan más de 15 días sin ir,
              a quiénes se les vence esta semana y qué tan activo fue tu gimnasio
              en los últimos 90 días. Pasa de apagar incendios a anticiparte.
            </p>
            <ul className="solution-list">
              <li>Alertas de miembros en riesgo.</li>
              <li>Gráfico semanal de asistencia.</li>
              <li>Comparación mes a mes.</li>
            </ul>
          </article>

          <article className="solution-card">
            <div className="solution-icon">{ICONS.lock}</div>
            <div className="solution-tag">Datos</div>
            <h3>Tus datos solo los ve tu gimnasio.</h3>
            <p>
              Cada gimnasio vive en una burbuja: tu información de miembros, asistencia
              y staff no se mezcla con la de otros gimnasios. Está guardado en
              servidores de Colombia y respaldado todas las noches.
            </p>
            <ul className="solution-list">
              <li>Multi-tenant estricto.</li>
              <li>Recuperación de contraseña por correo.</li>
              <li>Sesiones cifradas con JWT.</li>
            </ul>
          </article>
        </div>
      </section>

      {/* ============================================================
          CÓMO FUNCIONA — 3 pasos, el más corto posible
          ============================================================ */}
      <section className="landing-howto" id="como-funciona">
        <div className="section-eyebrow">Cómo funciona</div>
        <h2 className="section-title">De cero a operando en menos de 15 minutos.</h2>

        <ol className="howto-steps">
          <li className="howto-step">
            <div className="howto-num">01</div>
            <h3>Creas tu gimnasio</h3>
            <p>Nombre, tu teléfono y listo. Creas tu cuenta de dueño en el mismo paso.</p>
            <div className="howto-time">≈ 1 min</div>
          </li>

          <li className="howto-step">
            <div className="howto-num">02</div>
            <h3>Invitas a tu equipo</h3>
            <p>Tu recepcionista y tus otros admins llegan por un correo con su propio enlace.</p>
            <div className="howto-time">≈ 2 min</div>
          </li>

          <li className="howto-step howto-step-active">
            <div className="howto-num">03</div>
            <h3>Empiezas a registrar ingresos</h3>
            <p>QR, documento o nombre. El sistema ya cuenta asistencia y arma tus reportes.</p>
            <div className="howto-time">≈ 10 min</div>
          </li>
        </ol>
      </section>

      {/* ============================================================
          PRECIOS — sin sorpresas, con el trial al frente
          ============================================================ */}
      <section className="landing-pricing" id="precios">
        <div className="section-eyebrow">Precios</div>
        <h2 className="section-title">Empieza gratis. Decide después.</h2>
        <p className="section-lead">
          Los primeros 7 días son con todo desbloqueado. Si el gimnasio te funciona,
          activas tu plan. Si no, no perdiste nada.
        </p>

        <div className="pricing-grid">
          <article className="pricing-card pricing-card-active">
            <div className="pricing-tag">Días 1 a 7</div>
            <h3 className="pricing-name">Prueba gratis</h3>
            <div className="pricing-price">
              <span className="pricing-amount">$0</span>
              <span className="pricing-period">7 días</span>
            </div>
            <ul className="pricing-list">
              <li>Miembros ilimitados</li>
              <li>Check-in por QR y manual</li>
              <li>Dashboard completo</li>
              <li>Staff incluido</li>
              <li>Soporte por correo</li>
            </ul>
            <Link to="/register" className="btn btn-primary pricing-cta">
              Crear mi gimnasio
            </Link>
            <div className="pricing-note">No pedimos tarjeta de crédito.</div>
          </article>

          <article className="pricing-card">
            <div className="pricing-tag pricing-tag-muted">Después del día 7</div>
            <h3 className="pricing-name">Plan mensual</h3>
            <div className="pricing-price">
              <span className="pricing-amount">$79.000</span>
              <span className="pricing-period">/ mes</span>
            </div>
            <ul className="pricing-list">
              <li>Todo lo de la prueba gratis</li>
              <li>Reportes de retención por correo</li>
              <li>Soporte por WhatsApp</li>
              <li>Copias de seguridad diarias</li>
            </ul>
            <Link to="/register" className="btn btn-secondary pricing-cta">
              Empezar mi prueba
            </Link>
            <div className="pricing-note">Cancelas cuando quieras, sin penalización.</div>
          </article>
        </div>

        <p className="pricing-foot">
          ¿Tu gimnasio maneja varios locales?
          <a href="mailto:santi@fitloyalty.co"> Escríbenos </a>
          y armamos un plan multi-sede.
        </p>
      </section>

      {/* ============================================================
          TESTIMONIO — uno, creíble, específico
          ============================================================ */}
      <section className="landing-testimonial">
        <blockquote className="testimonial-quote">
          «Llevaba a los miembros en una hoja de Excel y a la recepcionista en un cuaderno.
          Con FitLoyalty tenemos claro quién vence, quién no ha venido y cuánto entró.
          Lo monté en una tarde.»
        </blockquote>
        <div className="testimonial-author">
          <div className="testimonial-avatar" aria-hidden="true">CR</div>
          <div>
            <div className="testimonial-name">Carolina Ramírez</div>
            <div className="testimonial-meta">Power House · Bogotá · dueña y administradora</div>
          </div>
        </div>
      </section>

      {/* ============================================================
          FAQ — las 5 objeciones más comunes
          ============================================================ */}
      <section className="landing-faq" id="preguntas">
        <div className="section-eyebrow">Preguntas frecuentes</div>
        <h2 className="section-title">Lo que más nos preguntan.</h2>

        <div className="faq-list">
          <details className="faq-item">
            <summary>¿Necesito tarjeta para los 7 días gratis?</summary>
            <p>No. Empiezas sin pedirte ningún dato de pago. Si al día 7 decides seguir, ahí sí te pedimos el medio de pago.</p>
          </details>

          <details className="faq-item">
            <summary>¿Mis recepcionistas pueden entrar al sistema?</summary>
            <p>Sí. Tú las invitas por correo desde el módulo de Staff. Ellas abren el enlace y crean su propia contraseña. Tú decides quién puede hacer check-in y quién puede administrar.</p>
          </details>

          <details className="faq-item">
            <summary>¿Qué pasa con mis datos si dejo de pagar?</summary>
            <p>Tus datos quedan guardados durante 90 días. Si reactivas dentro de ese plazo, los recuperas tal cual los dejaste.</p>
          </details>

          <details className="faq-item">
            <summary>¿Tienen app para celular?</summary>
            <p>La versión web funciona perfecto en el celular y en tablets. La app nativa la estamos terminando y quienes ya estén dentro la recibirán sin costo extra.</p>
          </details>

          <details className="faq-item">
            <summary>¿Cuánto cuesta?</summary>
            <p>$79.000 al mes por gimnasio, después de los 7 días gratis. Miembros y recepcionistas ilimitados.</p>
          </details>
        </div>
      </section>

      {/* ============================================================
          CTA FINAL — cierra la página con urgencia del trial
          ============================================================ */}
      <section className="landing-final">
        <h2>
          Tu próximo lunes en el gimnasio<br />
          puede empezar a contar.
        </h2>
        <p>7 días gratis. Sin tarjeta. Configúralo en una tarde.</p>
        <div className="landing-cta">
          <Link to="/register" className="btn btn-primary btn-lg">
            Crear mi gimnasio gratis
            <span className="btn-arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-cols">
          <div>
            <div className="brand-row">
              <div className="brand-mark">FL</div>
              <div className="brand-name">FitLoyalty</div>
            </div>
            <p className="footer-tag">
              El sistema operativo para gimnasios pequeños de Colombia.
            </p>
          </div>

          <div>
            <div className="footer-title">Producto</div>
            <a href="#solucion">Qué hace</a>
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#precios">Precios</a>
            <Link to="/login">Iniciar sesión</Link>
          </div>

          <div>
            <div className="footer-title">Soporte</div>
            <a href="mailto:santi@fitloyalty.co">Correo</a>
            <a href="#preguntas">Preguntas frecuentes</a>
          </div>

          <div>
            <div className="footer-title">Legal</div>
            <Link to="/">Términos y condiciones</Link>
            <Link to="/">Política de privacidad</Link>
          </div>
        </div>

        <div className="footer-bottom">
          FitLoyalty · 2026 · Hecho en Bogotá por Santiago Salamanca
        </div>
      </footer>
    </div>
  );
}
