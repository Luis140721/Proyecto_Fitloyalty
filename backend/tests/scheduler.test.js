const originalEnv = { ...process.env };

function loadScheduler(expiracionResult, abandonoResult) {
  const callbacks = [];
  const tasks = [];
  const schedule = jest.fn((expression, callback, options) => {
    const task = { expression, callback, options, stop: jest.fn() };
    callbacks.push(callback);
    tasks.push(task);
    return task;
  });
  jest.resetModules();
  jest.doMock('node-cron', () => ({ schedule }));
  jest.doMock('../src/jobs/expiracion', () => ({
    runJob: jest.fn(() => expiracionResult),
  }));
  jest.doMock('../src/jobs/abandono', () => ({
    runJob: jest.fn(() => abandonoResult),
  }));
  return {
    scheduler: require('../src/jobs/scheduler'),
    schedule,
    callbacks,
    tasks,
  };
}

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.DISABLE_SCHEDULER;
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.dontMock('node-cron');
  jest.dontMock('../src/jobs/expiracion');
  jest.dontMock('../src/jobs/abandono');
  process.env = { ...originalEnv };
});

test('registra los tres horarios colombianos una sola vez y detiene todas las tareas', async () => {
  const { scheduler, schedule, callbacks, tasks } = loadScheduler(
    Promise.resolve({ encontrados: 2, enVentana: 1, enviados: 1, omitidosDuplicado: 0 }),
    Promise.resolve({ enviados: 3 }),
  );
  jest.spyOn(console, 'log').mockImplementation(() => {});

  scheduler.start();
  scheduler.start();
  expect(scheduler.isStarted()).toBe(true);
  expect(schedule).toHaveBeenCalledTimes(3);
  expect(schedule.mock.calls.map(([expression]) => expression)).toEqual([
    '0 9 * * *',
    '0 15 * * *',
    '0 8 * * *',
  ]);
  expect(schedule.mock.calls.every(([, , options]) => options.timezone === 'America/Bogota')).toBe(true);

  await callbacks[0]();
  await callbacks[2]();
  scheduler.stop();
  expect(tasks.every((task) => task.stop.mock.calls.length === 1)).toBe(true);
  expect(scheduler.isStarted()).toBe(false);
  scheduler.stop();
});

test('registra los errores de ambos jobs y mantiene activo el scheduler', async () => {
  const { scheduler, callbacks } = loadScheduler(
    Promise.reject(new Error('falló expiración')),
    Promise.reject(new Error('falló abandono')),
  );
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});

  scheduler.start();
  await callbacks[0]();
  await callbacks[2]();

  expect(error).toHaveBeenCalledWith(
    '[scheduler] Error en job de vencimiento:',
    'falló expiración',
  );
  expect(error).toHaveBeenCalledWith(
    '[scheduler] Error en job de abandono:',
    'falló abandono',
  );
  expect(scheduler.isStarted()).toBe(true);
  scheduler.stop();
});

test('respeta DISABLE_SCHEDULER y no programa tareas', () => {
  process.env.DISABLE_SCHEDULER = 'TrUe';
  const { scheduler, schedule } = loadScheduler(Promise.resolve({}), Promise.resolve({}));
  jest.spyOn(console, 'log').mockImplementation(() => {});

  scheduler.start();

  expect(scheduler.isStarted()).toBe(true);
  expect(schedule).not.toHaveBeenCalled();
  scheduler.stop();
  expect(scheduler.isStarted()).toBe(true);
});
