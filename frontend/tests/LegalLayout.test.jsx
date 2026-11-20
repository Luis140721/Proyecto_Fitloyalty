/**
 * Bootcamp semana 4 (Front, Luis): LegalLayout, el marco de las paginas
 * legales: titulo, subtitulo y fecha de actualizacion solo si llegan, los
 * enlaces entre paginas legales y el año del pie.
 *
 * Las tres paginas de texto (Terminos, Privacidad y Politica de datos) estan
 * fuera de la cobertura (vite.config.js); aqui se usa TerminosPage para
 * comprobar que entrega su titulo y su fecha al marco.
 */
import { describe, expect, test, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import LegalLayout from '../src/components/LegalLayout';
import TerminosPage from '../src/pages/TerminosPage';
import { renderWithProviders } from './renderWithProviders';

const abrirMarco = (props = {}) => renderWithProviders(
  <LegalLayout title="Política de prueba" {...props}><p>Texto legal de prueba.</p></LegalLayout>,
  { route: '/legal/prueba' },
);
const piePagina = () => screen.getByRole('contentinfo');

afterEach(() => vi.useRealTimers());

describe('LegalLayout', () => {
  test('should show the title, the subtitle, the update date and the content when they are given', () => {
    // Act
    abrirMarco({ subtitle: 'Cómo tratamos tus datos.', updated: '20 de octubre de 2026' });

    // Assert
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Política de prueba');
    expect(screen.getByText('Cómo tratamos tus datos.')).toBeInTheDocument();
    expect(screen.getByText('Última actualización: 20 de octubre de 2026')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Texto legal de prueba.');
  });

  test('should leave out the subtitle and the update date when they are not given', () => {
    // Act
    abrirMarco();

    // Assert
    expect(screen.queryByText(/Última actualización/)).not.toBeInTheDocument();
    expect(document.querySelector('.legal-hero__lead')).toBeNull();
  });

  test.each([
    ['Términos', '/legal/terminos'],
    ['Privacidad', '/legal/privacidad'],
    ['Política de datos', '/legal/datos'],
    ['Eliminar cuenta', '/legal/eliminar-cuenta'],
  ])('should open %s from the footer', async (enlace, ruta) => {
    // Arrange
    const { user } = abrirMarco();

    // Act
    await user.click(within(piePagina()).getByRole('link', { name: enlace }));

    // Assert
    expect(await screen.findByText(`Ruta actual: ${ruta}`)).toBeInTheDocument();
  });

  test('should go back to the landing when the user clicks the logo of the header', async () => {
    // Arrange
    const { user } = abrirMarco();
    const encabezado = screen.getByRole('banner');

    // Act
    await user.click(within(encabezado).getByRole('link'));

    // Assert
    expect(await screen.findByText('Ruta actual: /')).toBeInTheDocument();
  });

  test('should sign the footer with the current year', () => {
    // Arrange
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-02T12:00:00.000Z'));

    // Act
    abrirMarco();

    // Assert
    expect(within(piePagina()).getByText('© 2027 FitLoyalty')).toBeInTheDocument();
  });

  test('should show the terms page with its title and its update date inside the layout', () => {
    // Act
    renderWithProviders(<TerminosPage />, { route: '/legal/terminos' });

    // Assert
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Términos y condiciones');
    expect(screen.getByText(/^Última actualización: /)).toBeInTheDocument();
    expect(within(piePagina()).getByRole('link', { name: 'Términos' })).toHaveAttribute('href', '/legal/terminos');
  });
});
