const { AppError } = require('../src/lib/errors');
const { errorHandler, notFound } = require('../src/middleware/errorHandler');

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('notFound', () => {
  test('incluye método y URL en la respuesta 404', () => {
    const res = makeResponse();

    notFound({ method: 'GET', originalUrl: '/api/missing' }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Ruta no encontrada: GET /api/missing',
      code: 'NOT_FOUND',
    });
  });
});

describe('errorHandler', () => {
  const req = { method: 'POST', originalUrl: '/api/test' };

  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    delete process.env.NODE_ENV;
    jest.restoreAllMocks();
  });

  test('serializa AppError con código y detalles opcionales', () => {
    const res = makeResponse();

    errorHandler(new AppError(400, 'Email inválido', 'BAD_EMAIL', { field: 'email' }), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Email inválido',
      code: 'BAD_EMAIL',
      details: { field: 'email' },
    });
  });

  test('usa null si AppError no tiene código y omite detalles', () => {
    const res = makeResponse();

    errorHandler(new AppError(500, 'Error interno'), req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({ error: 'Error interno', code: null });
  });

  test.each([
    ['entity.parse.failed', 400, 'BAD_JSON'],
    ['entity.too.large', 413, 'PAYLOAD_TOO_LARGE'],
  ])('mapea error de body %s', (type, status, code) => {
    const res = makeResponse();

    errorHandler({ type }, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json.mock.calls[0][0].code).toBe(code);
  });

  test('expone mensaje de error inesperado solo fuera de producción', () => {
    process.env.NODE_ENV = 'test';
    const res = makeResponse();

    errorHandler(new Error('detalle de desarrollo'), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'detalle de desarrollo',
      code: 'INTERNAL_ERROR',
    });
    expect(console.error).toHaveBeenCalled();
  });

  test('oculta mensaje interno en producción', () => {
    process.env.NODE_ENV = 'production';
    const res = makeResponse();

    errorHandler(new Error('database password leaked'), req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  });

  test('maneja errores nulos sin filtrar información', () => {
    process.env.NODE_ENV = 'production';
    const res = makeResponse();

    errorHandler(null, req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  });
});
