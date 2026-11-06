const mockSchedule = jest.fn();
const mockRunJob = jest.fn();
let scheduledCallback;

jest.mock('node-cron', () => ({
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
    jest.restoreAllMocks();
  });

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
