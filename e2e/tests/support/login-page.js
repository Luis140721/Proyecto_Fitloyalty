// Objeto de pagina del formulario de inicio de sesion (frontend/src/pages/LoginPage.jsx).
// Sin aserciones: solo los pasos que repiten inicio-sesion.spec.js e
// inicio-sesion-tiempos.spec.js.
export class LoginPage {
  constructor(page) {
    this.page = page;
    this.correo = page.getByLabel('Correo electrónico');
    this.clave = page.getByLabel(/^Contraseña/);
    this.entrar = page.getByRole('button', { name: /entrar a mi panel|entrando/i });
    this.aviso = page.getByRole('alert');
  }

  async abrir() {
    await this.page.goto('/login');
  }

  async llenar(correo, clave) {
    await this.correo.fill(correo);
    await this.clave.fill(clave);
  }

  async iniciarSesion(correo, clave) {
    await this.llenar(correo, clave);
    await this.entrar.click();
  }
}
