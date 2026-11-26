/**
 * RQNF-16 (Ley 2300 de 2023, arts. 2 y 5; #108): las piezas de
 * src/components/AutorizacionesMiembro.jsx que usan el alta y la ficha de un
 * miembro para los mensajes comerciales:
 *
 * - CasillaMensajesComerciales: el interruptor y los canales. Nada se marca
 *   solo: para aceptar hay que marcar antes al menos un canal, y quitar el
 *   ultimo canal apaga la aceptacion (decision 12 de
 *   docs/evidencias/rqnf-16-ley-2300.md).
 * - HistorialAutorizaciones: la constancia de cada decision, con los canales
 *   y por donde se tomo (panel, app o enlace de baja).
 * - RepresentanteCampos: los datos del representante legal de un menor, que
 *   es quien decide por el (RQNF-17).
 *
 * Los componentes no guardan estado: aqui lo guarda un formulario de prueba,
 * con setEstado((previo) => ...) como hace MiembrosPage. Lo que se envia al
 * servidor se comprueba en MiembrosPage.comerciales.test.jsx.
 */
import { useState } from 'react';
import { describe, expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CasillaMensajesComerciales, HistorialAutorizaciones, RepresentanteCampos,
} from '../src/components/AutorizacionesMiembro';

// El texto v2 que el backend guarda como prueba de lo que se le mostro (backend/src/lib/autorizaciones.js).
const TEXTO_V2 = 'Acepto recibir del gimnasio mensajes comerciales y de publicidad (promociones, campañas y mensajes para que '
  + 'vuelva a entrenar) por los canales que marco: WhatsApp, correo o los dos. Sé que no estoy obligado(a) a '
  + 'aceptarlos y que mi membresía no depende de ello. Solo me escribirán de lunes a viernes de 7:00 a. m. a '
  + '7:00 p. m. y los sábados de 8:00 a. m. a 3:00 p. m., nunca los domingos ni los festivos, no más de una vez '
  + 'al día ni por varios canales en la misma semana. Puedo cancelarlos en cualquier momento desde la app, con el '
  + 'enlace que va al final de cada mensaje comercial o en recepción (Ley 2300 de 2023).';
const SIN_CANAL = 'Para registrar la aceptación, marca primero los canales que el miembro elige. Sin ella no recibe campañas ni '
  + 'mensajes de retención; los avisos de su plan (vencimiento) sí le llegan.';
const SIN_ACEPTAR = 'Sin esta aceptación no recibe campañas ni mensajes de retención. Los avisos de su plan (vencimiento) sí le llegan.';
const ACEPTADOS = 'Recibirá campañas y mensajes de retención solo por los canales marcados y en el horario de la Ley 2300.';

/** Un formulario minimo que guarda la decision como MiembrosPage: cada cambio sobre el estado anterior. */
function Formulario({ acepta = false, canales = [], ...props }) {
  const [estado, setEstado] = useState({ acepta, canales });
  return (
    <CasillaMensajesComerciales
      checked={estado.acepta}
      onChange={(v) => setEstado((previo) => ({ ...previo, acepta: v }))}
      canales={estado.canales}
      onCanales={(v) => setEstado((previo) => ({ ...previo, canales: v }))}
      {...props}
    />
  );
}

const abrirCasilla = (props) => {
  const user = userEvent.setup();
  return { user, ...render(<Formulario {...props} />) };
};
const interruptor = () => screen.getByRole('switch', { name: /^Mensajes comerciales \(opcional\)/ });
const canal = (nombre) => within(screen.getByRole('group', { name: 'Canales autorizados' })).getByRole('checkbox', { name: nombre });

