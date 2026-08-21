import LegalLayout from '../components/LegalLayout';

export default function TerminosPage() {
  return (
    <LegalLayout
      title="Términos y condiciones"
      subtitle="Las reglas que rigen el uso de FitLoyalty como plataforma de gestión para gimnasios en Colombia."
      updated="20 de agosto de 2026"
    >
      <h2>1. Aceptación de los términos</h2>
      <p>
        Al registrarte y usar FitLoyalty (en adelante, "la Plataforma"), aceptas los presentes
        Términos y Condiciones en su totalidad. Si no estás de acuerdo con alguno de los términos
        aquí descritos, no debes registrarte ni utilizar el servicio.
      </p>
      <p>
        FitLoyalty es un software de gestión para gimnasios operado desde Colombia. Al usar la
        Plataforma, declaras que actúas en nombre propio o como representante autorizado de un
        gimnasio o centro deportivo.
      </p>

      <h2>2. Definiciones</h2>
      <ul>
        <li><strong>Plataforma:</strong> el software FitLoyalty, accesible vía web en fitloyalty-zeta.vercel.app y su API en fitloyalty-api.onrender.com.</li>
        <li><strong>Administrador:</strong> la persona que registra el gimnasio y tiene control total sobre la cuenta, miembros y staff.</li>
        <li><strong>Staff:</strong> recepcionistas, entrenadores u otros usuarios invitados por el Administrador.</li>
        <li><strong>Miembro:</strong> un socio del gimnasio cuyos datos son gestionados por el Administrador y Staff.</li>
        <li><strong>Datos Personales:</strong> cualquier información que permita identificar a una persona natural, conforme a la Ley 1581 de 2012.</li>
      </ul>

      <h2>3. Objeto del servicio</h2>
      <p>
        FitLoyalty proporciona herramientas para la gestión de miembros, control de accesos mediante
        código QR, registro de check-ins, dashboard de indicadores, facturación de mensualidades y
        administración de personal del gimnasio.
      </p>
      <p>
        La Plataforma no actúa como intermediador de pago. Los cobros entre el gimnasio y sus
        miembros se realizan directamente entre las partes. FitLoyalty únicamente registra y
        visualiza la información de los pagos.
      </p>

      <h2>4. Registro y cuenta</h2>
      <h3>4.1 Responsabilidad del Administrador</h3>
      <p>
        El Administrador es responsable de la veracidad de la información proporcionada al
        registrarse (nombre, correo, nombre del gimnasio) y de mantener la confidencialidad de su
        contraseña.
      </p>
      <h3>4.2 Invitación de Staff</h3>
      <p>
        El Administrador puede invitar a otros usuarios como recepcionistas, entrenadores o
        administradores adicionales. El Administrador es responsable de las acciones que su Staff
        realice dentro de la Plataforma, incluyendo el manejo de datos personales de los miembros.
      </p>
      <h3>4.3 Suspensión de cuentas</h3>
      <p>
        FitLoyalty se reserva el derecho de suspender o cancelar cuentas que: (i) usen la
        Plataforma para fines ilícitos, (ii) incumplan la Ley de Protección de Datos Personales
        (Ley 1581 de 2012), o (iii) generen un uso abusivo del servicio.
      </p>

      <h2>5. Obligaciones del gimnasio como responsable de datos</h2>
      <div className="legal-callout">
        <div className="legal-callout__title">
          <span className="material-symbols-outlined">gavel</span>
          Importante bajo la Ley 1581 de 2012
        </div>
        <p>
          El gimnasio (Administrador) actúa como <strong>Responsable del Tratamiento</strong> de los
          datos personales de sus miembros. FitLoyalty actúa como <strong>Encargado del
          Tratamiento</strong>. Esto significa que el gimnasio es quien debe obtener el
          consentimiento de sus miembros para recolectar y usar sus datos, y FitLoyalty los procesa
          por instrucción del gimnasio.
        </p>
      </div>
      <p>El Administrador se compromete a:</p>
      <ol>
        <li>Obtener el consentimiento previo, expreso e informado de cada miembro antes de registrar sus datos en la Plataforma.</li>
        <li>Informar a los miembros sobre la existencia de la Política de Privacidad de FitLoyalty.</li>
        <li>Garantizar que los datos registrados son veraces y actualizados.</li>
        <li>Atender las peticiones, quejas y reclamos (PQR) de sus miembros relacionadas con el tratamiento de datos.</li>
        <li>No usar la Plataforma para recolectar datos sensibles (salud, biométricos) sin autorización expresa de cada miembro.</li>
      </ol>

      <h2>6. Planes y facturación</h2>
      <h3>6.1 Período de prueba</h3>
      <p>
        FitLoyalty ofrece un período de prueba gratuito de 14 días. Durante este período, todas las
        funcionalidades están disponibles sin costo. Al finalizar el trial, la cuenta pasa a estado
        suspendido hasta que se active un plan de pago.
      </p>
      <h3>6.2 Planes de pago</h3>
      <p>
        Los planes se facturan mensualmente en pesos colombianos (COP). El precio del plan incluye
        el uso de la Plataforma, almacenamiento de datos y soporte por correo electrónico. No
        incluye costos de transacción de pasarelas de pago externas que el gimnasio decida usar.
      </p>
      <h3>6.3 Cancelación</h3>
      <p>
        El Administrador puede cancelar su plan en cualquier momento desde la Plataforma o
        contactando a hola@fitloyalty.co. La cancelación surte efecto al final del período facturado.
        Los datos del gimnasio se conservan por 90 días posteriores a la cancelación, tras lo cual
        se eliminan permanentemente.
      </p>

      <h2>7. Propiedad intelectual</h2>
      <p>
        FitLoyalty, su código, diseño, logos, nombres comerciales y la documentación asociada son
        propiedad de FitLoyalty. El Administrador conserva la propiedad de los datos de su
        gimnasio y sus miembros.
      </p>
      <p>
        El Administrador otorga a FitLoyalty una licencia no exclusiva para procesar los datos de
        sus miembros con el único fin de prestar el servicio contratado.
      </p>

      <h2>8. Limitación de responsabilidad</h2>
      <p>
        FitLoyalty no se hace responsable de: (i) pérdidas económicas derivadas del mal uso de la
        Plataforma por parte del gimnasio, (ii) disputas entre el gimnasio y sus miembros, (iii)
        datos erróneos ingresados por el Staff, ni (iv) interrupciones del servicio por causas de
        fuerza mayor o indisponibilidad de proveedores externos (Render, Vercel, Neon Postgres).
      </p>
      <p>
        La responsabilidad máxima de FitLoyalty frente a un gimnasio se limita al valor pagado en
        los últimos 3 meses de facturación.
      </p>

      <h2>9. Estatuto del Consumidor (Ley 1480 de 2011)</h2>
      <p>
        En virtud de la Ley 1480 de 2011 (Estatuto del Consumidor), el gimnasio como cliente de
        FitLoyalty tiene derecho a:
      </p>
      <ul>
        <li>Recibir un servicio de calidad, idóneo y conforme a lo ofrecido.</li>
        <li>Presentar quejas o reclamos ante FitLoyalty escribiendo a hola@fitloyalty.co.</li>
        <li>Obtener respuesta a su PQR en un plazo máximo de 15 días hábiles.</li>
        <li>Recibir información clara, veraz y oportuna sobre las condiciones del servicio.</li>
      </ul>

      <h2>10. Modificaciones</h2>
      <p>
        FitLoyalty puede modificar estos Términos en cualquier momento. Las modificaciones se
        publicarán en esta misma página con la fecha de actualización. El uso continuado de la
        Plataforma después de 30 días de la publicación implica aceptación tácita de los cambios.
      </p>

      <h2>11. Ley aplicable y jurisdicción</h2>
      <p>
        Estos Términos se rigen por las leyes de la República de Colombia. Cualquier controversia
        será dirimida ante la jurisdicción ordinaria de Colombia, con sede en Bogotá D.C.
      </p>

      <h2>12. Contacto</h2>
      <p>
        Para cualquier inquietud sobre estos Términos, puedes escribir a{' '}
        <a href="mailto:hola@fitloyalty.co">hola@fitloyalty.co</a>.
      </p>
    </LegalLayout>
  );
}
