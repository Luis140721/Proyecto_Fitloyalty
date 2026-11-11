import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import BadgeEstado, { estadoDeMiembro } from '../src/components/BadgeEstado';
import CardGlass from '../src/components/CardGlass';
import EmptyState from '../src/components/EmptyState';
import IconoWhatsapp from '../src/components/IconoWhatsapp';
import LegalLayout from '../src/components/LegalLayout';
import Modal from '../src/components/Modal';
import PageTransition from '../src/components/PageTransition';
import Ripple from '../src/components/Ripple';
import UserAvatar from '../src/components/UserAvatar';
import { renderWithProviders } from './renderWithProviders';

describe('BadgeEstado', () => {
  test.each([
    ['activo', 'Al día', 'check_circle'],
    ['moroso', 'Vence pronto', 'payments'],
    ['vencido', 'Vencido', 'cancel'],
    ['riesgo', 'En riesgo', 'warning'],
    ['congelado', 'Congelado', 'ac_unit'],
  ])('muestra la etiqueta y el icono del estado %s', (estado, etiqueta, icono) => {
    renderWithProviders(<BadgeEstado estado={estado} data-testid="badge" />);
    expect(screen.getByTestId('badge')).toHaveTextContent(etiqueta);
    expect(screen.getByText(icono)).toHaveAttribute('aria-hidden', 'true');
  });

  test('usa el estado activo para una clave desconocida y permite sobrescribir la etiqueta', () => {
    renderWithProviders(<BadgeEstado estado="desconocido" className="extra">Personalizado</BadgeEstado>);
    expect(screen.getByText('Personalizado')).toHaveClass('badge-estado--activo', 'extra');
  });

  test.each([
    [null, 'activo'],
    [{ congelada: true, vencido: true }, 'congelado'],
    [{ vencido: true, vencePronto: true }, 'vencido'],
    [{ vencePronto: true, enRiesgo: true }, 'moroso'],
    [{ enRiesgo: true }, 'riesgo'],
    [{}, 'activo'],
  ])('mapea los flags del miembro %# a %s', (member, expected) => {
    expect(estadoDeMiembro(member)).toBe(expected);
  });
});

describe('EmptyState', () => {
  test('renderiza icono, texto y CTA accesible', async () => {
    const onCta = vi.fn();
    const { user } = renderWithProviders(
      <EmptyState icono="group_off" titulo="Sin miembros" descripcion="Crea el primero" ctaLabel="Nuevo miembro" onCta={onCta} className="extra" />,
    );
    expect(screen.getByRole('status')).toHaveClass('empty-state', 'extra');
    expect(screen.getByText('group_off').closest('.empty-state__halo')).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByRole('button', { name: 'Nuevo miembro' }));
    expect(onCta).toHaveBeenCalledOnce();
  });

  test('no muestra la acción sin callback ni los textos opcionales', () => {
    renderWithProviders(<EmptyState ctaLabel="No ejecutable" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByText('No ejecutable')).not.toBeInTheDocument();
  });
});

describe('CardGlass', () => {
  test('aplica etiqueta semántica, padding y atributos adicionales', () => {
    renderWithProviders(<CardGlass as="article" padding="lg" data-testid="card">Contenido</CardGlass>);
    expect(screen.getByTestId('card')).toHaveClass('card-glass--p-lg');
    expect(screen.getByTestId('card').tagName).toBe('ARTICLE');
  });

  test.each(['Enter', ' ', 'Spacebar'])('activa la tarjeta con teclado: %s', async (key) => {
    const onClick = vi.fn();
    renderWithProviders(<CardGlass onClick={onClick}>Abrir</CardGlass>);
    const card = screen.getByRole('button', { name: 'Abrir' });
    expect(card).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(card, { key });
    expect(onClick).toHaveBeenCalledOnce();
  });

  test('respeta el evento cancelado y no sustituye la semántica de un botón', () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn((event) => event.preventDefault());
    const { rerender } = renderWithProviders(<CardGlass onClick={onClick} onKeyDown={onKeyDown}>Tarjeta</CardGlass>);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();

    rerender(<CardGlass as="button" onClick={onClick}>Nativo</CardGlass>);
    expect(screen.getByRole('button', { name: 'Nativo' })).not.toHaveAttribute('tabindex', '0');
  });
});

