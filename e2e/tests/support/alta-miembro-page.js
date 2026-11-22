// Objeto de pagina del alta de miembros (/admin/miembros): el asistente de 5
// pasos y la lista. Locators y pasos que repiten los tests; las aserciones se
// quedan en los tests.
export class AltaMiembroPage {
  constructor(page) {
    this.page = page;
    // Con la lista vacia, el estado vacio repite "Nuevo miembro"; el de la
    // cabecera esta siempre y va primero.
    this.nuevoMiembro = page.getByRole('button', { name: 'Nuevo miembro', exact: true }).first();
    this.nombre = page.getByLabel('Nombre completo *');
    this.documento = page.getByLabel('Número documento *');
    this.telefono = page.getByLabel('Teléfono / WhatsApp *');
    this.email = page.getByLabel('Email', { exact: true });
    this.valorTotal = page.getByLabel('Valor total del plan *');
    // Las casillas del paso 5 con el #102 (RQNF-17): el nombre de cada autorizacion va primero.
    this.aceptoTerminos = page.getByLabel(/^Contrato y términos/);
    this.autorizoDatos = page.getByLabel(/^Tratamiento de datos/);
    this.siguiente = page.getByRole('button', { name: 'Siguiente →' });
    this.anterior = page.getByRole('button', { name: '← Anterior' });
    // Mientras envia, el boton dice "Creando miembro..." y este locator no lo
    // encuentra: un clic espera a que vuelva a decir "Crear miembro".
    this.crear = page.getByRole('button', { name: 'Crear miembro' });
    // El mismo boton con cualquiera de sus dos textos, para comprobar si esta habilitado.
    this.botonCrear = page.getByRole('button', { name: /^(Crear miembro|Creando miembro\.\.\.)$/ });
    this.paso = page.getByText(/^Paso \d de 5$/);
    this.avisoCreado = page.getByRole('status').filter({ hasText: 'Miembro creado exitosamente.' });
    this.dialogoQr = page.getByRole('dialog', { name: '¡Miembro creado exitosamente!' });
    // La pagina pinta la tabla (escritorio) y las tarjetas (movil); el CSS elige
    // cual se ve. Los tests miran la tabla.
    this.tabla = page.getByRole('table');
  }

  async goto() {
    await this.page.goto('/admin/miembros');
  }

  async abrirAlta() {
    await this.goto();
    await this.nuevoMiembro.click();
  }

  /** Paso 1 con los obligatorios (y el correo, si el test lo trae). */
  async llenarDatosPersonales({ nombre, documento, telefono = '3001234567', email }) {
    await this.nombre.fill(nombre);
    await this.documento.fill(documento);
    await this.telefono.fill(telefono);
    if (email) await this.email.fill(email);
  }

  /** Del paso 1 al 5: el 2 y el 4 tal como vienen, el valor del plan en el 3. */
  async avanzarHastaTerminos(valorTotal = '90000') {
    await this.siguiente.click(); // Salud y emergencia
    await this.siguiente.click(); // Plan y cobros
    await this.valorTotal.fill(valorTotal);
    await this.siguiente.click(); // Info adicional
    await this.siguiente.click(); // Terminos
  }

  async aceptarTerminos() {
    await this.aceptoTerminos.check();
    await this.autorizoDatos.check();
  }

  /** Todo el asistente hasta antes de "Crear miembro". */
  async llenarAlta(datos) {
    await this.llenarDatosPersonales(datos);
    await this.avanzarHastaTerminos();
    await this.aceptarTerminos();
  }

  /** Aviso con ese texto: el de arriba del formulario o el de un campo. */
  alerta(texto) {
    return this.page.getByRole('alert').filter({ hasText: texto });
  }

  /** Fila de la tabla de ese miembro. */
  filaDe(nombre) {
    return this.tabla.getByRole('row').filter({ hasText: nombre });
  }
}
