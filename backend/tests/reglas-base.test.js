/**
 * RQNF-07: reglas puras de la base del backend que no tenian pruebas.
 *  - invitations: tokens de invitacion del personal.
 *  - errors / errorHandler: forma uniforme de las respuestas de error.
 *  - trial: periodo de prueba y bloqueo con 402.
 *  - mensajes: telefono y texto de WhatsApp.
 *  - validators: esquemas Zod de registro, login y recuperacion.
 */
const { generateToken, hashToken } = require('../src/lib/invitations');
const { AppError } = require('../src/lib/errors');
const { notFound, errorHandler } = require('../src/middleware/errorHandler');
const { trialDays, trialStatus, requireActiveTrial, TRIAL_DAYS } = require('../src/lib/trial');
const {
  telefonoWhatsapp, mensajeParaMiembro, enPalabras,
  bienvenidaConQr, avisoVencimiento, avisoVenceHoy,
} = require('../src/lib/mensajes');
const {
  formatZodError, signupSchema, loginSchema, forgotPasswordSchema,
  verifyResetCodeSchema, resetPasswordSchema, registerStaffSchema,
} = require('../src/lib/validators');

// ---------------------------------------------------------------------------
describe('invitations', () => {
  test('generateToken da 32 bytes en base64url (43 caracteres, sin + / =)', () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test('dos tokens nunca se repiten', () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  test('hashToken es sha256 en hexadecimal y siempre da lo mismo para el mismo token', () => {
    const h = hashToken('abc');
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashToken('abc')).toBe(h);
    expect(hashToken('abd')).not.toBe(h);
  });
});

// ---------------------------------------------------------------------------
describe('errorHandler', () => {
  const res = () => {
    const r = { status: jest.fn(() => r), json: jest.fn(() => r) };
    return r;
  };
  const req = { method: 'POST', originalUrl: '/api/x' };
  let consola;
  beforeEach(() => { consola = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { consola.mockRestore(); delete process.env.NODE_ENV; process.env.NODE_ENV = 'test'; });

  test('AppError: usa su status, mensaje y code', () => {
    const r = res();
    errorHandler(new AppError(409, 'Ya existe', 'DUP'), req, r, () => {});
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith({ error: 'Ya existe', code: 'DUP' });
  });

  test('AppError con details los incluye; sin code manda null', () => {
    const r = res();
    errorHandler(new AppError(400, 'Mal', undefined, { campo: 'email' }), req, r, () => {});
    expect(r.json).toHaveBeenCalledWith({ error: 'Mal', code: null, details: { campo: 'email' } });
  });

  test('JSON mal formado: 400 BAD_JSON', () => {
    const r = res();
    errorHandler({ type: 'entity.parse.failed' }, req, r, () => {});
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].code).toBe('BAD_JSON');
  });

  test('cuerpo demasiado grande: 413', () => {
    const r = res();
    errorHandler({ type: 'entity.too.large' }, req, r, () => {});
    expect(r.status).toHaveBeenCalledWith(413);
    expect(r.json.mock.calls[0][0].code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('error inesperado en desarrollo: 500 con el mensaje real', () => {
    process.env.NODE_ENV = 'development';
    const r = res();
    errorHandler(new Error('se rompio la tabla'), req, r, () => {});
    expect(r.status).toHaveBeenCalledWith(500);
    expect(r.json).toHaveBeenCalledWith({ error: 'se rompio la tabla', code: 'INTERNAL_ERROR' });
  });

  test('error inesperado en produccion: 500 generico, sin filtrar el mensaje', () => {
    process.env.NODE_ENV = 'production';
    const r = res();
    errorHandler(new Error('password=secreta en la tabla usuario'), req, r, () => {});
    expect(r.json).toHaveBeenCalledWith({ error: 'Error interno del servidor', code: 'INTERNAL_ERROR' });
  });

  test('lanzar algo que no es Error tambien da 500', () => {
    const r = res();
    errorHandler(undefined, req, r, () => {});
    expect(r.status).toHaveBeenCalledWith(500);
  });

  test('notFound: 404 con el metodo y la ruta', () => {
    const r = res();
    notFound({ method: 'GET', originalUrl: '/api/nada' }, r, () => {});
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.json).toHaveBeenCalledWith({ error: 'Ruta no encontrada: GET /api/nada', code: 'NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
describe('trial', () => {
  const DIA = 24 * 60 * 60 * 1000;

  describe('trialDays', () => {
    const original = process.env.TRIAL_DAYS;
    afterEach(() => { if (original === undefined) delete process.env.TRIAL_DAYS; else process.env.TRIAL_DAYS = original; });

    test.each([
      [undefined, TRIAL_DAYS],
      ['30', 30],
      ['0', TRIAL_DAYS],
      ['-5', TRIAL_DAYS],
      ['abc', TRIAL_DAYS],
    ])('TRIAL_DAYS=%p -> %i dias', (valor, esperado) => {
      if (valor === undefined) delete process.env.TRIAL_DAYS; else process.env.TRIAL_DAYS = valor;
      expect(trialDays()).toBe(esperado);
    });
  });

  describe('trialStatus', () => {
    test('sin gimnasio: vencido', () => {
      expect(trialStatus(null)).toMatchObject({ active: false, expired: true, reason: 'no-gimnasio' });
    });

    test('gimnasio inactivo: vencido', () => {
      expect(trialStatus({ activo: false, trial_ends_at: null })).toMatchObject({ expired: true, reason: 'inactivo' });
    });

    test('trial_ends_at NULL: suscrito, sin limite', () => {
      expect(trialStatus({ activo: true, trial_ends_at: null }))
        .toEqual({ active: true, expired: false, reason: 'suscrito', endsAt: null, daysLeft: null });
    });

    test('vence en 3 dias y medio: quedan 4 (se redondea hacia arriba)', () => {
      const s = trialStatus({ activo: true, trial_ends_at: new Date(Date.now() + 3.5 * DIA) });
      expect(s).toMatchObject({ active: true, expired: false, reason: 'trial-activo', daysLeft: 4 });
    });

    test('vence en una hora: sigue activo con 1 dia', () => {
      const s = trialStatus({ activo: true, trial_ends_at: new Date(Date.now() + 3600 * 1000) });
      expect(s).toMatchObject({ active: true, daysLeft: 1 });
    });

    test('vencio hace un segundo: vencido con 0 dias', () => {
      const s = trialStatus({ activo: true, trial_ends_at: new Date(Date.now() - 1000) });
      expect(s).toMatchObject({ active: false, expired: true, reason: 'trial-vencido', daysLeft: 0 });
    });
  });

  describe('requireActiveTrial', () => {
    const res = () => {
      const r = { status: jest.fn(() => r), json: jest.fn(() => r) };
      return r;
    };
    const poolCon = (rows) => ({ query: jest.fn().mockResolvedValue({ rows }) });

    test('sin usuario: 401', async () => {
      const r = res();
      await requireActiveTrial(poolCon([]))({}, r, jest.fn());
      expect(r.status).toHaveBeenCalledWith(401);
    });

    test('usuario sin gimnasio: 403 y no consulta la base', async () => {
      const pool = poolCon([]);
      const r = res();
      await requireActiveTrial(pool)({ user: { id: 1 } }, r, jest.fn());
      expect(r.status).toHaveBeenCalledWith(403);
      expect(pool.query).not.toHaveBeenCalled();
    });

    test('trial vencido: 402 TRIAL_EXPIRED y no sigue', async () => {
      const r = res();
      const next = jest.fn();
      const pool = poolCon([{ id_gimnasio: 7, activo: true, trial_ends_at: new Date(Date.now() - DIA) }]);
      await requireActiveTrial(pool)({ user: { gymId: 7 } }, r, next);
      expect(r.status).toHaveBeenCalledWith(402);
      expect(r.json.mock.calls[0][0].code).toBe('TRIAL_EXPIRED');
      expect(next).not.toHaveBeenCalled();
    });

    test('trial activo: sigue y deja el estado en req.trial', async () => {
      const req = { user: { gymId: 7 } };
      const next = jest.fn();
      const pool = poolCon([{ id_gimnasio: 7, activo: true, trial_ends_at: new Date(Date.now() + 5 * DIA) }]);
      await requireActiveTrial(pool)(req, res(), next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.trial).toMatchObject({ active: true, gymId: 7 });
      expect(pool.query.mock.calls[0][1]).toEqual([7]);
    });

    test('gimnasio suscrito: pasa', async () => {
      const next = jest.fn();
      await requireActiveTrial(poolCon([{ id_gimnasio: 7, activo: true, trial_ends_at: null }]))({ user: { gymId: 7 } }, res(), next);
      expect(next).toHaveBeenCalled();
    });

    test('gimnasio que no existe: 402', async () => {
      const r = res();
      await requireActiveTrial(poolCon([]))({ user: { gymId: 99 } }, r, jest.fn());
      expect(r.status).toHaveBeenCalledWith(402);
    });

    test('la base falla: 500 y no deja pasar', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const r = res();
      const next = jest.fn();
      const pool = { query: jest.fn().mockRejectedValue(new Error('caida')) };
      await requireActiveTrial(pool)({ user: { gymId: 7 } }, r, next);
      expect(r.status).toHaveBeenCalledWith(500);
      expect(next).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
describe('mensajes', () => {
  describe('telefonoWhatsapp', () => {
    test.each([
      ['3001234567', undefined, '573001234567'],
      ['300 123 4567', null, '573001234567'],
      ['573001234567', undefined, '573001234567'],
      ['3001234567', '52', '523001234567'],
      ['3001234567', 'abc', '573001234567'],
      ['123456', undefined, null],
      ['', undefined, null],
      [null, undefined, null],
    ])('%p con indicativo %p -> %p', (tel, pais, esperado) => {
      expect(telefonoWhatsapp(tel, pais)).toBe(esperado);
    });
  });

  describe('enPalabras', () => {
    test.each([
      [8, 'pasado', 'hace 8 dias'],
      [1, 'pasado', 'hace 1 dia'],
      [0, 'pasado', 'hoy'],
      [3, 'futuro', 'en 3 dias'],
      [1, 'futuro', 'en 1 dia'],
      [0, 'futuro', 'hoy'],
      [31, 'plano', '31 dias'],
      [0, 'plano', '0 dias'],
      [1, 'plano', '1 dia'],
      [null, 'pasado', 'un buen tiempo'],
      [undefined, 'plano', 'un buen tiempo'],
    ])('%p dias, modo %s -> %s', (dias, modo, esperado) => {
      expect(enPalabras(dias, modo)).toBe(esperado);
    });

    test('sin modo usa "pasado"', () => {
      expect(enPalabras(2)).toBe('hace 2 dias');
    });
  });

  describe('mensajeParaMiembro', () => {
    test.each([
      ['acceso-bloqueado', /no pudimos dejarte pasar porque su plan vencio/],
      ['vencida', /Tu plan vencio su plan vencio/],
      ['por-vencer', /tu plan vence su plan vencio/],
      ['riesgo', /llevas su plan vencio sin venir/],
    ])('tipo %s', (tipo, patron) => {
      const m = mensajeParaMiembro(tipo, 'Gym Demo', 'Ana Maria Perez', 'su plan vencio');
      expect(m).toMatch(/^Hola Ana, te saludamos de Gym Demo\./);
      expect(m).toMatch(patron);
    });

    test('un tipo desconocido cae en el mensaje de inactividad', () => {
      expect(mensajeParaMiembro('otro', 'G', 'Ana', '9 dias')).toMatch(/llevas 9 dias sin venir/);
    });

    test('sin nombre no revienta', () => {
      expect(mensajeParaMiembro('riesgo', 'G', null, '9 dias')).toMatch(/^Hola , te saludamos/);
    });
  });

  describe('plantillas del job de vencimiento', () => {
    const base = { nombre: 'Ana', gymNombre: 'Gym Demo', tipoPlan: 'MENSUAL', fechaFin: '2026-10-30' };

    test('bienvenidaConQr usa los dias que faltan', () => {
      expect(bienvenidaConQr({ nombre: 'Ana', gymNombre: 'G', diasParaVencer: 12 })).toMatch(/vigente por 12 dias/);
    });

    test('bienvenidaConQr: sin dias valido usa 30, y nunca negativos', () => {
      expect(bienvenidaConQr({ nombre: 'Ana', gymNombre: 'G' })).toMatch(/por 30 dias/);
      expect(bienvenidaConQr({ nombre: 'Ana', gymNombre: 'G', diasParaVencer: -4 })).toMatch(/por 0 dias/);
    });

    test.each([
      [0, /vence \*hoy\*/],
      [1, /vence \*mañana\*/],
      [5, /vence en \*5 dias\*/],
    ])('avisoVencimiento con %i dias restantes', (d, patron) => {
      const m = avisoVencimiento({ ...base, diasRestantes: d });
      expect(m).toMatch(patron);
      expect(m).toMatch(/Gym Demo/);
      expect(m).toMatch(/MENSUAL/);
      expect(m).toMatch(/2026/);
    });

    test('avisoVencimiento sin fecha ni plan usa textos de respaldo', () => {
      const m = avisoVencimiento({ nombre: 'Ana', gymNombre: 'G', diasRestantes: 2 });
      expect(m).toMatch(/proximamente/);
      expect(m).toMatch(/\*actual\*/);
    });

    test('avisoVenceHoy dice que vence hoy, con la fecha', () => {
      const m = avisoVenceHoy(base);
      expect(m).toMatch(/se vence \*hoy\*/);
      expect(m).toMatch(/octubre/);
    });

    test('avisoVenceHoy sin datos no pone "undefined" ni "null"', () => {
      const m = avisoVenceHoy({});
      expect(m).not.toMatch(/undefined|null/);
    });
  });
});

// ---------------------------------------------------------------------------
describe('validators', () => {
  const signupOk = {
    gymName: 'Gym Demo', gymPhone: '3001234567', ownerName: 'Ana', ownerEmail: 'Ana@Correo.com', password: 'clave123',
  };

  describe('formatZodError', () => {
    test('toma el primer mensaje', () => {
      const r = loginSchema.safeParse({ email: 'malo', password: '' });
      expect(formatZodError(r.error)).toBe(r.error.issues[0].message);
    });

    test.each([[undefined], [null], [{}], [{ issues: [] }]])('sin issues (%p) -> mensaje general', (e) => {
      expect(formatZodError(e)).toBe('Entrada inválida');
    });
  });

  describe('signupSchema', () => {
    test('datos validos: normaliza el correo a minusculas', () => {
      const r = signupSchema.safeParse(signupOk);
      expect(r.success).toBe(true);
      expect(r.data.ownerEmail).toBe('ana@correo.com');
    });

    test('el correo del gimnasio es opcional y la cadena vacia cuenta como ausente', () => {
      expect(signupSchema.safeParse({ ...signupOk, gymEmail: '' }).data.gymEmail).toBeUndefined();
      expect(signupSchema.safeParse({ ...signupOk, gymEmail: 'g@x.co' }).data.gymEmail).toBe('g@x.co');
      expect(signupSchema.safeParse({ ...signupOk, gymEmail: 'sin-arroba' }).success).toBe(false);
    });

    test.each([
      ['gymName', '', 'El nombre del gimnasio es requerido'],
      ['ownerName', '', 'El nombre del propietario es requerido'],
      ['ownerEmail', 'no-es-correo', 'El email no tiene un formato válido'],
      ['gymPhone', '2001234567', 'El teléfono debe tener 10 dígitos colombianos y comenzar con 3'],
      ['gymPhone', '300123456', 'El teléfono debe tener 10 dígitos colombianos y comenzar con 3'],
      ['password', 'abc', 'La contraseña debe tener al menos 6 caracteres, contener al menos un número y no incluir espacios'],
      ['password', 'sinnumero', 'La contraseña debe tener al menos 6 caracteres, contener al menos un número y no incluir espacios'],
      ['password', 'con espacio 1', 'La contraseña debe tener al menos 6 caracteres, contener al menos un número y no incluir espacios'],
    ])('%s=%p se rechaza con su mensaje', (campo, valor, mensaje) => {
      const r = signupSchema.safeParse({ ...signupOk, [campo]: valor });
      expect(r.success).toBe(false);
      expect(formatZodError(r.error)).toBe(mensaje);
    });

    test('contraseña de exactamente 6 con un numero: pasa (limite)', () => {
      expect(signupSchema.safeParse({ ...signupOk, password: 'abcde1' }).success).toBe(true);
      expect(signupSchema.safeParse({ ...signupOk, password: 'abcd1' }).success).toBe(false);
    });

    test('campos que faltan: mensaje de requerido', () => {
      const r = signupSchema.safeParse({});
      expect(r.success).toBe(false);
      expect(formatZodError(r.error)).toBe('El nombre del gimnasio es requerido');
    });
  });

  describe('loginSchema', () => {
    test('valido', () => {
      expect(loginSchema.safeParse({ email: 'A@b.co', password: 'x' }).data).toEqual({ email: 'a@b.co', password: 'x' });
    });
    test('sin contraseña', () => {
      expect(formatZodError(loginSchema.safeParse({ email: 'a@b.co' }).error)).toBe('La contraseña es requerida');
    });
  });

  describe('registerStaffSchema', () => {
    test('gymId llega como texto y se convierte a numero; es opcional', () => {
      const base = { name: 'Rec', email: 'r@x.co', password: 'clave123' };
      expect(registerStaffSchema.safeParse({ ...base, gymId: '7' }).data.gymId).toBe(7);
      expect(registerStaffSchema.safeParse(base).success).toBe(true);
      expect(registerStaffSchema.safeParse({ ...base, gymId: '-1' }).success).toBe(false);
    });
  });

  describe('forgotPasswordSchema y verifyResetCodeSchema', () => {
    test('forgot pide un correo valido', () => {
      expect(forgotPasswordSchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
      expect(forgotPasswordSchema.safeParse({ email: 'a' }).success).toBe(false);
    });

    test.each([
      ['123456', true],
      ['12345', false],
      ['1234567', false],
      ['12a456', false],
    ])('codigo %p -> %p', (code, ok) => {
      const r = verifyResetCodeSchema.safeParse({ email: 'a@b.co', code });
      expect(r.success).toBe(ok);
      if (!ok) expect(formatZodError(r.error)).toBe('Código inválido. Debe tener 6 dígitos.');
    });
  });

  describe('resetPasswordSchema', () => {
    test('con resetToken basta', () => {
      expect(resetPasswordSchema.safeParse({ resetToken: 't', password: 'clave123' }).success).toBe(true);
    });
    test('con email y codigo basta', () => {
      expect(resetPasswordSchema.safeParse({ email: 'a@b.co', code: '123456', password: 'clave123' }).success).toBe(true);
    });
    test('solo email, sin codigo ni token: se rechaza', () => {
      const r = resetPasswordSchema.safeParse({ email: 'a@b.co', password: 'clave123' });
      expect(r.success).toBe(false);
      expect(formatZodError(r.error)).toBe('Email y código, o resetToken, son requeridos');
    });
    test('la contraseña nueva sigue la politica', () => {
      expect(resetPasswordSchema.safeParse({ resetToken: 't', password: 'corta' }).success).toBe(false);
    });
  });
});
