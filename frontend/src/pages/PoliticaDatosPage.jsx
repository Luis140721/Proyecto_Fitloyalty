import LegalLayout from '../components/LegalLayout';

export default function PoliticaDatosPage() {
  return (
    <LegalLayout
      title="Política de tratamiento de datos personales"
      subtitle="Política interna de FitLoyalty para el cumplimiento de la Ley 1581 de 2012, el Decreto 1377 de 2013 y las directrices de la Superintendencia de Industria y Comercio."
      updated="20 de agosto de 2026"
    >
      <h2>1. Ámbito de aplicación</h2>
      <p>
        Esta Política de Tratamiento de Datos Personales se aplica a todos los datos personales
        que se procesan en la Plataforma FitLoyalty, incluyendo los datos del Administrador, Staff
        y Miembros de cada gimnasio registrado.
      </p>

      <h2>2. Principios rectores</h2>
      <p>
        FitLoyalty aplica los principios del artículo 4 de la Ley 1581 de 2012:
      </p>
      <ul>
        <li><strong>Legalidad:</strong> el tratamiento se realiza conforme a la ley y con consentimiento del titular.</li>
        <li><strong>Finalidad:</strong> los datos se usan exclusivamente para los fines descritos en la Política de Privacidad.</li>
        <li><strong>Libertad:</strong> el tratamiento se realiza con consentimiento previo, expreso e informado.</li>
        <li><strong>Veracidad o calidad:</strong> los datos deben ser veraces, exactos y actualizados.</li>
        <li><strong>Transparencia:</strong> el titular puede conocer la existencia y uso de sus datos en cualquier momento.</li>
        <li><strong>Acceso restringido:</strong> solo el personal autorizado del gimnasio accede a los datos de sus miembros.</li>
        <li><strong>Seguridad:</strong> se aplican medidas técnicas y administrativas para proteger los datos.</li>
        <li><strong>Confidencialidad:</strong> toda persona que intervenga en el tratamiento garantiza la reserva de la información.</li>
      </ul>

      <h2>3. Roles y responsabilidades</h2>
      <h3>3.1 Gimnasio (Responsable del Tratamiento)</h3>
      <ul>
        <li>Decide qué datos de sus miembros recolectar y para qué fines.</li>
        <li>Obtiene el consentimiento de cada miembro antes de registrar sus datos.</li>
        <li>Mantiene un registro de las autorizaciones otorgadas por los miembros.</li>
        <li>Atiende directamente las PQR de sus miembros sobre datos personales.</li>
        <li>Notifica a FitLoyalty cuando un miembro solicita supresión o rectificación.</li>
      </ul>
      <h3>3.2 FitLoyalty (Encargado del Tratamiento)</h3>
      <ul>
        <li>Procesa los datos por instrucción del gimnasio y exclusivamente para prestar el servicio.</li>
        <li>Garantiza la seguridad y confidencialidad de los datos almacenados.</li>
        <li>Ejecuta las solicitudes de supresión, rectificación o actualización recibidas del gimnasio.</li>
        <li>No usa los datos para fines propios ni los comparte con terceros.</li>
      </ul>

      <h2>4. Autorización del titular</h2>
      <p>
        La autorización para el tratamiento de datos se obtiene en los siguientes momentos:
      </p>
      <ul>
        <li><strong>Administrador:</strong> al registrarse en la Plataforma y aceptar los Términos y Condiciones.</li>
        <li><strong>Staff:</strong> al aceptar la invitación enviada por el Administrador.</li>
        <li><strong>Miembros:</strong> el gimnasio es responsable de obtener la autorización del miembro antes de registrar sus datos. FitLoyalty no registra miembros directamente; solo el gimnasio lo hace.</li>
      </ul>
      <p>
        La autorización debe constar por escrito o por cualquier medio que permita demostrar su
        existencia (formato físico, correo, firma digital, aceptación en la app del gimnasio).
      </p>

      <h2>5. Derechos de los titulares</h2>
      <p>
        Los titulares de datos personales pueden ejercer los siguientes derechos:
      </p>
      <ol>
        <li><strong>Acceso:</strong> consultar sus datos personales almacenados en la Plataforma.</li>
        <li><strong>Actualización:</strong> solicitar la corrección de datos desactualizados.</li>
        <li><strong>Rectificación:</strong> modificar datos inexactos o incompletos.</li>
        <li><strong>Supresión:</strong> solicitar la eliminación de sus datos cuando no sean necesarios.</li>
        <li><strong>Revocación:</strong> retirar el consentimiento otorgado para el tratamiento.</li>
        <li><strong>Información:</strong> conocer la finalidad del tratamiento y los derechos que les asisten.</li>
      </ol>

      <h2>6. Procedimiento para el ejercicio de derechos (PQR)</h2>
      <div className="legal-callout">
        <div className="legal-callout__title">
          <span className="material-symbols-outlined">support_agent</span>
          Canal de atención
        </div>
        <p>
          Los miembros deben dirigir su solicitud al gimnasio. El gimnasio, si requiere que
          FitLoyalty ejecute la acción, debe escribir a{' '}
          <a href="mailto:datos@fitloyalty.co">datos@fitloyalty.co</a> con el asunto
          "Solicitud ARCO" e incluir:
        </p>
      </div>
      <ul>
        <li>Nombre y documento de identidad del titular.</li>
        <li>Descripción clara de la solicitud (acceso, rectificación, supresión, revocación).</li>
        <li>Datos de contacto del titular (correo o teléfono).</li>
        <li>Si es rectificación: los datos correctos que deben reemplazar los actuales.</li>
      </ul>
      <p>
        <strong>Plazo de respuesta:</strong> 10 días hábiles desde la recepción de la solicitud,
        prorrogables hasta 5 días más si se requiere información adicional, conforme al artículo 14
        del Decreto 1377 de 2013.
      </p>

      <h2>7. Medidas de seguridad</h2>
      <h3>7.1 Técnicas</h3>
      <ul>
        <li>Cifrado TLS 1.2+ en todo el tráfico.</li>
        <li>Base de datos cifrada en reposo (Neon Postgres).</li>
        <li>Contraseñas con bcrypt (salt rounds 10).</li>
        <li>JWT con expiración de 24 horas.</li>
        <li>Aislamiento por id_gimnasio en todas las queries.</li>
        <li>Rate limiting en endpoints de autenticación.</li>
      </ul>
      <h3>7.2 Administrativas</h3>
      <ul>
        <li>Acceso restringido: solo el equipo de ingeniería de FitLoyalty tiene acceso a la base de datos, bajo NDA.</li>
        <li>Principio de mínimo privilegio en roles de la Plataforma.</li>
        <li>Logs de auditoría para acciones sensibles (creación de usuarios, eliminación de miembros).</li>
      </ul>

      <h2>8. Violación de datos personales</h2>
      <p>
        En caso de una brecha de seguridad que afecte datos personales, FitLoyalty:
      </p>
      <ol>
        <li>Notificará al gimnasio (Responsable) en un plazo máximo de 72 horas tras detectar el incidente.</li>
        <li>Proporcionará la información necesaria para que el gimnasio cumpla con su obligación de notificar a los titulares y a la SIC.</li>
        <li>Implementará las medidas correctivas para contener y remediar la brecha.</li>
        <li>Documentará el incidente y las acciones tomadas.</li>
      </ol>

      <h2>9. Transferencia internacional</h2>
      <p>
        Los datos se procesan en servidores ubicados en Estados Unidos (Render y Neon Postgres).
        Esta transferencia se realiza bajo las salvaguardas del artículo 26 de la Ley 1581 de 2012.
        Los proveedores cumplen con estándares internacionales de seguridad (SOC 2 Type II, ISO
        27001) y tienen políticas de privacidad alineadas con GDPR.
      </p>

      <h2>10. Vigencia y eliminación</h2>
      <p>
        Los datos se conservan mientras el gimnasio mantenga su cuenta activa. Tras la cancelación
        del plan, los datos se conservan por 90 días y luego se eliminan permanentemente. Los
        backups se destruyen 30 días después de la eliminación.
      </p>

      <h2>11. Superintendencia de Industria y Comercio</h2>
      <p>
        La SIC es la autoridad competente para la vigilancia y control del tratamiento de datos
        personales en Colombia. Los titulares pueden presentar quejas ante la SIC a través de{' '}
        <a href="https://www.sic.gov.co/proteccion-de-datos-personales" target="_blank" rel="noopener noreferrer">sic.gov.co</a>.
      </p>
    </LegalLayout>
  );
}
