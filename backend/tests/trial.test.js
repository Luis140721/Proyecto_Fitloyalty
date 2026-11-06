const { requireActiveTrial, trialDays, trialStatus, TRIAL_DAYS } = require('../src/lib/trial');

describe('trialDays', () => {
  afterEach(() => {
    delete process.env.TRIAL_DAYS;
  });

  test('usa el valor positivo configurado y cae al valor por defecto si es inválido', () => {
    process.env.TRIAL_DAYS = '21';
    expect(trialDays()).toBe(21);

    process.env.TRIAL_DAYS = '0';
    expect(trialDays()).toBe(TRIAL_DAYS);

    process.env.TRIAL_DAYS = 'invalido';
    expect(trialDays()).toBe(TRIAL_DAYS);
  });
});

describe('trialStatus', () => {
  test('bloquea un gimnasio inexistente o inactivo', () => {
    expect(trialStatus(null)).toMatchObject({ active: false, expired: true, reason: 'no-gimnasio' });
    expect(trialStatus({ activo: false })).toMatchObject({ active: false, expired: true, reason: 'inactivo' });
  });

  test('permite gimnasio suscrito sin fecha de fin de prueba', () => {
    expect(trialStatus({ activo: true, trial_ends_at: null })).toMatchObject({
      active: true,
      expired: false,
      reason: 'suscrito',
      endsAt: null,
      daysLeft: null,
    });
  });

  test('distingue prueba activa de prueba vencida', () => {
    const active = trialStatus({ activo: true, trial_ends_at: new Date(Date.now() + 86400000) });
    const expired = trialStatus({ activo: true, trial_ends_at: new Date(Date.now() - 86400000) });

    expect(active).toMatchObject({ active: true, expired: false, reason: 'trial-activo', daysLeft: 1 });
    expect(expired).toMatchObject({ active: false, expired: true, reason: 'trial-vencido', daysLeft: 0 });
  });
});

describe('requireActiveTrial', () => {
  const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  });

  test('rechaza usuario sin sesión o sin gimnasio', async () => {
    const query = jest.fn();
    const middleware = requireActiveTrial({ query });
    const res = response();

    await middleware({}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(query).not.toHaveBeenCalled();

    res.status.mockClear();
    await middleware({ user: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(query).not.toHaveBeenCalled();
  });

  test('rechaza gimnasio con trial vencido y permite uno activo', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ activo: true, trial_ends_at: new Date(Date.now() - 86400000) }] })
      .mockResolvedValueOnce({ rows: [{ activo: true, trial_ends_at: new Date(Date.now() + 86400000) }] });
    const middleware = requireActiveTrial({ query });
    const req = { user: { gymId: 7 } };
    const res = response();
    const next = jest.fn();

    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TRIAL_EXPIRED' }));

    res.status.mockClear();
    res.json.mockClear();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.trial).toMatchObject({ active: true, gymId: 7 });
  });

  test('responde con error explícito si falla la consulta', async () => {
    const middleware = requireActiveTrial({
      query: jest.fn().mockRejectedValue(new Error('database unavailable')),
    });
    const res = response();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await middleware({ user: { gymId: 7 } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Error al verificar el estado del trial' });
  });
});