describe('CasillaMensajesComerciales: por defecto nadie acepta', () => {
  test('should start off, with no channel marked and the switch blocked when the member has not decided', () => {
    // Act
    abrirCasilla();

    // Assert
    expect(interruptor()).not.toBeChecked();
    expect(interruptor()).toHaveAttribute('aria-checked', 'false');
    expect(interruptor()).toBeDisabled();
    expect(canal('WhatsApp')).not.toBeChecked();
    expect(canal('Correo')).not.toBeChecked();
    expect(screen.getByText(SIN_CANAL)).toBeInTheDocument();
  });

  test('should describe the switch with the whole text the member accepts when the box is shown', () => {
    // Act
    abrirCasilla();

    // Assert
    expect(interruptor()).toHaveAccessibleDescription(TEXTO_V2);
  });

  test('should unblock the switch without turning it on when a channel is marked', async () => {
    // Arrange
    const { user } = abrirCasilla();

    // Act
    await user.click(canal('WhatsApp'));

    // Assert: marcar el canal no es aceptar
    expect(canal('WhatsApp')).toBeChecked();
    expect(canal('Correo')).not.toBeChecked();
    expect(interruptor()).toBeEnabled();
    expect(interruptor()).not.toBeChecked();
    expect(screen.getByText(SIN_ACEPTAR)).toBeInTheDocument();
  });
});

describe('CasillaMensajesComerciales: aceptar y cancelar', () => {
  test('should turn on only with the marked channel and say where the messages will arrive when the switch is clicked', async () => {
    // Arrange
    const { user } = abrirCasilla();
    await user.click(canal('Correo'));

    // Act
    await user.click(interruptor());

    // Assert: no se le marca WhatsApp por su cuenta
    expect(interruptor()).toBeChecked();
    expect(interruptor()).toHaveAttribute('aria-checked', 'true');
    expect(canal('Correo')).toBeChecked();
    expect(canal('WhatsApp')).not.toBeChecked();
    expect(screen.getByText(ACEPTADOS)).toBeInTheDocument();
  });

  test('should turn the acceptance off and block the switch when the last channel is unmarked', async () => {
    // Arrange
    const { user } = abrirCasilla({ acepta: true, canales: ['WHATSAPP'] });
    expect(interruptor()).toBeChecked();

    // Act
    await user.click(canal('WhatsApp'));

    // Assert: los dos cambios del mismo clic quedan aplicados
    expect(canal('WhatsApp')).not.toBeChecked();
    expect(interruptor()).not.toBeChecked();
    expect(interruptor()).toBeDisabled();
    expect(screen.getByText(SIN_CANAL)).toBeInTheDocument();
  });

  test('should keep the acceptance on with the other channel when one of two channels is unmarked', async () => {
    // Arrange
    const { user } = abrirCasilla({ acepta: true, canales: ['WHATSAPP', 'EMAIL'] });

    // Act
    await user.click(canal('WhatsApp'));

    // Assert
    expect(interruptor()).toBeChecked();
    expect(canal('WhatsApp')).not.toBeChecked();
    expect(canal('Correo')).toBeChecked();
    expect(screen.getByText(ACEPTADOS)).toBeInTheDocument();
  });

  test('should cancel the messages and leave the channels as they were when the switch is turned off', async () => {
    // Arrange
    const { user } = abrirCasilla({ acepta: true, canales: ['WHATSAPP', 'EMAIL'] });

    // Act
    await user.click(interruptor());

    // Assert: se puede volver a encender sin marcar de nuevo
    expect(interruptor()).not.toBeChecked();
    expect(interruptor()).toBeEnabled();
    expect(canal('WhatsApp')).toBeChecked();
    expect(canal('Correo')).toBeChecked();
    expect(screen.getByText(SIN_ACEPTAR)).toBeInTheDocument();
  });

  test('should ask for a channel and still let the switch be turned off when an acceptance arrives without channels', async () => {
    // Arrange: un registro que el servidor no deberia mandar (aceptacion sin canal)
    const { user } = abrirCasilla({ acepta: true, canales: null });
    expect(screen.getByText('Marca al menos un canal o apaga los mensajes comerciales.')).toBeInTheDocument();
    expect(canal('WhatsApp')).not.toBeChecked();
    expect(interruptor()).toBeEnabled();

    // Act
    await user.click(interruptor());

    // Assert
    expect(interruptor()).not.toBeChecked();
    expect(interruptor()).toBeDisabled();
    expect(screen.getByText(SIN_CANAL)).toBeInTheDocument();
  });

  test('should keep the acceptance and stop asking for a channel when one is marked on an acceptance that arrived without channels', async () => {
    // Arrange
    const { user } = abrirCasilla({ acepta: true, canales: null });

    // Act
    await user.click(canal('Correo'));

    // Assert
    expect(interruptor()).toBeChecked();
    expect(canal('Correo')).toBeChecked();
    expect(canal('WhatsApp')).not.toBeChecked();
    expect(screen.getByText(ACEPTADOS)).toBeInTheDocument();
    expect(screen.queryByText('Marca al menos un canal o apaga los mensajes comerciales.')).not.toBeInTheDocument();
  });
});

