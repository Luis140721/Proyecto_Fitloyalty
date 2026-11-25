/**
 * Arranque (index.js): si se corta la conexion en medio de las migraciones, el
 * proceso termina para que Render lo reinicie y las vuelva a intentar. Antes lo
 * hacia la propia caida por el 'error' sin oyente (#111). Con otro error de una
 * migracion, el servidor abre igual, como siempre.
 */
const { conexionPerdida } = require('../src/lib/conexion');

describe('conexionPerdida', () => {
  test.each([
    [{ code: '57P01', message: 'terminating connection due to administrator command' }],
    [{ code: '08006', message: 'x' }],
    [{ code: 'ECONNRESET', message: 'read ECONNRESET' }],
    [{ message: 'Connection terminated unexpectedly' }],
    [{ message: 'Client has encountered a connection error and is not queryable' }],
  ])('should be true for %j', (err) => {
    expect(conexionPerdida(err)).toBe(true);
  });

  test.each([
    [{ code: '42P01', message: 'relation "x" does not exist' }],
    [{ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:5432' }],
    [{ message: 'syntax error' }],
    [{}],
    [null],
  ])('should be false for %j', (err) => {
    expect(conexionPerdida(err)).toBe(false);
  });
});

describe('iniciar: las migraciones del arranque', () => {
  let salir, escuchar;
  const arrancar = async (error) => {
    jest.resetModules();
    jest.doMock('../src/db/db', () => ({ query: async () => ({ rows: [{ hora: 'ahora' }] }), on() {} }));
    jest.doMock('../src/db/migrate', () => ({ applyMigrations: async () => { if (error) throw error; } }));
    jest.doMock('../src/jobs/scheduler', () => ({ start: jest.fn() }));
    jest.doMock('../src/lib/qr-dinamico', () => ({ ...jest.requireActual('../src/lib/qr-dinamico'), avisarSecretoAlArrancar: async () => {} }));
    const { app, iniciar } = require('../src/index');
    escuchar = jest.spyOn(app, 'listen').mockImplementation(() => {});
    await iniciar();
  };

  beforeEach(() => {
    salir = jest.spyOn(process, 'exit').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('should end the process without opening the server when the connection is lost', async () => {
    await arrancar(Object.assign(new Error('Connection terminated unexpectedly'), {}));

    expect(salir).toHaveBeenCalledWith(1);
    expect(escuchar).not.toHaveBeenCalled();
  });

  test('should open the server anyway, as before, when a migration fails for another reason', async () => {
    await arrancar(Object.assign(new Error('relation "x" does not exist'), { code: '42P01' }));

    expect(salir).not.toHaveBeenCalled();
    expect(escuchar).toHaveBeenCalledTimes(1);
  });

  test('should open the server when the migrations work', async () => {
    await arrancar(null);

    expect(salir).not.toHaveBeenCalled();
    expect(escuchar).toHaveBeenCalledTimes(1);
  });
});

// El arranque decide por el error que recibe: con la conexion rota el ROLLBACK
// tambien falla, y el que importa es el primero.
describe('applyMigrations', () => {
  test('should throw the error of the migration, and not the one of the ROLLBACK, when the connection is lost', async () => {
    jest.resetModules();
    jest.dontMock('../src/db/migrate');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const corte = Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' });
    const cliente = {
      query: jest.fn(async (sql) => {
        if (sql === 'BEGIN') return {};
        if (sql === 'ROLLBACK') throw new Error('el ROLLBACK tambien fallo');
        throw corte;
      }),
      release: jest.fn(),
    };
    jest.doMock('../src/db/db', () => ({ query: async () => ({ rows: [] }), connect: async () => cliente, on() {} }));
    const { applyMigrations } = require('../src/db/migrate');

    await expect(applyMigrations()).rejects.toBe(corte);

    expect(cliente.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(cliente.release).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });
});
