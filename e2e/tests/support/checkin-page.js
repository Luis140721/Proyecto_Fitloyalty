// Objeto de pagina del check-in (/admin/checkin): locators y pasos que repiten
// los tests. Las aserciones se quedan en los tests.
export class CheckinPage {
  constructor(page) {
    this.page = page;
    this.documento = page.getByRole('textbox', { name: 'O por documento' });
    // Mientras valida, el boton dice "Validando..." y este locator no lo encuentra:
    // un clic espera a que vuelva a decir "Registrar".
    this.registrar = page.getByRole('button', { name: 'Registrar' });
    // El mismo boton con cualquiera de sus dos textos, para comprobar si esta habilitado.
    this.botonDeIngreso = page.getByRole('button', { name: /^(Registrar|Validando\.\.\.)$/ });
    // Resultado del ultimo ingreso (exito, aviso o negado).
    this.resultado = page.getByRole('status');
    this.error = page.getByRole('alert');
    this.ingresosDeHoy = page.getByRole('list', { name: 'Ingresos de hoy' });
  }

  async goto() {
    await this.page.goto('/admin/checkin');
  }

  /** Ingreso manual: el documento y el boton Registrar, como en la recepcion. */
  async registrarPorDocumento(documento) {
    await this.documento.fill(documento);
    await this.registrar.click();
  }

  /** Fila de "Ingresos de hoy" de ese miembro. */
  ingresoDe(nombre) {
    return this.ingresosDeHoy.getByRole('listitem').filter({ hasText: nombre });
  }
}