describe('CasillaMensajesComerciales: avisos', () => {
  test('should say that the legal representative decides when the member is a minor', () => {
    // Act
    abrirCasilla({ menor: true });

    // Assert
    expect(screen.getByText('El miembro es menor de edad: esta decisión la toma su representante legal.')).toBeInTheDocument();
  });

  test('should not mention the representative nor show a notice when the member is an adult and nothing changed', () => {
    // Act
    abrirCasilla();

    // Assert
    expect(screen.queryByText(/representante legal/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('should show the notice of the form as a status message when the form gives one', () => {
    // Act
    abrirCasilla({ aviso: 'Al guardar, el miembro deja de recibir campañas y mensajes de retención. Queda constancia en el historial.' });

    // Assert
    expect(within(screen.getByRole('status')).getByText(
      'Al guardar, el miembro deja de recibir campañas y mensajes de retención. Queda constancia en el historial.',
    )).toBeInTheDocument();
  });
});

describe('HistorialAutorizaciones', () => {
  // Filas como las arma resumenAutorizaciones (backend/src/lib/autorizaciones.js), lo mas reciente primero.
  // La pantalla muestra la fecha en la zona del navegador: las de prueba son el mediodia de ese dia
  // en la zona del equipo donde corra, para que el dia sea el mismo en Colombia, en UTC o donde sea.
  const mediodia = (dia) => new Date(2026, 10, dia, 12, 0, 0).toISOString();
  const fila = (extra) => ({
    tipo: 'MENSAJES_COMERCIALES', otorgada: true, version: 'v2', canal: 'PANEL', fecha: mediodia(20),
    registrada_por: null, texto: TEXTO_V2, detalle: null, canales: null, ...extra,
  });
  const filas = () => screen.getAllByRole('listitem');

  test('should say there is nothing registered yet when the member has no history', () => {
    // Act
    render(<HistorialAutorizaciones historial={[]} />);

    // Assert
    expect(screen.getByText('Todavía no hay autorizaciones registradas para este miembro.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('should say the same when the history did not arrive', () => {
    // Act
    render(<HistorialAutorizaciones />);

    // Assert
    expect(screen.getByText('Todavía no hay autorizaciones registradas para este miembro.')).toBeInTheDocument();
  });

  test('should tell the channels, the text version, where it was taken and who registered it when commercial messages were accepted', () => {
    // Act
    render(<HistorialAutorizaciones historial={[
      fila({ canales: ['WHATSAPP', 'EMAIL'], registrada_por: 'Luis Admin' }),
      fila({ canales: ['EMAIL'], canal: 'APP', fecha: mediodia(19) }),
    ]} />);

    // Assert
    expect(filas()).toHaveLength(2);
    expect(filas()[0]).toHaveTextContent(/^20\/11\/2026/);
    expect(filas()[0]).toHaveTextContent('· Mensajes comerciales: otorgada (WhatsApp y correo) · texto v2 · panel del gimnasio · registró Luis Admin');
    expect(filas()[1]).toHaveTextContent(/^19\/11\/2026/);
    expect(filas()[1]).toHaveTextContent(/· Mensajes comerciales: otorgada \(correo\) · texto v2 · app del miembro$/);
  });

  test('should say the acceptance was revoked through the unsubscribe link, without channels, when the member used the link', () => {
    // Act
    render(<HistorialAutorizaciones historial={[fila({ otorgada: false, canal: 'ENLACE', canales: null })]} />);

    // Assert
    expect(filas()[0]).toHaveTextContent(/· Mensajes comerciales: no otorgada o revocada · texto v2 · enlace de baja$/);
    expect(filas()[0]).not.toHaveTextContent('WhatsApp');
  });

  test('should not list channels when the decision was to refuse, even if the row brings them', () => {
    // Act
    render(<HistorialAutorizaciones historial={[fila({ otorgada: false, canales: ['WHATSAPP'] })]} />);

    // Assert
    expect(filas()[0]).toHaveTextContent(/· Mensajes comerciales: no otorgada o revocada · texto v2 · panel del gimnasio$/);
  });

  test('should name the other authorizations and who gave them when the history has them', () => {
    // Act
    render(<HistorialAutorizaciones historial={[
      fila({ tipo: 'MENSAJES_COMERCIALES', canales: ['WHATSAPP'], detalle: { otorgada_por: 'REPRESENTANTE_LEGAL' }, registrada_por: 'Ana Recepción' }),
      fila({ tipo: 'DATOS_SENSIBLES', otorgada: false, version: 'v1', detalle: { motivo: 'MAYOR_DE_EDAD' } }),
      fila({ tipo: 'TERMINOS', otorgada: false, version: 'v1' }),
      fila({ tipo: 'TIPO_NUEVO', canal: 'KIOSCO', canales: ['SMS'] }),
    ]} />);

    // Assert
    expect(filas()[0]).toHaveTextContent(
      /· Mensajes comerciales: otorgada \(WhatsApp\) · texto v2 · panel del gimnasio · registró Ana Recepción · por el representante legal$/,
    );
    expect(filas()[1]).toHaveTextContent(/· Datos sensibles \(salud\): no otorgada o revocada · texto v1 · panel del gimnasio · cumplió 18 años$/);
    expect(filas()[2]).toHaveTextContent(/· Contrato y términos: no otorgada · texto v1 · panel del gimnasio$/);
    // Lo que la pantalla no conoce se muestra tal cual.
    expect(filas()[3]).toHaveTextContent(/· TIPO_NUEVO: otorgada \(SMS\) · texto v2 · KIOSCO$/);
  });
});

describe('RepresentanteCampos', () => {
  function FormularioRepresentante(props) {
    const [valores, setValores] = useState({});
    return (
      <>
        <RepresentanteCampos valores={valores} onChange={(campo, valor) => setValores((previo) => ({ ...previo, [campo]: valor }))} {...props} />
        <output aria-label="Lo que se guardaria">{JSON.stringify(valores)}</output>
      </>
    );
  }

  test('should keep each piece of data of the legal representative under its own field when the reception fills them', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<FormularioRepresentante edad={15} />);

    // Act
    await user.type(screen.getByLabelText('Nombre del representante legal *'), 'Marta Ruiz');
    await user.selectOptions(screen.getByLabelText('Tipo de documento *'), 'CE');
    await user.type(screen.getByLabelText('Número de documento *'), '987654');
    await user.selectOptions(screen.getByLabelText('Parentesco *'), 'Tutor(a) legal');
    await user.type(screen.getByLabelText('Teléfono del representante *'), '3104445566');

    // Assert
    expect(JSON.parse(screen.getByLabelText('Lo que se guardaria').textContent)).toEqual({
      representante_nombre: 'Marta Ruiz',
      representante_tipo_documento: 'CE',
      representante_documento: '987654',
      representante_parentesco: 'Tutor(a) legal',
      representante_telefono: '3104445566',
    });
    expect(screen.getByText(/El miembro tiene 15 años: los datos y la autorización de su representante legal son obligatorios\./)).toBeInTheDocument();
  });

  test('should explain that the representative is required without the age when the age is not known', () => {
    // Act
    render(<FormularioRepresentante edad={null} />);

    // Assert
    expect(screen.getByText(/El miembro es menor de edad: los datos y la autorización de su representante legal son obligatorios\./)).toBeInTheDocument();
    expect(screen.queryByText(/años/)).not.toBeInTheDocument();
  });

  test('should mark the field and show its error when the form reports one', () => {
    // Act
    render(<FormularioRepresentante errores={{
      representante_nombre: 'Escribe el nombre completo del representante legal.',
      representante_telefono: 'Debe tener entre 7 y 15 dígitos.',
    }} />);

    // Assert
    expect(screen.getByLabelText(/^Nombre del representante legal \*/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Teléfono del representante \*/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Número de documento \*/)).not.toHaveAttribute('aria-invalid');
    const errores = screen.getAllByRole('alert');
    expect(errores).toHaveLength(2);
    expect(within(errores[0]).getByText('Escribe el nombre completo del representante legal.')).toBeInTheDocument();
    expect(within(errores[1]).getByText('Debe tener entre 7 y 15 dígitos.')).toBeInTheDocument();
  });
});
