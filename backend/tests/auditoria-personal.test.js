/**
 * Bootcamp semana 10 (TDD, Luis): el servicio que decide que se registra en
 * auditoria al editar una cuenta del personal (HU-04, criterio 4).
 * Criterios y lista de pruebas: docs/evidencias/s10-tdd-auditoria-personal.md.
 *
 * cambiosDeCuenta es una funcion pura: no hay dobles.
 */
const { cambiosDeCuenta } = require('../src/lib/auditoria-personal');

describe('cambiosDeCuenta', () => {
  test('should list every change in one entry when several things change at once', () => {
    // Arrange
    const antes = { activo: true, rol: 'ADMINISTRADOR' };
    const despues = { activo: false, rol: 'RECEPCIONISTA' };

    // Act
    const detalle = cambiosDeCuenta(antes, despues);

    // Assert
    expect(detalle).toEqual({
      eventos: ['DESACTIVADA', 'ROL_CAMBIADO'],
      antes: { activo: true, rol: 'ADMINISTRADOR' },
      despues: { activo: false, rol: 'RECEPCIONISTA' },
    });
  });

  test('should record the old and the new name when only the name changes', () => {
    // Arrange
    const antes = { activo: true, rol: 'RECEPCIONISTA', nombre: 'Ana Recepcion' };
    const despues = { activo: true, rol: 'RECEPCIONISTA', nombre: 'Ana Maria' };

    // Act
    const detalle = cambiosDeCuenta(antes, despues);

    // Assert
    expect(detalle).toEqual({ eventos: ['NOMBRE_CAMBIADO'], antes: { nombre: 'Ana Recepcion' }, despues: { nombre: 'Ana Maria' } });
  });
});
