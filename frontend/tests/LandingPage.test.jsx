/**
 * Bootcamp semana 4 (Front, Luis): LandingPage desde lo que hace quien llega a
 * la pagina: cada llamado a la accion lleva al registro del gimnasio o al
 * login, las preguntas frecuentes se abren y el boton flotante sube al inicio.
 *
 * Sin API ni sesion. jsdom no implementa scrollTo ni matchMedia: se simulan
 * solo en este archivo.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  ])('should go to %s when it is clicked in the main menu', async (enlace, ruta) => {
    // Arrange
    const { user } = abrirLanding();

    // Act
    await user.click(within(menuPrincipal()).getByRole('link', { name: enlace }));

    // Assert
    expect(await screen.findByText(`Ruta actual: ${ruta}`)).toBeInTheDocument();
  });

  test('should point each menu entry to its section when the page loads', () => {
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
  test('should mark only the gym plan as recommended and list what each plan includes when the plans are shown', () => {
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
  ])('should open %s when it is clicked in the footer', async (enlace, ruta) => {
    // Arrange
    const { user } = abrirLanding();

    // Act
    await user.click(within(piePagina()).getByRole('link', { name: enlace }));

    // Assert
    expect(await screen.findByText(`Ruta actual: ${ruta}`)).toBeInTheDocument();
  });
});

describe('LandingPage: el boton de volver arriba', () => {
  test('should stay hidden from the keyboard and screen readers when the page is not scrolled down', () => {
    // Act
    abrirLanding();

    // Assert: oculto, el boton no tiene nombre accesible; se busca por su title
    expect(screen.queryByRole('button', { name: 'Volver arriba' })).not.toBeInTheDocument();
    expect(screen.getByTitle('Volver arriba')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTitle('Volver arriba')).toHaveAttribute('tabindex', '-1');
  });

  test('should appear and take the user smoothly to the top when the page is scrolled one screen down', async () => {
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

describe('LandingPage: las fotos del gimnasio', () => {
  const seccionSala = () => screen.getByRole('region', { name: 'Tú atiendes la sala. FitLoyalty lleva el resto.' });
  const fotosDeLaLanding = () => [...document.querySelectorAll('img[src^="/images/landing/"]')];
  // Vite convierte new URL(ruta, import.meta.url) en una URL http: la carpeta se arma con path
  const enPublic = (ruta) => join(dirname(fileURLToPath(import.meta.url)), '..', 'public', ruta);

  test('should describe the three photos of the gym and leave the hero photo as decoration when the page loads', () => {
    // Act
    abrirLanding();

    // Assert: las unicas imagenes que se anuncian son las tres fotos de la seccion
    const fotos = within(seccionSala()).getAllByRole('img');
    expect(fotos.map((foto) => foto.getAttribute('alt'))).toEqual([
      'Guantes de boxeo colgados sobre un saco en un gimnasio',
      'Prensa de piernas en la zona de pesas de un gimnasio',
      'Máquina multipower frente al espejo de un gimnasio',
    ]);
    expect(screen.getAllByRole('img').filter((imagen) => imagen.tagName === 'IMG')).toEqual(fotos);
    expect(fotosDeLaLanding()).toHaveLength(4);
  });

  test('should point every photo to a file that exists in public when the page loads', () => {
    // Act
    abrirLanding();

    // Assert: jsdom no descarga imagenes, asi que una foto rota solo se ve mirando el disco
    const rutas = fotosDeLaLanding().flatMap((foto) => [
      foto.getAttribute('src'),
      ...foto.getAttribute('srcset').split(',').map((entrada) => entrada.trim().split(' ')[0]),
    ]);
    expect(rutas).toHaveLength(12);
    for (const ruta of rutas) {
      expect(existsSync(enPublic(ruta)), `falta ${ruta} en public`).toBe(true);
    }
  });

  test('should load the hero photo right away and the photos below the fold lazily when the page loads', () => {
    // Act
    abrirLanding();

    // Assert: la de la portada se ve al entrar; ancho y alto evitan el salto de la pagina al cargar
    const [portada, ...resto] = fotosDeLaLanding();
    expect(portada).toHaveAttribute('src', '/images/landing/sala-960.webp');
    expect(portada).not.toHaveAttribute('loading');
    for (const foto of resto) expect(foto).toHaveAttribute('loading', 'lazy');
    for (const foto of [portada, ...resto]) {
      expect(foto).toHaveAttribute('width', '960');
      expect(foto).toHaveAttribute('height', '1280');
    }
  });

  test('should list the three functions as headings and keep the sample notices away from screen readers when the page loads', () => {
    // Act
    abrirLanding();

    // Assert
    const titulos = within(seccionSala()).getAllByRole('heading', { level: 3 }).map((titulo) => titulo.textContent);
    expect(titulos).toEqual(['Ingreso con QR', 'Retos de asistencia', 'Avisos de vencimiento']);
    // Los avisos de muestra son adorno con datos de ejemplo: estan en el DOM, pero no se anuncian
    for (const aviso of ['Reto de noviembre', 'Vence en 3 días', '3 planes vencen esta semana']) {
      expect(screen.getByText(aviso).closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });
});
