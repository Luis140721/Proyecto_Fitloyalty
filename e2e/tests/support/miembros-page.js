class MiembrosPage {
  constructor(page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/admin/miembros');
  }

  async startRegistration() {
    await this.page.getByRole('button', { name: /Nuevo miembro/ }).first().click();
  }

  async fillName(name) {
    await this.page.getByLabel(/Nombre completo/).fill(name);
  }

  async fillPersonalData(member) {
    await this.fillName(member.name);
    await this.page.getByLabel(/Número documento/).fill(member.document);
    await this.page.getByLabel(/Teléfono \/ WhatsApp/).fill('3001234567');
  }

  async fillPayment(member) {
    await this.page.getByRole('button', { name: 'Plan y cobros' }).click();
    await this.page.getByLabel(/Valor total del plan/).fill(String(member.planTotal));
    await this.page.getByLabel(/Valor pagado hoy/).fill(String(member.planPaid));
    await this.page.getByLabel(/Método de pago/).selectOption('TRANSFERENCIA');
  }

  async acceptTerms() {
    await this.page.getByRole('button', { name: 'Términos' }).click();
    await this.page.getByRole('checkbox', { name: /Acepto los términos y condiciones/ }).check();
    await this.page.getByRole('checkbox', { name: /Autorizo el uso de mis datos/ }).check();
  }

  async completeRegistration(member) {
    await this.fillPersonalData(member);
    await this.fillPayment(member);
    await this.acceptTerms();
  }

  async submit({ doubleClick = false } = {}) {
    const button = this.page.getByRole('button', { name: 'Crear miembro' });
    if (doubleClick) {
      await button.dblclick();
      return;
    }
    await button.click();
  }
}

module.exports = { MiembrosPage };
