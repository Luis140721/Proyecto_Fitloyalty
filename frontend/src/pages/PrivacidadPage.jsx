import LegalLayout from '../components/LegalLayout';

export default function PrivacidadPage() {
  return (
    <LegalLayout
      title="Política de privacidad"
      subtitle="Cómo FitLoyalty recopila, usa, almacena y protege los datos personales de los usuarios y miembros, conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013."
      updated="20 de agosto de 2026"
    >
      <h2>1. Responsable del tratamiento</h2>
      <p>
        Context AI, en su calidad de desarrollador y operador de FitLoyalty, actúa como{' '}
        <strong>Encargado del Tratamiento</strong> de los datos personales que se procesan en la
        Plataforma. El <strong>Responsable del Tratamiento</strong> es cada gimnasio que usa
        FitLoyalty, ya que es quien decide qué datos de sus miembros recolecta y para qué fines.
      </p>
      <div className="legal-callout">
        <div className="legal-callout__title">
          <span className="material-symbols-outlined">shield_person</span>
          Datos de contacto del Encargado
        </div>
        <p>
          Correo: <a href="mailto:hola@fitloyalty.co">hola@fitloyalty.co</a><br />
          Responsable de protección de datos (DPO): <a href="mailto:datos@fitloyalty.co">datos@fitloyalty.co</a>
        </p>
      </div>

      <h2>2. Datos que se recopilan</h2>
      <h3>2.1 Datos del Administrador y Staff</h3>
      <ul>
        <li>Nombre completo, correo electrónico y contraseña (hash).</li>
        <li>Nombre del gimnasio y ciudad.</li>
        <li>Fecha de último acceso y registro de actividad (logs de auditoría).</li>
      </ul>
      <h3>2.2 Datos de los Miembros</h3>
      <ul>
        <li>Nombre completo, documento de identidad, teléfono y correo electrónico (opcional).</li>
        <li>Plan de membresía, fecha de inicio y vencimiento, estado de pago.</li>
        <li>Código QR único de acceso.</li>
        <li>Historial de check-ins (fecha, hora y método de ingreso).</li>
      </ul>
      <h3>2.3 Datos técnicos</h3>
      <ul>
        <li>Dirección IP, tipo de navegador y dispositivo (para seguridad y prevención de fraude).</li>
        <li>Cookies de sesión (JWT en localStorage, no cookies de seguimiento de terceros).</li>
      </ul>

      <h2>3. Finalidad del tratamiento</h2>
      <p>
        Los datos personales se procesan exclusivamente para:
      </p>
      <ol>
        <li>Gestión de membresías: registro, renovación, control de accesos y facturación.</li>
        <li>Control de ingresos: validación de QR y registro de check-ins.</li>
        <li>Reportes y dashboard: indicadores de asistencia, retención y cobros para el gimnasio.</li>
        <li>Comunicaciones operativas: notificaciones de vencimiento de membresía, invitaciones de staff.</li>
        <li>Cumplimiento legal: conservación de registros requeridos por autoridades colombianas.</li>
      </ol>
      <p>
        FitLoyalty <strong>no vende, alquila ni comparte</strong> datos personales con terceros con
        fines comerciales.
      </p>

      <h2>4. Base legal: consentimiento</h2>
      <p>
        Conforme al artículo 10 de la Ley 1581 de 2012, el tratamiento de datos personales requiere
        el consentimiento previo, expreso e informado del titular. El consentimiento se obtiene:
      </p>
      <ul>
        <li><strong>Administrador y Staff:</strong> al aceptar estos términos al registrarse o aceptar una invitación.</li>
        <li><strong>Miembros:</strong> el gimnasio (Responsable) es quien debe obtener el consentimiento del miembro antes de registrar sus datos en FitLoyalty. FitLoyalty no tiene contacto directo con los miembros.</li>
      </ul>

      <h2>5. Derechos de los titulares (Habeas Data)</h2>
      <p>
        Conforme al artículo 8 de la Ley 1581 de 2012, los titulares de los datos tienen los
        siguientes derechos:
      </p>
      <ul>
        <li><strong>Acceder:</strong> conocer qué datos personales existen sobre ellos en la Plataforma.</li>
        <li><strong>Consultar:</strong> solicitar información sobre el uso dado a sus datos.</li>
        <li><strong>Actualizar:</strong> corregir datos desactualizados o incorrectos.</li>
        <li><strong>Rectificar:</strong> modificar datos que sean inexactos o incompletos.</li>
        <li><strong>Suprimir:</strong> solicitar la eliminación de sus datos cuando no sean necesarios para la finalidad para la que fueron recopilados.</li>
        <li><strong>Revocar la autorización:</strong> retirar el consentimiento otorgado para el tratamiento de sus datos.</li>
      </ul>
      <div className="legal-callout">
        <div className="legal-callout__title">
          <span className="material-symbols-outlined">how_to_vote</span>
          Cómo ejercer estos derechos
        </div>
        <p>
          Los miembros deben dirigir su solicitud al gimnasio (Responsable). El gimnasio, si requiere
          que FitLoyalty ejecute la supresión o modificación, debe contactarnos a{' '}
          <a href="mailto:datos@fitloyalty.co">datos@fitloyalty.co</a>. Atenderemos la solicitud en
          un plazo máximo de 10 días hábiles, prorrogable hasta 5 más según el artículo 14 del
          Decreto 1377 de 2013.
        </p>
      </div>

      <h2>6. Seguridad de los datos</h2>
      <p>
        FitLoyalty implementa las siguientes medidas técnicas y administrativas:
      </p>
      <ul>
        <li><strong>Cifrado en tránsito:</strong> TLS 1.2+ (HTTPS) en todo el tráfico entre cliente y servidor.</li>
        <li><strong>Cifrado en reposo:</strong> la base de datos (Neon Postgres) cifra los datos en disco.</li>
        <li><strong>Hash de contraseñas:</strong> bcrypt con salt rounds de 10.</li>
        <li><strong>Autenticación JWT:</strong> tokens firmados con expiración de 24 horas.</li>
        <li><strong>Aislamiento multitenant:</strong> cada gimnasio solo accede a sus propios datos.</li>
        <li><strong>Principio de mínimo privilegio:</strong> el Staff solo accede a las funciones permitidas por su rol.</li>
      </ul>

      <h2>7. Transferencia y transmisión internacional</h2>
      <p>
        Los datos se almacenan en servidores de Render (EE. UU.) y Neon Postgres (EE. UU.). Esta
        transferencia internacional se realiza bajo las salvaguardas del artículo 26 de la Ley 1581
        de 2012, garantizando un nivel adecuado de protección mediante los contratos y políticas de
        privacidad de dichos proveedores, que cumplen con estándares internacionales (SOC 2, GDPR).
      </p>

      <h2>8. Conservación de los datos</h2>
      <p>
        Los datos se conservan mientras el gimnasio mantenga su cuenta activa. Tras la cancelación:
      </p>
      <ul>
        <li>Los datos se conservan por 90 días por si el gimnasio decide reactivar su cuenta.</li>
        <li>Tras ese período, los datos se eliminan permanentemente de la base de datos.</li>
        <li>Los backups se retienen por 30 días adicionales y luego se destruyen.</li>
      </ul>

      <h2>9. Menores de edad</h2>
      <p>
        FitLoyalty no está dirigido a menores de 18 años. El gimnasio es responsable de verificar la
        edad de sus miembros. Si un gimnasio registra datos de menores, debe contar con la
        autorización de los padres o representantes legales, conforme al artículo 7 de la Ley 1581
        de 2012 y al Código de la Infancia y la Adolescencia (Ley 1098 de 2006).
      </p>

      <h2>10. Cambios a esta política</h2>
      <p>
        Esta política puede actualizarse en cualquier momento. Las modificaciones se publicarán en
        esta página con la fecha de actualización. Si los cambios son sustanciales, notificaremos al
        Administrador por correo electrónico.
      </p>

      <h2>11. Autoridad de control</h2>
      <p>
        La autoridad competente en Colombia para la protección de datos personales es la{' '}
        <strong>Superintendencia de Industria y Comercio (SIC)</strong>, Delegatura de Protección
        de Datos Personales. Los titulares pueden presentar quejas ante la SIC en{' '}
        <a href="https://www.sic.gov.co/proteccion-de-datos-personales" target="_blank" rel="noopener noreferrer">sic.gov.co</a>.
      </p>
    </LegalLayout>
  );
}