describe('Modal', () => {
  test('no renderiza cerrado y al abrir bloquea scroll, enfoca contenido y restaura foco al cerrar', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { rerender } = renderWithProviders(<Modal open={false} title="Editar" onClose={onClose}>Formulario</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<Modal open title="Editar" onClose={onClose}><input aria-label="Nombre" /></Modal>);
    expect(screen.getByRole('dialog', { name: 'Editar' })).toHaveAttribute('aria-modal', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus());

    rerender(<Modal open={false} title="Editar" onClose={onClose}>Formulario</Modal>);
    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  test('cierra con Escape y backdrop; un click dentro del dialog no lo cierra', async () => {
    const onClose = vi.fn();
    renderWithProviders(<Modal open title="Confirmar" onClose={onClose}>Contenido</Modal>);
    fireEvent.mouseDown(screen.getByRole('dialog'), { target: screen.getByRole('dialog') });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.mouseDown(screen.getByRole('presentation'), { target: screen.getByRole('presentation') });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('cierra con el botón, renderiza el footer y aplica la variante', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <Modal open title="Eliminar" variant="danger" onClose={onClose} footer={<button>Confirmar</button>}>Seguro</Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveClass('modal-dialog--danger');
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Confirmar');
    screen.getByRole('button', { name: 'Cerrar' }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('componentes de presentación', () => {
  test('usa iniciales, aliases de usuario y vuelve a iniciales si la imagen falla', () => {
    const { rerender } = renderWithProviders(<UserAvatar user={{ nombre: 'Ana Gómez' }} />);
    expect(screen.getByText('AG')).toHaveAttribute('aria-hidden', 'true');
    rerender(<UserAvatar user={{ name: 'Ana Gómez', foto_url: '/ana.png' }} size={64} />);
    const image = screen.getByRole('img', { name: 'Foto de Ana Gómez' });
    expect(image).toHaveStyle({ width: '64px', height: '64px' });
    fireEvent.error(image);
    expect(screen.getByText('AG')).toBeInTheDocument();
  });

  test('renderiza el icono de WhatsApp decorativo con tamaño configurable', () => {
    renderWithProviders(<IconoWhatsapp size={28} className="wa" />);
    expect(document.querySelector('svg')).toHaveAttribute('width', '28');
    expect(document.querySelector('svg')).toHaveClass('wa');
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('muestra una transición y activa su clase después de un frame', async () => {
    renderWithProviders(<PageTransition className="custom">Página</PageTransition>);
    await waitFor(() => expect(screen.getByText('Página')).toHaveClass('page-enter-active', 'custom'));
  });

  test('envuelve contenido legal y presenta enlaces de navegación', () => {
    renderWithProviders(<LegalLayout title="Privacidad" subtitle="Tus datos" updated="2026-01-01"><p>Contenido legal</p></LegalLayout>);
    expect(screen.getByRole('heading', { name: 'Privacidad' })).toBeInTheDocument();
    expect(screen.getByText('Última actualización: 2026-01-01')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Términos' })).toHaveAttribute('href', '/legal/terminos');
    expect(screen.getByText(/FitLoyalty/)).toBeInTheDocument();
  });
});

describe('Ripple', () => {
  function RippleHarness({ options = {} }) {
    const handler = Ripple(options);
    return <button onClick={handler}>Aplicar efecto</button>;
  }

  test('crea el efecto centrado y lo elimina al terminar la animación', () => {
    renderWithProviders(<RippleHarness options={{ opacity: 0.2 }} />);
    const host = screen.getByRole('button');
    host.getBoundingClientRect = () => ({ width: 100, height: 40, left: 10, top: 5 });
    fireEvent.click(host, { clientX: 30, clientY: 15 });
    const wave = host.querySelector('.ripple-wave');
    expect(wave).toHaveStyle({ width: '200px', height: '200px', opacity: '0.2' });
    expect(wave.style.left).toBe('-80px');
    expect(wave.style.top).toBe('-90px');
    fireEvent.animationEnd(wave);
    expect(host.querySelector('.ripple-wave')).toBeNull();
  });

  test('no crea el efecto si el host o el handler están deshabilitados', () => {
    const { rerender } = renderWithProviders(<RippleHarness options={{ disabled: true }} />);
    const host = screen.getByRole('button');
    fireEvent.click(host);
    expect(host.childElementCount).toBe(0);
    rerender(<RippleHarness />);
    const button = screen.getByRole('button');
    button.disabled = true;
    fireEvent.click(button);
    expect(button.querySelector('.ripple-wave')).toBeNull();
  });
});
