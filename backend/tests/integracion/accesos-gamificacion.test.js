/**
 * Integracion, capa BD: las consultas del check-in sobre el miembro, contra
 * PostgreSQL de verdad.
 *
 *   - registrarAccesoBloqueado (lib/accesos.js): escribe en notificacion con la
 *     forma de produccion (migracion 014: leida, id_miembro, CHECK de tipo) y no
 *     repite el aviso dentro de la ventana de 10 minutos.
 *   - calcularGamificacion (lib/gamificacion.js): racha por dia de Colombia
 *     (AT TIME ZONE), total de ingresos validos e hitos con UNIQUE y ON CONFLICT.
 *
 * Las dos funciones reciben la conexion como parametro: aqui reciben el
 * cliente de la transaccion del test, que termina en ROLLBACK. tests/
 * acceso-bloqueado.test.js y tests/gamificacion.test.js prueban las mismas
 * reglas con un pool falso; estos ven lo que el falso no puede: que el SQL
 * corre, que las columnas existen y lo que hacen el orden, los filtros y las
 * restricciones. Sin TEST_DATABASE_URL se salta.
 */
const { describeConBd, prepararBdDePruebas } = require('./bd-pruebas');
const { crearGimnasio, crearMiembro, usarTransaccionPorTest } = require('./datos');
const { registrarAccesoBloqueado, VENTANA_MIN } = require('../../src/lib/accesos');
const { calcularGamificacion } = require('../../src/lib/gamificacion');

