import LegalLayout from '../components/LegalLayout';

export default function PrivacidadPage() {
  return (
    <LegalLayout
      title="Política de privacidad"
      subtitle="Cómo FitLoyalty recopila, usa, almacena y protege los datos personales de los usuarios y miembros, conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013."
      updated="17 de noviembre de 2026"
    >
      <h2>1. Responsable del tratamiento</h2>
      <p>
        FitLoyalty, en su calidad de desarrollador y operador de la Plataforma, actúa como{' '}
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
          Correo: <a href="mailto:fitloyaltysaas@gmail.com">fitloyaltysaas@gmail.com</a><br />
          Responsable de protección de datos (DPO): <a href="mailto:fitloyaltysaas@gmail.com">fitloyaltysaas@gmail.com</a>
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
        <li>Nombre completo, documento de identidad, fecha de nacimiento, teléfono y correo electrónico (opcional).</li>
        <li>Plan de membresía, fecha de inicio y vencimiento, precio, forma y estado de pago.</li>
        <li>Código QR único de acceso.</li>
        <li>Historial de check-ins (fecha, hora y método de ingreso).</li>
        <li>
          <strong>Datos de salud (condiciones médicas, lesiones y alergias):</strong> solo si el
          miembro, o su representante legal, da la autorización separada y opcional de la sección 5.
        </li>
        <li>
          <strong>Si el miembro es menor de edad:</strong> nombre, tipo y número de documento,
          parentesco y teléfono de su representante legal (sección 6).
        </li>
        <li>La constancia de cada autorización que da o revoca (sección 7) y de cada entrega de su contrato.</li>
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
        <li>Comunicaciones operativas: notificaciones de vencimiento de membresía, entrega del contrato, invitaciones de staff.</li>
        <li>Seguridad del miembro durante el entrenamiento, solo con los datos de salud que haya autorizado.</li>
        <li>Cumplimiento legal: conservación de registros requeridos por autoridades colombianas y de la prueba de las autorizaciones.</li>
      </ol>
      <p>
        FitLoyalty <strong>no vende, alquila ni comparte</strong> datos personales con terceros con
        fines comerciales.
      </p>

      <h2>4. Base legal: consentimiento</h2>
      <p>
        Conforme al artículo 9 de la Ley 1581 de 2012, el tratamiento de datos personales requiere
        la autorización previa, expresa e informada del titular. La autorización se obtiene:
      </p>
      <ul>
        <li><strong>Administrador y Staff:</strong> al aceptar estos términos al registrarse o aceptar una invitación.</li>
        <li>
          <strong>Miembros:</strong> el gimnasio (Responsable) pide la autorización al registrar al
          miembro en el panel. Cada autorización va en una casilla aparte, con su propio texto: el
          contrato, el tratamiento de datos y, de forma opcional, los datos de salud. FitLoyalty no
          tiene contacto directo con los miembros fuera de la app del gimnasio.
        </li>
      </ul>

      <h2>5. Datos sensibles: autorización separada y facultativa</h2>
      <p>
        Las condiciones médicas, las lesiones y las alergias son <strong>datos sensibles</strong>{' '}
        (artículo 5 de la Ley 1581 de 2012). Por eso:
      </p>
      <ul>
        <li>
          Su tratamiento necesita una autorización <strong>expresa y separada</strong> de la de
          tratamiento de datos y de la aceptación del contrato (artículo 6 de la Ley 1581 y artículo
          6 del Decreto 1377 de 2013).
        </li>
        <li>
          Es <strong>facultativa</strong>: antes de pedirla se le informa al titular que no está
          obligado a autorizar su tratamiento ni a entregar esos datos, y que su membresía no depende
          de ello.
        </li>
        <li>Se usan con una sola finalidad: cuidar la seguridad del miembro durante el entrenamiento.</li>
        <li>Si no hay autorización, la Plataforma no guarda condiciones médicas ni alergias.</li>
        <li>
          El miembro puede revocarla en cualquier momento desde la app FitLoyalty («Mis
          autorizaciones») o en el gimnasio. Al revocarla, esos datos se borran y queda constancia
          de la revocación.
        </li>
      </ul>

      <h2>6. Menores de edad</h2>
      <p>
        La Plataforma permite registrar miembros menores de 18 años solo con los datos y la
        autorización de su representante legal (artículo 7 de la Ley 1581 de 2012 y artículo 12 del
        Decreto 1377 de 2013):
      </p>
      <ul>
        <li>
          Si la fecha de nacimiento indica menos de 18 años, o el documento es una tarjeta de
          identidad, el panel exige el nombre, el tipo y número de documento, el parentesco y el
          teléfono del representante legal, y su autorización. Sin ellos el registro no se guarda.
        </li>
        <li>
          El representante da las autorizaciones en nombre del menor (tratamiento de datos, contrato
          y, si quiere, datos de salud), respetando su interés superior y sus derechos
          fundamentales. El gimnasio debe escuchar la opinión del menor según su madurez.
        </li>
        <li>
          Desde la app, un menor puede revocar la autorización de datos de salud, pero no otorgarla:
          esa la da su representante en el gimnasio.
        </li>
        <li>El contrato de un miembro menor de edad se envía al teléfono de su representante legal.</li>
      </ul>

      <h2>7. Prueba de la autorización</h2>
      <p>
        Cada vez que se otorga o se revoca una autorización, la Plataforma guarda una constancia que
        no se modifica después: el tipo de autorización, si se otorgó o no, la fecha y la hora, la
        versión del texto que se le mostró al titular, el canal (panel del gimnasio o app del
        miembro) y el usuario del gimnasio que la registró. La autorización vigente es la más
        reciente.
      </p>
      <p>
        La constancia se conserva mientras el miembro esté registrado, para que el gimnasio pueda
        probar la autorización ante el titular o ante la Superintendencia de Industria y Comercio
        (artículos 7 y 8 del Decreto 1377 de 2013). El miembro consulta las suyas en la app; el gimnasio,
        en la ficha del miembro. Si el miembro se elimina de forma permanente, sus constancias se
        eliminan con él.
      </p>

      <h2>8. Derechos de los titulares (Habeas Data)</h2>
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
          Los miembros deben dirigir su solicitud al gimnasio (Responsable). La autorización de datos
          de salud la pueden revocar ellos mismos en la app. El gimnasio, si requiere que FitLoyalty
          ejecute la supresión o modificación, debe contactarnos a{' '}
          <a href="mailto:fitloyaltysaas@gmail.com">fitloyaltysaas@gmail.com</a>. Atenderemos la solicitud en
          un plazo máximo de 10 días hábiles, prorrogable hasta 5 más según el artículo 14 de la Ley
          1581 de 2012.
        </p>
      </div>

      <h2>9. Seguridad de los datos</h2>
      <p>
        FitLoyalty implementa las siguientes medidas técnicas y administrativas:
      </p>
      <ul>
        <li><strong>Cifrado en tránsito:</strong> TLS 1.2+ (HTTPS) en todo el tráfico entre cliente y servidor.</li>
        <li><strong>Cifrado en reposo:</strong> la base de datos (Neon Postgres) cifra los datos en disco.</li>
        <li><strong>Hash de contraseñas:</strong> bcrypt con salt rounds de 10.</li>
        <li><strong>Autenticación JWT:</strong> tokens firmados con expiración.</li>
        <li><strong>Aislamiento multitenant:</strong> cada gimnasio solo accede a sus propios datos, y cada miembro solo a los suyos.</li>
        <li><strong>Principio de mínimo privilegio:</strong> el Staff solo accede a las funciones permitidas por su rol.</li>
      </ul>

      <h2>10. Transferencia y transmisión internacional</h2>
      <p>
        Los datos se almacenan en servidores de Render (EE. UU.) y Neon Postgres (EE. UU.). Esta
        transferencia internacional se realiza bajo las salvaguardas del artículo 26 de la Ley 1581
        de 2012, garantizando un nivel adecuado de protección mediante los contratos y políticas de
        privacidad de dichos proveedores, que cumplen con estándares internacionales (SOC 2, GDPR).
      </p>

      <h2>11. Conservación de los datos</h2>
      <p>
        Los datos se conservan mientras el gimnasio mantenga su cuenta activa. Tras la cancelación:
      </p>
      <ul>
        <li>Los datos se conservan por 90 días por si el gimnasio decide reactivar su cuenta.</li>
        <li>Tras ese período, los datos se eliminan permanentemente de la base de datos.</li>
        <li>Los backups se retienen por 30 días adicionales y luego se destruyen.</li>
      </ul>

      <h2>12. Política de contacto con los miembros (Ley 2300 de 2023)</h2>
      <p>
        Los mensajes que el gimnasio envía a sus miembros desde la Plataforma siguen estas reglas:
      </p>
      <ul>
        <li>
          <strong>Horario:</strong> de lunes a viernes de 7:00 a. m. a 7:00 p. m. y los sábados de
          8:00 a. m. a 3:00 p. m. No se envían mensajes los domingos ni los días festivos.
        </li>
        <li><strong>Canales:</strong> solo los canales que el miembro autorizó.</li>
        <li>
          <strong>Mensajes comerciales o publicitarios:</strong> solo si el miembro los autorizó. Puede
          darse de baja en cualquier momento, y desde entonces no se le vuelven a enviar.
        </li>
      </ul>

      <h2>13. Cambios a esta política</h2>
      <p>
        Esta política puede actualizarse en cualquier momento. Las modificaciones se publicarán en
        esta página con la fecha de actualización. Si los cambios son sustanciales, notificaremos al
        Administrador por correo electrónico. Un cambio en la finalidad del tratamiento requiere una
        nueva autorización del titular.
      </p>

      <h2>14. Autoridad de control</h2>
      <p>
        La autoridad competente en Colombia para la protección de datos personales es la{' '}
        <strong>Superintendencia de Industria y Comercio (SIC)</strong>, Delegatura de Protección
        de Datos Personales. Los titulares pueden presentar quejas ante la SIC en{' '}
        <a href="https://www.sic.gov.co/proteccion-de-datos-personales" target="_blank" rel="noopener noreferrer">sic.gov.co</a>.
      </p>
    </LegalLayout>
  );
}
