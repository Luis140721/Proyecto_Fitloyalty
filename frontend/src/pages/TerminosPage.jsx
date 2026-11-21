import LegalLayout from '../components/LegalLayout';

export default function TerminosPage() {
  return (
    <LegalLayout
      title="Términos y condiciones"
      subtitle="Las reglas que rigen el uso de FitLoyalty como plataforma de gestión para gimnasios en Colombia."
      updated="17 de noviembre de 2026"
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
        FitLoyalty puede suspender o cancelar una cuenta que: (i) use la Plataforma para fines
        ilícitos, (ii) incumpla la Ley de Protección de Datos Personales (Ley 1581 de 2012), o
        (iii) haga un uso que afecte la seguridad o la disponibilidad del servicio para otros
        gimnasios.
      </p>
      <p>
        Antes de suspender, FitLoyalty le avisa al Administrador por correo el motivo y le da un
        plazo de al menos 5 días hábiles para corregirlo o explicarlo, salvo que haya un riesgo
        inmediato para la seguridad de la Plataforma o de los datos de los miembros. Si la
        cancelación no se debe a un incumplimiento del gimnasio, FitLoyalty devuelve la parte
        proporcional del período ya pagado.
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
        <li>
          Pedir la autorización expresa, separada y opcional de cada miembro antes de registrar
          datos sensibles (salud), con la casilla que trae la Plataforma, e informarle que no está
          obligado a darla. No usar la Plataforma para recolectar datos biométricos.
        </li>
        <li>
          Registrar los datos y la autorización del representante legal de cada miembro menor de
          edad (artículo 7 de la Ley 1581 de 2012 y artículo 12 del Decreto 1377 de 2013).
        </li>
      </ol>

      <h2>6. Contrato del gimnasio con sus miembros</h2>
      <p>
        La Plataforma genera para cada miembro un contrato de membresía con los datos reales de su
        plan: precio total, forma de pago, fechas de inicio y fin, renovación (nunca automática),
        congelamiento, terminación, datos del gimnasio y canal de peticiones, quejas y reclamos
        (Ley 1480 de 2011, artículos 23 y 37). Se le entrega por WhatsApp y en la app, y queda
        constancia de cada entrega con el texto entregado. Si al plan le falta el precio, la forma
        de pago o las fechas, la Plataforma no lo entrega hasta que se completen.
      </p>
      <p>
        El texto evita las cláusulas que la Ley 1480 de 2011 considera abusivas o sin efecto
        (artículos 42 y 43): no devolver nunca el dinero, exonerar al gimnasio de su
        responsabilidad, suspender sin aviso, cambiar las condiciones de forma unilateral, la
        renovación automática y la aceptación presumida. El gimnasio sigue siendo responsable de su
        contrato con sus miembros; la plantilla es una ayuda técnica y conviene que la revise su
        asesor legal.
      </p>

      <h2>7. Planes y facturación</h2>
      <h3>7.1 Período de prueba</h3>
      <p>
        FitLoyalty ofrece un período de prueba gratuito de 14 días. Durante este período, todas las
        funcionalidades están disponibles sin costo. Al finalizar el trial, la cuenta pasa a estado
        suspendido hasta que se active un plan de pago.
      </p>
      <h3>7.2 Planes de pago</h3>
      <p>
        Los planes se facturan mensualmente en pesos colombianos (COP). El precio del plan incluye
        el uso de la Plataforma, almacenamiento de datos y soporte por correo electrónico. No
        incluye costos de transacción de pasarelas de pago externas que el gimnasio decida usar.
      </p>
      <h3>7.3 Cancelación</h3>
      <p>
        El Administrador puede cancelar su plan en cualquier momento desde la Plataforma o
        contactando a fitloyaltysaas@gmail.com, sin costo ni penalidad. La cancelación surte efecto al
        final del período ya facturado, y hasta entonces el servicio sigue funcionando.
        Los datos del gimnasio se conservan por 90 días posteriores a la cancelación, tras lo cual
        se eliminan permanentemente.
      </p>

      <h2>8. Propiedad intelectual</h2>
      <p>
        FitLoyalty, su código, diseño, logos, nombres comerciales y la documentación asociada son
        propiedad de FitLoyalty. El Administrador conserva la propiedad de los datos de su
        gimnasio y sus miembros.
      </p>
      <p>
        El Administrador otorga a FitLoyalty una licencia no exclusiva para procesar los datos de
        sus miembros con el único fin de prestar el servicio contratado.
      </p>

      <h2>9. Limitación de responsabilidad</h2>
      <p>
        FitLoyalty no se hace responsable de: (i) pérdidas económicas derivadas del mal uso de la
        Plataforma por parte del gimnasio, (ii) disputas entre el gimnasio y sus miembros, (iii)
        datos erróneos ingresados por el Staff, ni (iv) interrupciones del servicio por causas de
        fuerza mayor o indisponibilidad de proveedores externos (Render, Vercel, Neon Postgres).
      </p>
      <p>
        Fuera de los casos del párrafo siguiente, la responsabilidad máxima de FitLoyalty frente a
        un gimnasio se limita al valor pagado en los últimos 3 meses de facturación.
      </p>
      <p>
        Esta sección no limita la responsabilidad de FitLoyalty por dolo o culpa grave, por la
        seguridad de los datos que trata como Encargado, ni los derechos que la ley le reconoce al
        gimnasio cuando actúa como consumidor (Ley 1480 de 2011, artículo 43), que no se pueden
        limitar por contrato.
      </p>

      <h2>10. Estatuto del Consumidor (Ley 1480 de 2011)</h2>
      <p>
        En virtud de la Ley 1480 de 2011 (Estatuto del Consumidor), el gimnasio como cliente de
        FitLoyalty tiene derecho a:
      </p>
      <ul>
        <li>Recibir un servicio de calidad, idóneo y conforme a lo ofrecido.</li>
        <li>Presentar quejas o reclamos ante FitLoyalty escribiendo a fitloyaltysaas@gmail.com.</li>
        <li>Obtener respuesta a su PQR en un plazo máximo de 15 días hábiles.</li>
        <li>Recibir información clara, veraz y oportuna sobre las condiciones del servicio.</li>
      </ul>

      <h2>11. Modificaciones</h2>
      <p>
        FitLoyalty puede actualizar estos Términos. Cada cambio se publica en esta misma página con
        la fecha de actualización y se le avisa al Administrador por correo al menos 30 días antes
        de que entre en vigor. Los cambios no se aplican al período ya pagado.
      </p>
      <p>
        Si el gimnasio no está de acuerdo, puede cancelar sin costo ni penalidad antes de que el
        cambio entre en vigor (sección 7.3). El silencio o el simple uso de la Plataforma no se toman
        como aceptación de un cambio que le imponga al gimnasio nuevos costos u obligaciones: ese
        cambio requiere su aceptación expresa.
      </p>

      <h2>12. Ley aplicable y jurisdicción</h2>
      <p>
        Estos Términos se rigen por las leyes de la República de Colombia. Las controversias se
        resuelven ante las autoridades colombianas competentes. Si el gimnasio actúa como
        consumidor, puede acudir además a la Superintendencia de Industria y Comercio.
      </p>

      <h2>13. Contacto</h2>
      <p>
        Para cualquier inquietud sobre estos Términos, puedes escribir a{' '}
        <a href="mailto:fitloyaltysaas@gmail.com">fitloyaltysaas@gmail.com</a>.
      </p>
    </LegalLayout>
  );
}