describeConBd('check-in contra la BD de pruebas', () => {
  let pool;

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
  }, 60_000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  const tx = usarTransaccionPorTest(() => pool);

  async function gimnasioConMiembro() {
    const gym = await crearGimnasio(tx.cliente);
    const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio, { nombre: 'Ana Pérez' });
    return { gymId: gym.id_gimnasio, idMiembro: miembro.id_miembro };
  }

  describe('registrarAccesoBloqueado', () => {
    async function avisos({ gymId, idMiembro }) {
      const { rows } = await tx.cliente.query(
        'SELECT tipo, titulo, mensaje, leida FROM notificacion WHERE id_gimnasio = $1 AND id_miembro = $2 ORDER BY id_notificacion',
        [gymId, idMiembro],
      );
      return rows;
    }

    test('guarda el aviso en notificacion para el gimnasio y el miembro', async () => {
      const ids = await gimnasioConMiembro();

      const creado = await registrarAccesoBloqueado(tx.cliente, { ...ids, nombre: 'Ana Pérez', motivo: 'CONGELADA' });

      expect(creado).toBe(true);
      expect(await avisos(ids)).toEqual([{
        tipo: 'ALERTA',
        titulo: 'Acceso bloqueado',
        mensaje: 'Ana Pérez intento ingresar y se bloqueo: su membresia esta congelada.',
        leida: false,
      }]);
    });

    test('un segundo escaneo dentro de la ventana no repite el aviso', async () => {
      const ids = await gimnasioConMiembro();
      await registrarAccesoBloqueado(tx.cliente, { ...ids, nombre: 'Ana Pérez', motivo: 'VENCIDA' });

      const otraVez = await registrarAccesoBloqueado(tx.cliente, { ...ids, nombre: 'Ana Pérez', motivo: 'VENCIDA' });

      expect(otraVez).toBe(false);
      expect(await avisos(ids)).toHaveLength(1);
    });

    test('si el aviso ya se leyo, el siguiente intento crea otro', async () => {
      const ids = await gimnasioConMiembro();
      await registrarAccesoBloqueado(tx.cliente, { ...ids, nombre: 'Ana Pérez', motivo: 'VENCIDA' });
      await tx.cliente.query('UPDATE notificacion SET leida = TRUE WHERE id_miembro = $1', [ids.idMiembro]);

      const nuevo = await registrarAccesoBloqueado(tx.cliente, { ...ids, nombre: 'Ana Pérez', motivo: 'VENCIDA' });

      expect(nuevo).toBe(true);
      expect((await avisos(ids)).map((a) => a.leida)).toEqual([true, false]);
    });

    test(`un aviso de hace ${VENTANA_MIN - 1} minutos frena el nuevo y uno de hace ${VENTANA_MIN + 1} no`, async () => {
      const ids = await gimnasioConMiembro();
      await registrarAccesoBloqueado(tx.cliente, { ...ids, nombre: 'Ana Pérez', motivo: 'SIN_PLAN' });
      const envejecer = (minutos) => tx.cliente.query(
        `UPDATE notificacion SET fecha_creacion = NOW() - make_interval(mins => $2) WHERE id_miembro = $1`,
        [ids.idMiembro, minutos],
      );

      await envejecer(VENTANA_MIN - 1);
      const dentro = await registrarAccesoBloqueado(tx.cliente, { ...ids, nombre: 'Ana Pérez', motivo: 'SIN_PLAN' });
      await envejecer(VENTANA_MIN + 1);
      const fuera = await registrarAccesoBloqueado(tx.cliente, { ...ids, nombre: 'Ana Pérez', motivo: 'SIN_PLAN' });

      expect([dentro, fuera]).toEqual([false, true]);
      expect(await avisos(ids)).toHaveLength(2);
    });

    test('el aviso de un miembro no frena el de otro miembro del mismo gimnasio', async () => {
      const ids = await gimnasioConMiembro();
      const otro = await crearMiembro(tx.cliente, ids.gymId, { nombre: 'Luis Gómez' });
      await registrarAccesoBloqueado(tx.cliente, { ...ids, nombre: 'Ana Pérez', motivo: 'VENCIDA' });

      const creado = await registrarAccesoBloqueado(tx.cliente, {
        gymId: ids.gymId, idMiembro: otro.id_miembro, nombre: 'Luis Gómez', motivo: 'VENCIDA',
      });

      expect(creado).toBe(true);
    });
  });

  describe('calcularGamificacion', () => {
    beforeEach(async () => {
      // checkin.fecha_hora es TIMESTAMP sin zona: la funcion la lee en la zona
      // de la sesion. UTC, como el Postgres de Docker y Neon.
      await tx.cliente.query("SET LOCAL TimeZone = 'UTC'");
    });

    async function registrarIngresos({ gymId, idMiembro }, ingresos) {
      for (const [fechaHora, valido = true] of ingresos) {
        await tx.cliente.query(
          'INSERT INTO checkin (id_miembro, id_gimnasio, fecha_hora, valido) VALUES ($1, $2, $3, $4)',
          [idMiembro, gymId, fechaHora, valido],
        );
      }
    }

    async function crearHito(gymId, { nombre, tipo, valor }) {
      await tx.cliente.query(
        `INSERT INTO hito_gamificacion (id_gimnasio, nombre, tipo_hito, valor_objetivo, mensaje)
         VALUES ($1, $2, $3, $4, $5)`,
        [gymId, nombre, tipo, valor, `¡${nombre}!`],
      );
    }

    test('la racha cuenta los dias seguidos hasta el ultimo ingreso, aunque se registren en desorden', async () => {
      const ids = await gimnasioConMiembro();
      // 15:00 UTC son las 10:00 en Colombia.
      await registrarIngresos(ids, [['2026-03-09 15:00'], ['2026-03-01 15:00'], ['2026-03-10 15:00'], ['2026-03-08 15:00']]);

      const resultado = await calcularGamificacion(tx.cliente, ids);

      expect(resultado).toMatchObject({ racha: 3, totalAsistencias: 4 });
    });

    test('agrupa los ingresos por dia de Colombia y no de UTC', async () => {
      const ids = await gimnasioConMiembro();
      // 2026-03-10 03:00 UTC es 2026-03-09 a las 22:00 en Colombia: el mismo dia
      // que el primero. Con dias UTC serian dos dias seguidos (racha 2).
      await registrarIngresos(ids, [['2026-03-09 15:00'], ['2026-03-10 03:00']]);

      const resultado = await calcularGamificacion(tx.cliente, ids);

      expect(resultado).toMatchObject({ racha: 1, totalAsistencias: 2 });
    });

    test('los ingresos no validos no cuentan para la racha ni para el total', async () => {
      const ids = await gimnasioConMiembro();
      await registrarIngresos(ids, [['2026-03-08 15:00'], ['2026-03-09 15:00', false], ['2026-03-10 15:00']]);

      const resultado = await calcularGamificacion(tx.cliente, ids);

      expect(resultado).toMatchObject({ racha: 1, totalAsistencias: 2 });
    });

    test('otorga el hito alcanzado una sola vez y despues anuncia el siguiente', async () => {
      const ids = await gimnasioConMiembro();
      await crearHito(ids.gymId, { nombre: 'Dos visitas', tipo: 'TOTAL_ASISTENCIAS', valor: 2 });
      await crearHito(ids.gymId, { nombre: 'Cinco visitas', tipo: 'TOTAL_ASISTENCIAS', valor: 5 });
      await registrarIngresos(ids, [['2026-03-09 15:00'], ['2026-03-10 15:00']]);

      const primera = await calcularGamificacion(tx.cliente, ids);
      const segunda = await calcularGamificacion(tx.cliente, ids);
      const { rows: otorgados } = await tx.cliente.query(
        'SELECT mostrado_en_checkin FROM hito_miembro WHERE id_miembro = $1',
        [ids.idMiembro],
      );

      expect(primera.hitosNuevos.map((h) => h.nombre)).toEqual(['Dos visitas']);
      expect(primera.mensaje).toBe('¡Dos visitas!');
      expect(segunda.hitosNuevos).toEqual([]);
      expect(segunda.proximoHito).toEqual({ nombre: 'Cinco visitas', tipo: 'TOTAL_ASISTENCIAS', faltan: 3 });
      expect(otorgados).toEqual([{ mostrado_en_checkin: true }]);
    });

    test('con dos hitos nuevos a la vez, el mensaje es el del hito de menor valor', async () => {
      const ids = await gimnasioConMiembro();
      // Sin el ORDER BY de la consulta, PostgreSQL devuelve los hitos en el orden
      // en disco o en el del indice UNIQUE (id_gimnasio, tipo_hito, valor_objetivo).
      // Con dos hitos del mismo tipo ese indice ya los ordena por valor y el
      // mutante pasaba; con RACHA (creado primero) y TOTAL_ASISTENCIAS, los dos
      // ordenes ponen primero el de valor 2.
      await crearHito(ids.gymId, { nombre: 'Racha de dos dias', tipo: 'RACHA', valor: 2 });
      await crearHito(ids.gymId, { nombre: 'Primera visita', tipo: 'TOTAL_ASISTENCIAS', valor: 1 });
      await registrarIngresos(ids, [['2026-03-09 15:00'], ['2026-03-10 15:00']]);

      const resultado = await calcularGamificacion(tx.cliente, ids);

      expect(resultado.hitosNuevos.map((h) => h.nombre)).toEqual(['Primera visita', 'Racha de dos dias']);
      expect(resultado.mensaje).toBe('¡Primera visita!');
    });
  });
});
