const mockSchedule = jest.fn();
const mockRunJob = jest.fn();
let scheduledCallback;

jest.mock('../src/jobs/cronScheduler', () => ({
  schedule: (...args) => mockSchedule(...args),
}));
jest.mock('../src/jobs/expiracion', () => ({
  runJob: (...args) => mockRunJob(...args),
}));

function loadScheduler(disabled) {
  jest.resetModules();
  mockSchedule.mockReset();
  mockRunJob.mockReset();
  scheduledCallback = null;
  if (disabled) process.env.DISABLE_SCHEDULER = 'true';
  else delete process.env.DISABLE_SCHEDULER;
  mockSchedule.mockImplementation((_expression, callback) => {
    scheduledCallback = callback;
    return { stop: jest.fn() };
  });
  return require('../src/jobs/scheduler');
}

describe('scheduler', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.DISABLE_SCHEDULER;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // mockSchedule es un mock para comprobar que la tarea no se registra; console.log es un spy.
  test('no programa tareas si está deshabilitado y se puede detener', () => {
    const scheduler = loadScheduler(true);

    scheduler.start();

    expect(scheduler.isStarted()).toBe(true);
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      '[scheduler] DESHABILITADO por env DISABLE_SCHEDULER=true'
    );

    scheduler.stop();

    expect(scheduler.isStarted()).toBe(false);
  });

  // mockSchedule es un mock de la interfaz propia del cron para verificar expresión y zona horaria.
  test('programa el job una sola vez con la zona horaria correcta', () => {
    const scheduler = loadScheduler(false);

    scheduler.start();
    scheduler.start();

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule).toHaveBeenCalledWith(
      '0 9 * * *',
      expect.any(Function),
      { timezone: 'America/Bogota' }
    );
    expect(scheduler.isStarted()).toBe(true);
  });

  // runJob es un stub con resumen controlado; mockSchedule y console.log verifican el comportamiento.
  test('ejecuta el job y registra un resumen reducido', async () => {
    const scheduler = loadScheduler(false);
    mockRunJob.mockResolvedValueOnce({
      encontrados: 5,
      enVentana: 3,
      enviados: 2,
      omitidosDuplicado: 1,
      omitidosSinTelefono: 1,
    });
    scheduler.start();

    await scheduledCallback();

    expect(mockRunJob).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      '[scheduler] Job de vencimiento OK:',
      JSON.stringify({ encontrados: 5, enVentana: 3, enviados: 2, omitidosDuplicado: 1 })
    );
  });

  // fake timers disparan un stub del scheduler; runJob es un mock de la dependencia del job.
  test('ejecuta el job cuando el scheduler simulado alcanza la hora programada', async () => {
    jest.useFakeTimers();
    const scheduler = loadScheduler(false);
    mockSchedule.mockImplementationOnce((_expression, callback) => {
      const timer = setTimeout(() => {
        void callback();
      }, 1000);
      return { stop: () => clearTimeout(timer) };
    });
    mockRunJob.mockResolvedValueOnce({
      encontrados: 1,
      enVentana: 1,
      enviados: 1,
      omitidosDuplicado: 0,
    });

    scheduler.start();
    await jest.advanceTimersByTimeAsync(1000);

    expect(mockRunJob).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      '[scheduler] Job de vencimiento OK:',
      JSON.stringify({ encontrados: 1, enVentana: 1, enviados: 1, omitidosDuplicado: 0 })
    );
    scheduler.stop();
  });

  // runJob es un stub que falla; console.error es un spy que prueba el manejo del error.
  test('captura errores del job programado', async () => {
    const scheduler = loadScheduler(false);
    mockRunJob.mockRejectedValueOnce(new Error('job unavailable'));
    scheduler.start();

    await scheduledCallback();

    expect(console.error).toHaveBeenCalledWith(
      '[scheduler] Error en job de vencimiento:',
      'job unavailable'
    );
  });

  // mockSchedule devuelve un fake handle con estado y stop observable para probar el ciclo de vida.
  test('detiene una tarea activa y permite volver a iniciarla', () => {
    const scheduler = loadScheduler(false);
    scheduler.start();
    const task = mockSchedule.mock.results[0].value;

    scheduler.stop();

    expect(task.stop).toHaveBeenCalledTimes(1);
    expect(scheduler.isStarted()).toBe(false);
    scheduler.start();
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });
});
