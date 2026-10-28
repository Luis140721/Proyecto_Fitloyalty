/**
 * Bootcamp semana 4 (Front, Luis): LandingPage desde lo que hace quien llega a
 * la pagina: cada llamado a la accion lleva al registro del gimnasio o al
 * login, las preguntas frecuentes se abren y el boton flotante sube al inicio.
 *
 * Sin API ni sesion. jsdom no implementa scrollTo ni matchMedia: se simulan
 * solo en este archivo.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import LandingPage from '../src/pages/LandingPage';
import { renderWithProviders } from './renderWithProviders';

const abrirLanding = () => renderWithProviders(<LandingPage />, { route: '/' });
const menuPrincipal = () => screen.getByRole('navigation', { name: 'Navegación principal' });
const piePagina = () => screen.getByRole('contentinfo');

let movimientoReducido;
beforeEach(() => {
  movimientoReducido = false;
  window.matchMedia = (query) => ({ matches: movimientoReducido && query.includes('reduce'), media: query });
  window.scrollTo = vi.fn();
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
});
afterEach(() => {
  delete window.matchMedia;
  delete window.scrollTo;
});

describe('LandingPage: los llamados a la accion', () => {
  test.each([
    ['Empezar gratis', 'plan de prueba'],
    ['Probar 14 días', 'plan Gimnasio'],
    ['Empezar gratis 14 días', 'cierre de la pagina'],
  ])('should take the owner to the gym sign-up when the button %s (%s) is clicked', async (boton) => {
    // Arrange
    const { user } = abrirLanding();

    // Act
    await user.click(screen.getByRole('button', { name: boton }));

    // Assert
    expect(await screen.findByText('Ruta actual: /register-owner')).toBeInTheDocument();
  });

  test.each([
    ['Empieza gratis 14 días', '/register-owner'],
    ['Ya tengo cuenta', '/login'],
  ])('should open %s from the hero when the link is clicked', async (enlace, ruta) => {
    // Arrange
    const { user } = abrirLanding();

    // Act
    await user.click(screen.getByRole('link', { name: enlace }));

    // Assert
    expect(await screen.findByText(`Ruta actual: ${ruta}`)).toBeInTheDocument();
  });

  test.each([
    ['Crear cuenta', '/register-owner'],
    ['Iniciar sesión', '/login'],
  ])('should go to %s from the main menu', async (enlace, ruta) => {
    // Arrange
    const { user } = abrirLanding();

    // Act
    await user.click(within(menuPrincipal()).getByRole('link', { name: enlace }));

    // Assert
    expect(await screen.findByText(`Ruta actual: ${ruta}`)).toBeInTheDocument();
  });

  test('should point the menu entries to the sections of the page', () => {
    // Act
    abrirLanding();

    // Assert: cada ancla tiene su seccion con ese id
    for (const [nombre, id] of [['Solución', 'solucion'], ['Cómo funciona', 'como-funciona'], ['Planes', 'planes'], ['FAQ', 'faq']]) {
      expect(within(menuPrincipal()).getByRole('link', { name: nombre })).toHaveAttribute('href', `#${id}`);
      expect(document.getElementById(id)).not.toBeNull();
    }
  });
});

describe('LandingPage: el contenido que decide la compra', () => {
  test('should mark only the gym plan as recommended and list what each plan includes', () => {
    // Act
    abrirLanding();

    // Assert
    const planes = screen.getByRole('heading', { name: 'Empieza gratis. Crece cuando quieras.' }).closest('section');
    const prueba = within(planes).getByText('Prueba 14 días').closest('article');
    const gimnasio = within(planes).getByText('Plan Gimnasio').closest('article');
    expect(gimnasio).toHaveClass('featured');
    expect(prueba).not.toHaveClass('featured');
    expect(within(gimnasio).getByText('Recomendado')).toBeInTheDocument();
    expect(within(prueba).getByRole('list')).toHaveTextContent('Hasta 30 miembros activos');
    expect(within(gimnasio).getByText('Miembros ilimitados')).toBeInTheDocument();
    expect(within(gimnasio).getByText('$39.900')).toBeInTheDocument();
  });

  test('should open the answer of a question when the user clicks it', async () => {
    // Arrange
    const { user } = abrirLanding();
    const pregunta = screen.getByText('¿Cómo cancelo?');
    expect(pregunta.closest('details')).not.toHaveAttribute('open');

    // Act
    await user.click(pregunta);

    // Assert
    expect(pregunta.closest('details')).toHaveAttribute('open');
    expect(pregunta.closest('details')).toHaveTextContent('Con un clic en tu panel.');
  });

  test.each([
    ['Términos y condiciones', '/legal/terminos'],
    ['Política de privacidad', '/legal/privacidad'],
    ['Política de datos', '/legal/datos'],
    ['Eliminar cuenta', '/legal/eliminar-cuenta'],
  ])('should open %s from the footer', async (enlace, ruta) => {
    // Arrange
    const { user } = abrirLanding();

    // Act
    await user.click(within(piePagina()).getByRole('link', { name: enlace }));

    // Assert
    expect(await screen.findByText(`Ruta actual: ${ruta}`)).toBeInTheDocument();
  });
});

describe('LandingPage: el boton de volver arriba', () => {
  test('should stay hidden from the keyboard and screen readers until the page is scrolled down', () => {
    // Act
    abrirLanding();

    // Assert: oculto, el boton no tiene nombre accesible; se busca por su title
    expect(screen.queryByRole('button', { name: 'Volver arriba' })).not.toBeInTheDocument();
    expect(screen.getByTitle('Volver arriba')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTitle('Volver arriba')).toHaveAttribute('tabindex', '-1');
  });

  test('should appear after one screen of scroll and take the user smoothly to the top', async () => {
    // Arrange
    const { user } = abrirLanding();

    // Act
    window.scrollY = 800;
    fireEvent.scroll(window);
    await user.click(screen.getByRole('button', { name: 'Volver arriba' }));

    // Assert
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  test('should jump to the top without animation when the user prefers reduced motion', async () => {
    // Arrange
    movimientoReducido = true;
    const { user } = abrirLanding();
    window.scrollY = 800;
    fireEvent.scroll(window);

    // Act
    await user.click(screen.getByRole('button', { name: 'Volver arriba' }));

    // Assert
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  test('should hide again when the user scrolls back above one screen', () => {
    // Arrange
    abrirLanding();
    window.scrollY = 800;
    fireEvent.scroll(window);
    expect(screen.getByRole('button', { name: 'Volver arriba' })).toBeInTheDocument();

    // Act
    window.scrollY = 100;
    fireEvent.scroll(window);

    // Assert
    expect(screen.queryByRole('button', { name: 'Volver arriba' })).not.toBeInTheDocument();
  });
});
