-- BEGIN;

-- =========================================================
-- SEED DATA - Orden respetando Foreign Keys
-- =========================================================

-- =========================================================
-- 1. gimnasio (3 gimnasios base)
-- =========================================================
INSERT INTO gimnasio (nombre, nit, direccion, telefono, email, logo_url, activo) VALUES
('FitZone Bogotá',       '900123456-1', 'Cra 15 # 93-47, Bogotá',        '6017001001', 'contacto@fitzone.co',        'https://cdn.fitzone.co/logo.png',        TRUE),
('PowerGym Medellín',    '800234567-2', 'Calle 10 # 43E-31, Medellín',   '6044002002', 'info@powergym.co',           'https://cdn.powergym.co/logo.png',       TRUE),
('IronBody Cali',        '700345678-3', 'Av 6N # 25-30, Cali',           '6023003003', 'hola@ironbody.co',           'https://cdn.ironbody.co/logo.png',       TRUE);

-- =========================================================
-- 2. usuario (10 usuarios: admins y recepcionistas)
-- =========================================================
INSERT INTO usuario (id_gimnasio, nombre, email, password_hash, rol, activo, debe_cambiar_clave) VALUES
(1, 'Carlos Mendoza',    'carlos.mendoza@fitzone.co',      '$2b$12$KIX1abc001', 'ADMINISTRADOR',  TRUE,  FALSE),
(1, 'Laura Ríos',        'laura.rios@fitzone.co',          '$2b$12$KIX1abc002', 'RECEPCIONISTA',  TRUE,  FALSE),
(1, 'Andrés Gómez',      'andres.gomez@fitzone.co',        '$2b$12$KIX1abc003', 'RECEPCIONISTA',  TRUE,  FALSE),
(2, 'Patricia Suárez',   'patricia.suarez@powergym.co',    '$2b$12$KIX2abc004', 'ADMINISTRADOR',  TRUE,  FALSE),
(2, 'Jorge Herrera',     'jorge.herrera@powergym.co',      '$2b$12$KIX2abc005', 'RECEPCIONISTA',  TRUE,  FALSE),
(2, 'Valentina Torres',  'valentina.torres@powergym.co',   '$2b$12$KIX2abc006', 'RECEPCIONISTA',  FALSE, TRUE),
(3, 'Miguel Ospina',     'miguel.ospina@ironbody.co',      '$2b$12$KIX3abc007', 'ADMINISTRADOR',  TRUE,  FALSE),
(3, 'Sandra Patiño',     'sandra.patino@ironbody.co',      '$2b$12$KIX3abc008', 'RECEPCIONISTA',  TRUE,  FALSE),
(3, 'Diego Castaño',     'diego.castano@ironbody.co',      '$2b$12$KIX3abc009', 'RECEPCIONISTA',  TRUE,  FALSE),
(1, 'Isabel Vargas',     'isabel.vargas@fitzone.co',       '$2b$12$KIX1abc010', 'RECEPCIONISTA',  TRUE,  FALSE);

-- =========================================================
-- 3. sesion (15 sesiones)
-- =========================================================
INSERT INTO sesion (id_usuario, token, ip, dispositivo, fecha_inicio, fecha_ultima_actividad, fecha_cierre, estado) VALUES
(1, 'tok_abc001', '192.168.1.10', 'Chrome/Windows',  NOW() - INTERVAL '2 days',  NOW() - INTERVAL '2 days',  NOW() - INTERVAL '2 days',  'CERRADA'),
(2, 'tok_abc002', '192.168.1.11', 'Firefox/Windows', NOW() - INTERVAL '1 day',   NOW() - INTERVAL '1 day',   NOW() - INTERVAL '1 day',   'CERRADA'),
(3, 'tok_abc003', '192.168.1.12', 'Safari/macOS',    NOW() - INTERVAL '3 hours', NOW() - INTERVAL '1 hour',  NULL,                        'ACTIVA'),
(4, 'tok_abc004', '10.0.0.5',     'Chrome/Android',  NOW() - INTERVAL '5 days',  NOW() - INTERVAL '5 days',  NOW() - INTERVAL '5 days',  'CERRADA'),
(5, 'tok_abc005', '10.0.0.6',     'Edge/Windows',    NOW() - INTERVAL '2 hours', NOW() - INTERVAL '30 min',  NULL,                        'ACTIVA'),
(6, 'tok_abc006', '10.0.0.7',     'Chrome/iOS',      NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days', 'EXPIRADA'),
(7, 'tok_abc007', '172.16.0.1',   'Firefox/Linux',   NOW() - INTERVAL '1 hour',  NOW() - INTERVAL '10 min',  NULL,                        'ACTIVA'),
(8, 'tok_abc008', '172.16.0.2',   'Chrome/Windows',  NOW() - INTERVAL '4 hours', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours', 'CERRADA'),
(9, 'tok_abc009', '172.16.0.3',   'Safari/iPhone',   NOW() - INTERVAL '6 days',  NOW() - INTERVAL '6 days',  NOW() - INTERVAL '6 days',  'EXPIRADA'),
(1, 'tok_abc010', '192.168.1.10', 'Chrome/Windows',  NOW() - INTERVAL '30 min',  NOW() - INTERVAL '5 min',   NULL,                        'ACTIVA'),
(4, 'tok_abc011', '10.0.0.5',     'Firefox/macOS',   NOW() - INTERVAL '1 day',   NOW() - INTERVAL '1 day',   NOW() - INTERVAL '1 day',   'CERRADA'),
(7, 'tok_abc012', '172.16.0.1',   'Edge/Windows',    NOW() - INTERVAL '3 days',  NOW() - INTERVAL '3 days',  NOW() - INTERVAL '3 days',  'CERRADA'),
(2, 'tok_abc013', '192.168.1.11', 'Chrome/Android',  NOW() - INTERVAL '12 hours',NOW() - INTERVAL '8 hours', NOW() - INTERVAL '8 hours', 'CERRADA'),
(10,'tok_abc014', '192.168.1.20', 'Firefox/Windows', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour',  NULL,                        'ACTIVA'),
(5, 'tok_abc015', '10.0.0.6',     'Safari/macOS',    NOW() - INTERVAL '7 days',  NOW() - INTERVAL '7 days',  NOW() - INTERVAL '7 days',  'EXPIRADA');

-- =========================================================
-- 4. miembro (30 miembros distribuidos en los 3 gimnasios)
-- =========================================================
INSERT INTO miembro (id_gimnasio, nombre, documento, telefono, email, codigo_qr, activo) VALUES
-- FitZone (gimnasio 1) - 12 miembros
(1, 'Juan Pablo Ruiz',      '1020304050', '3101001001', 'juanp.ruiz@gmail.com',      'QR-FZ-001', TRUE),
(1, 'María Camila Pérez',   '1020304051', '3101001002', 'mcamila.perez@gmail.com',   'QR-FZ-002', TRUE),
(1, 'Sebastián Castro',     '1020304052', '3101001003', 'sebas.castro@hotmail.com',  'QR-FZ-003', TRUE),
(1, 'Daniela Mora',         '1020304053', '3101001004', 'dani.mora@gmail.com',       'QR-FZ-004', TRUE),
(1, 'Felipe Arango',        '1020304054', '3101001005', 'felipe.arango@yahoo.com',   'QR-FZ-005', TRUE),
(1, 'Natalia Rodríguez',    '1020304055', '3101001006', 'nata.rodriguez@gmail.com',  'QR-FZ-006', TRUE),
(1, 'Camilo Jiménez',       '1020304056', '3101001007', 'camilo.jimenez@gmail.com',  'QR-FZ-007', TRUE),
(1, 'Luisa Fernanda Gil',   '1020304057', '3101001008', 'luisafgil@outlook.com',     'QR-FZ-008', TRUE),
(1, 'Andrés Felipe Díaz',   '1020304058', '3101001009', 'afelipe.diaz@gmail.com',    'QR-FZ-009', FALSE),
(1, 'Paula Andrea Niño',    '1020304059', '3101001010', 'paula.nino@gmail.com',      'QR-FZ-010', TRUE),
(1, 'Ricardo Sánchez',      '1020304060', '3101001011', 'ricardo.sanchez@gmail.com', 'QR-FZ-011', TRUE),
(1, 'Valeria Salcedo',      '1020304061', '3101001012', 'vale.salcedo@gmail.com',    'QR-FZ-012', TRUE),
-- PowerGym (gimnasio 2) - 10 miembros
(2, 'Alejandro Betancur',   '1030405060', '3202002001', 'ale.betancur@gmail.com',    'QR-PG-001', TRUE),
(2, 'Catalina Vélez',       '1030405061', '3202002002', 'cata.velez@gmail.com',      'QR-PG-002', TRUE),
(2, 'Mateo Montoya',        '1030405062', '3202002003', 'mateo.montoya@hotmail.com', 'QR-PG-003', TRUE),
(2, 'Juliana Restrepo',     '1030405063', '3202002004', 'juli.restrepo@gmail.com',   'QR-PG-004', TRUE),
(2, 'Santiago Aguirre',     '1030405064', '3202002005', 'santi.aguirre@gmail.com',   'QR-PG-005', FALSE),
(2, 'Manuela Cano',         '1030405065', '3202002006', 'manu.cano@outlook.com',     'QR-PG-006', TRUE),
(2, 'Simón Londoño',        '1030405066', '3202002007', 'simon.londono@gmail.com',   'QR-PG-007', TRUE),
(2, 'Gabriela Zapata',      '1030405067', '3202002008', 'gaby.zapata@gmail.com',     'QR-PG-008', TRUE),
(2, 'David Escobar',        '1030405068', '3202002009', 'david.escobar@yahoo.com',   'QR-PG-009', TRUE),
(2, 'Isabela Muñoz',        '1030405069', '3202002010', 'isa.munoz@gmail.com',       'QR-PG-010', TRUE),
-- IronBody (gimnasio 3) - 8 miembros
(3, 'Nicolás Palacios',     '1040506070', '3153003001', 'nico.palacios@gmail.com',   'QR-IB-001', TRUE),
(3, 'Sofía Lozano',         '1040506071', '3153003002', 'sofia.lozano@gmail.com',    'QR-IB-002', TRUE),
(3, 'Emanuel Giraldo',      '1040506072', '3153003003', 'ema.giraldo@hotmail.com',   'QR-IB-003', TRUE),
(3, 'Mariana Córdoba',      '1040506073', '3153003004', 'mari.cordoba@gmail.com',    'QR-IB-004', TRUE),
(3, 'Tomás Valencia',       '1040506074', '3153003005', 'tomas.valencia@gmail.com',  'QR-IB-005', TRUE),
(3, 'Lucía Pedraza',        '1040506075', '3153003006', 'lucia.pedraza@gmail.com',   'QR-IB-006', FALSE),
(3, 'Esteban Quintero',     '1040506076', '3153003007', 'esteban.quintero@gmail.com','QR-IB-007', TRUE),
(3, 'Tatiana Ocampo',       '1040506077', '3153003008', 'tatiana.ocampo@outlook.com','QR-IB-008', TRUE);

-- =========================================================
-- 5. plan_membresia (12 planes)
-- =========================================================
INSERT INTO plan_membresia (id_gimnasio, nombre, descripcion, duracion_dias, precio, activo) VALUES
(1, 'Mensual Básico',      'Acceso ilimitado por 1 mes',               30,  80000.00, TRUE),
(1, 'Mensual Premium',     'Acceso + clases grupales 1 mes',           30, 120000.00, TRUE),
(1, 'Trimestral',          'Acceso ilimitado por 3 meses',             90, 210000.00, TRUE),
(1, 'Semestral',           'Acceso ilimitado por 6 meses',            180, 380000.00, TRUE),
(2, 'Mensual Básico',      'Acceso ilimitado por 1 mes',               30,  75000.00, TRUE),
(2, 'Mensual Premium',     'Acceso + nutricionista 1 mes',             30, 130000.00, TRUE),
(2, 'Trimestral',          'Acceso ilimitado por 3 meses',             90, 200000.00, TRUE),
(2, 'Anual',               'Acceso ilimitado por 1 año',              365, 700000.00, TRUE),
(3, 'Mensual Básico',      'Acceso ilimitado por 1 mes',               30,  70000.00, TRUE),
(3, 'Mensual Premium',     'Acceso + personal trainer 1 mes',          30, 150000.00, TRUE),
(3, 'Trimestral',          'Acceso ilimitado por 3 meses',             90, 190000.00, TRUE),
(3, 'Semestral',           'Acceso ilimitado por 6 meses',            180, 350000.00, FALSE);

-- =========================================================
-- 6. membresia (30 membresías)
-- =========================================================
INSERT INTO membresia (id_miembro, id_plan, fecha_inicio, fecha_fin, estado, fecha_pago, estado_pago, observaciones) VALUES
-- FitZone miembros 1-12
( 1, 1, '2025-06-01', '2025-06-30', 'VENCIDA',   '2025-06-01', 'PAGADO',   NULL),
( 1, 2, '2025-07-01', '2025-07-31', 'VENCIDA',   '2025-07-01', 'PAGADO',   NULL),
( 1, 1, '2026-05-01', '2026-05-31', 'ACTIVA',    '2026-05-01', 'PAGADO',   NULL),
( 2, 3, '2026-03-01', '2026-05-29', 'VENCIDA',   '2026-03-01', 'PAGADO',   NULL),
( 2, 1, '2026-06-01', '2026-06-30', 'ACTIVA',    '2026-06-01', 'PAGADO',   NULL),
( 3, 4, '2026-01-01', '2026-06-29', 'VENCIDA',   '2026-01-01', 'PAGADO',   NULL),
( 4, 1, '2026-05-15', '2026-06-14', 'ACTIVA',    '2026-05-15', 'PAGADO',   NULL),
( 5, 2, '2026-04-01', '2026-04-30', 'VENCIDA',   '2026-04-01', 'PAGADO',   NULL),
( 5, 2, '2026-06-01', '2026-06-30', 'ACTIVA',    '2026-06-01', 'PAGADO',   NULL),
( 6, 3, '2026-04-01', '2026-06-30', 'ACTIVA',    '2026-04-01', 'PAGADO',   NULL),
( 7, 1, '2026-06-01', '2026-06-30', 'ACTIVA',    '2026-06-01', 'PAGADO',   NULL),
( 8, 2, '2026-05-01', '2026-05-31', 'VENCIDA',   '2026-05-01', 'PAGADO',   NULL),
( 9, 1, '2026-03-01', '2026-03-31', 'VENCIDA',   '2026-03-01', 'PAGADO',   'Miembro inactivo'),
(10, 1, '2026-06-01', '2026-06-30', 'ACTIVA',    '2026-06-01', 'PAGADO',   NULL),
(11, 3, '2026-04-01', '2026-06-30', 'ACTIVA',    '2026-04-01', 'PAGADO',   NULL),
(12, 2, '2026-06-01', '2026-06-30', 'ACTIVA',    '2026-06-01', 'PENDIENTE','Pago pendiente'),
-- PowerGym miembros 13-22
(13, 5, '2026-05-01', '2026-05-31', 'VENCIDA',   '2026-05-01', 'PAGADO',   NULL),
(13, 6, '2026-06-01', '2026-06-30', 'ACTIVA',    '2026-06-01', 'PAGADO',   NULL),
(14, 7, '2026-04-01', '2026-06-30', 'ACTIVA',    '2026-04-01', 'PAGADO',   NULL),
(15, 5, '2026-06-01', '2026-06-30', 'ACTIVA',    '2026-06-01', 'PAGADO',   NULL),
(16, 8, '2026-01-01', '2026-12-31', 'ACTIVA',    '2026-01-01', 'PAGADO',   NULL),
(17, 5, '2026-02-01', '2026-02-28', 'VENCIDA',   '2026-02-01', 'PAGADO',   'Miembro inactivo'),
(18, 6, '2026-05-15', '2026-06-14', 'ACTIVA',    '2026-05-15', 'PAGADO',   NULL),
(19, 7, '2026-03-01', '2026-05-31', 'VENCIDA',   '2026-03-01', 'PAGADO',   NULL),
(20, 5, '2026-06-01', '2026-06-30', 'CONGELADA', '2026-06-01', 'PAGADO',   'Viaje al exterior'),
(21, 6, '2026-06-01', '2026-06-30', 'ACTIVA',    '2026-06-01', 'PAGADO',   NULL),
-- IronBody miembros 23-30
(22, 8, '2025-06-01', '2026-05-31', 'VENCIDA',   '2025-06-01', 'PAGADO',   NULL),
(23, 9, '2026-06-01', '2026-06-30', 'ACTIVA',    '2026-06-01', 'PAGADO',   NULL),
(24,10, '2026-05-15', '2026-06-14', 'ACTIVA',    '2026-05-15', 'PAGADO',   NULL),
(25,11, '2026-04-01', '2026-06-30', 'ACTIVA',    '2026-04-01', 'PAGADO',   NULL),
(26, 9, '2026-01-01', '2026-01-31', 'VENCIDA',   '2026-01-01', 'PAGADO',   'No renovó'),
(27,10, '2026-06-01', '2026-06-30', 'ACTIVA',    '2026-06-01', 'PAGADO',   NULL),
(28, 9, '2026-05-01', '2026-05-31', 'VENCIDA',   '2026-05-01', 'PAGADO',   NULL),
(29,11, '2026-03-01', '2026-05-31', 'VENCIDA',   '2026-03-01', 'PAGADO',   NULL),
(30, 9, '2026-06-01', '2026-06-30', 'ACTIVA',    '2026-06-01', 'PENDIENTE','Nuevo ingreso');

-- =========================================================
-- 7. pago (35 pagos)
-- =========================================================
INSERT INTO pago (id_membresia, monto, metodo_pago, referencia_pago, fecha_pago, estado, registrado_por) VALUES
( 1,  80000.00, 'EFECTIVO',      NULL,           '2025-06-01 09:00:00', 'PAGADO',   2),
( 2, 120000.00, 'TARJETA',       'TXN-20250701', '2025-07-01 10:15:00', 'PAGADO',   2),
( 3,  80000.00, 'TRANSFERENCIA', 'REF-20260501', '2026-05-01 08:30:00', 'PAGADO',   2),
( 4, 210000.00, 'EFECTIVO',      NULL,           '2026-03-01 09:45:00', 'PAGADO',   2),
( 5,  80000.00, 'TARJETA',       'TXN-20260601', '2026-06-01 10:00:00', 'PAGADO',   3),
( 6, 380000.00, 'TRANSFERENCIA', 'REF-20260101', '2026-01-01 11:00:00', 'PAGADO',   3),
( 7,  80000.00, 'EFECTIVO',      NULL,           '2026-05-15 09:30:00', 'PAGADO',   2),
( 8, 120000.00, 'TARJETA',       'TXN-20260401', '2026-04-01 10:00:00', 'PAGADO',   3),
( 9, 120000.00, 'TARJETA',       'TXN-20260601B','2026-06-01 09:00:00', 'PAGADO',   3),
(10, 210000.00, 'TRANSFERENCIA', 'REF-20260401', '2026-04-01 08:00:00', 'PAGADO',   2),
(11,  80000.00, 'EFECTIVO',      NULL,           '2026-06-01 10:30:00', 'PAGADO',   2),
(12, 120000.00, 'TARJETA',       'TXN-20260501', '2026-05-01 09:15:00', 'PAGADO',   3),
(13,  80000.00, 'EFECTIVO',      NULL,           '2026-03-01 11:00:00', 'PAGADO',   3),
(14,  80000.00, 'TRANSFERENCIA', 'REF-20260601', '2026-06-01 09:00:00', 'PAGADO',   2),
(15, 210000.00, 'TARJETA',       'TXN-20260401B','2026-04-01 10:00:00', 'PAGADO',   2),
(17,  75000.00, 'EFECTIVO',      NULL,           '2026-05-01 08:45:00', 'PAGADO',   5),
(18, 130000.00, 'TARJETA',       'TXN-20260601C','2026-06-01 10:00:00', 'PAGADO',   5),
(19, 200000.00, 'TRANSFERENCIA', 'REF-20260401B','2026-04-01 09:00:00', 'PAGADO',   5),
(20,  75000.00, 'EFECTIVO',      NULL,           '2026-06-01 11:00:00', 'PAGADO',   5),
(21, 700000.00, 'TRANSFERENCIA', 'REF-20260101B','2026-01-01 10:00:00', 'PAGADO',   5),
(22,  75000.00, 'EFECTIVO',      NULL,           '2026-02-01 09:00:00', 'PAGADO',   5),
(23, 130000.00, 'TARJETA',       'TXN-20260515', '2026-05-15 09:30:00', 'PAGADO',   5),
(24, 200000.00, 'TARJETA',       'TXN-20260301', '2026-03-01 10:00:00', 'PAGADO',   5),
(25,  75000.00, 'EFECTIVO',      NULL,           '2026-06-01 09:00:00', 'PAGADO',   5),
(26, 130000.00, 'TRANSFERENCIA', 'REF-20260601B','2026-06-01 11:00:00', 'PAGADO',   5),
(27, 700000.00, 'TARJETA',       'TXN-20250601', '2025-06-01 09:00:00', 'PAGADO',   8),
(28,  70000.00, 'EFECTIVO',      NULL,           '2026-06-01 08:30:00', 'PAGADO',   8),
(29, 150000.00, 'TARJETA',       'TXN-20260515B','2026-05-15 10:00:00', 'PAGADO',   8),
(30, 190000.00, 'TRANSFERENCIA', 'REF-20260401C','2026-04-01 09:30:00', 'PAGADO',   8),
(31,  70000.00, 'EFECTIVO',      NULL,           '2026-01-01 11:00:00', 'PAGADO',   9),
(32, 150000.00, 'TARJETA',       'TXN-20260601D','2026-06-01 10:00:00', 'PAGADO',   8),
(33,  70000.00, 'EFECTIVO',      NULL,           '2026-05-01 09:00:00', 'PAGADO',   9),
(34, 190000.00, 'TARJETA',       'TXN-20260301B','2026-03-01 10:30:00', 'PAGADO',   9),
(35,  70000.00, 'EFECTIVO',      NULL,           '2026-06-01 08:00:00', 'PENDIENTE', 8);

-- =========================================================
-- 8. congelacion_membresia (5 congelaciones)
-- =========================================================
INSERT INTO congelacion_membresia (id_membresia, fecha_inicio, fecha_fin, motivo, estado, registrado_por) VALUES
(25, '2026-06-03', '2026-06-17', 'Viaje al exterior',           'ACTIVA',     5),
( 6, '2026-03-10', '2026-03-20', 'Lesión rodilla',              'FINALIZADA', 3),
(10, '2026-05-05', '2026-05-12', 'Enfermedad',                  'FINALIZADA', 2),
(21, '2026-06-05', NULL,         'Proceso médico en curso',     'ACTIVA',     5),
(15, '2026-04-15', '2026-04-22', 'Viaje de trabajo',            'FINALIZADA', 2);

-- =========================================================
-- 9. checkin (50 check-ins)
-- =========================================================
INSERT INTO checkin (id_miembro, id_gimnasio, fecha_hora, metodo, id_usuario, valido) VALUES
( 1, 1, NOW() - INTERVAL '1 day 8 hours',   'QR',          2,  TRUE),
( 2, 1, NOW() - INTERVAL '1 day 9 hours',   'QR',          2,  TRUE),
( 3, 1, NOW() - INTERVAL '1 day 9 hours 30 min', 'MANUAL', 3,  TRUE),
( 4, 1, NOW() - INTERVAL '2 days 8 hours',  'QR',          2,  TRUE),
( 5, 1, NOW() - INTERVAL '2 days 10 hours', 'CODIGOBARRAS',3,  TRUE),
( 6, 1, NOW() - INTERVAL '3 days 7 hours',  'QR',          2,  TRUE),
( 7, 1, NOW() - INTERVAL '3 days 9 hours',  'QR',          3,  TRUE),
(10, 1, NOW() - INTERVAL '1 day 7 hours',   'QR',          2,  TRUE),
(11, 1, NOW() - INTERVAL '1 day 18 hours',  'QR',          3,  TRUE),
(12, 1, NOW() - INTERVAL '2 days 7 hours',  'QR',          2,  TRUE),
( 1, 1, NOW() - INTERVAL '3 days 8 hours',  'QR',          2,  TRUE),
( 2, 1, NOW() - INTERVAL '4 days 9 hours',  'QR',          3,  TRUE),
( 5, 1, NOW() - INTERVAL '4 days 10 hours', 'QR',          2,  TRUE),
( 6, 1, NOW() - INTERVAL '5 days 8 hours',  'QR',          2,  TRUE),
( 7, 1, NOW() - INTERVAL '5 days 9 hours',  'QR',          3,  TRUE),
( 1, 1, NOW() - INTERVAL '6 days 7 hours',  'MANUAL',      2,  TRUE),
(10, 1, NOW() - INTERVAL '6 days 8 hours',  'QR',          2,  TRUE),
(11, 1, NOW() - INTERVAL '7 days 17 hours', 'QR',          3,  TRUE),
(13, 2, NOW() - INTERVAL '1 day 8 hours',   'QR',          5,  TRUE),
(14, 2, NOW() - INTERVAL '1 day 9 hours',   'QR',          5,  TRUE),
(15, 2, NOW() - INTERVAL '1 day 9 hours 30 min','MANUAL',  5,  TRUE),
(16, 2, NOW() - INTERVAL '2 days 8 hours',  'QR',          5,  TRUE),
(18, 2, NOW() - INTERVAL '2 days 10 hours', 'QR',          5,  TRUE),
(20, 2, NOW() - INTERVAL '3 days 7 hours',  'CODIGOBARRAS',5,  TRUE),
(21, 2, NOW() - INTERVAL '3 days 9 hours',  'QR',          5,  TRUE),
(13, 2, NOW() - INTERVAL '4 days 8 hours',  'QR',          5,  TRUE),
(14, 2, NOW() - INTERVAL '4 days 9 hours',  'QR',          5,  TRUE),
(15, 2, NOW() - INTERVAL '5 days 8 hours',  'MANUAL',      5,  TRUE),
(18, 2, NOW() - INTERVAL '5 days 10 hours', 'QR',          5,  TRUE),
(20, 2, NOW() - INTERVAL '6 days 9 hours',  'QR',          5,  TRUE),
(21, 2, NOW() - INTERVAL '6 days 8 hours',  'QR',          5,  TRUE),
(13, 2, NOW() - INTERVAL '7 days 8 hours',  'QR',          5,  TRUE),
(23, 3, NOW() - INTERVAL '1 day 7 hours',   'QR',          8,  TRUE),
(24, 3, NOW() - INTERVAL '1 day 8 hours',   'QR',          8,  TRUE),
(25, 3, NOW() - INTERVAL '2 days 7 hours',  'CODIGOBARRAS',9,  TRUE),
(27, 3, NOW() - INTERVAL '2 days 9 hours',  'QR',          8,  TRUE),
(30, 3, NOW() - INTERVAL '1 day 10 hours',  'MANUAL',      9,  TRUE),
(23, 3, NOW() - INTERVAL '3 days 7 hours',  'QR',          8,  TRUE),
(24, 3, NOW() - INTERVAL '3 days 8 hours',  'QR',          9,  TRUE),
(25, 3, NOW() - INTERVAL '4 days 7 hours',  'QR',          8,  TRUE),
(27, 3, NOW() - INTERVAL '4 days 9 hours',  'QR',          8,  TRUE),
(30, 3, NOW() - INTERVAL '3 days 8 hours',  'QR',          9,  TRUE),
(23, 3, NOW() - INTERVAL '5 days 7 hours',  'QR',          8,  TRUE),
(24, 3, NOW() - INTERVAL '5 days 8 hours',  'QR',          9,  TRUE),
(27, 3, NOW() - INTERVAL '6 days 9 hours',  'QR',          8,  TRUE),
(30, 3, NOW() - INTERVAL '6 days 7 hours',  'QR',          9,  TRUE),
( 4, 1, NOW() - INTERVAL '1 day 8 hours 30 min', 'QR',     2,  TRUE),
(12, 1, NOW() - INTERVAL '3 days 8 hours',  'QR',          3,  TRUE),
(16, 2, NOW() - INTERVAL '7 days 8 hours',  'QR',          5,  FALSE),
(29, 3, NOW() - INTERVAL '7 days 9 hours',  'MANUAL',      8,  TRUE);

-- =========================================================
-- 10. configuracion_gimnasio (3 configuraciones)
-- =========================================================
INSERT INTO configuracion_gimnasio (id_gimnasio, umbral_alerta_amarilla, umbral_alerta_roja, dias_aviso_vencimiento, horario_apertura, horario_cierre, canal_principal, tiempo_inactividad_sesion_min, actualizado_por) VALUES
(1, 7,  14, 5, '05:30:00', '22:00:00', 'EMAIL',    30, 1),
(2, 10, 20, 7, '06:00:00', '23:00:00', 'WHATSAPP', 60, 4),
(3, 7,  15, 7, '05:00:00', '21:30:00', 'EMAIL',    45, 7);

-- =========================================================
-- 11. alerta_abandono (15 alertas)
-- =========================================================
INSERT INTO alerta_abandono (id_miembro, id_gimnasio, dias_inactivo, nivel, estado, fecha_gestion, id_usuario) VALUES
( 8, 1, 10, 'AMARILLA', 'GESTIONADA', NOW() - INTERVAL '2 days', 2),
( 9, 1, 18, 'ROJA',     'GESTIONADA', NOW() - INTERVAL '5 days', 1),
(17, 2, 12, 'AMARILLA', 'PENDIENTE',  NULL,                       NULL),
(17, 2, 25, 'ROJA',     'PENDIENTE',  NULL,                       NULL),
(19, 2,  8, 'AMARILLA', 'GESTIONADA', NOW() - INTERVAL '3 days', 4),
(22, 2, 15, 'ROJA',     'IGNORADA',   NOW() - INTERVAL '10 days',4),
(26, 3, 20, 'ROJA',     'PENDIENTE',  NULL,                       NULL),
(28, 3,  9, 'AMARILLA', 'GESTIONADA', NOW() - INTERVAL '1 day',  7),
( 3, 1,  7, 'AMARILLA', 'PENDIENTE',  NULL,                       NULL),
(12, 1,  8, 'AMARILLA', 'PENDIENTE',  NULL,                       NULL),
(21, 2, 11, 'AMARILLA', 'GESTIONADA', NOW() - INTERVAL '4 days', 5),
(29, 3, 13, 'AMARILLA', 'PENDIENTE',  NULL,                       NULL),
( 5, 1,  8, 'AMARILLA', 'IGNORADA',   NOW() - INTERVAL '8 days', 2),
(16, 2, 30, 'ROJA',     'GESTIONADA', NOW() - INTERVAL '2 days', 4),
(25, 3, 16, 'ROJA',     'PENDIENTE',  NULL,                       NULL);

-- =========================================================
-- 12. canal_comunicacion (6 canales)
-- =========================================================
INSERT INTO canal_comunicacion (id_gimnasio, tipo, nombre_remitente, credenciales_json, activo, es_principal) VALUES
(1, 'EMAIL',    'FitZone Bogotá',    '{"smtp":"smtp.fitzone.co","puerto":587,"usuario":"noreply@fitzone.co"}',  TRUE,  TRUE),
(1, 'WHATSAPP', 'FitZone WA',        '{"api_key":"wk_fz_001","numero":"+5716001001"}',                         TRUE,  FALSE),
(2, 'EMAIL',    'PowerGym Medellín', '{"smtp":"smtp.powergym.co","puerto":465,"usuario":"info@powergym.co"}',  TRUE,  FALSE),
(2, 'WHATSAPP', 'PowerGym WA',       '{"api_key":"wk_pg_002","numero":"+5746002002"}',                         TRUE,  TRUE),
(3, 'EMAIL',    'IronBody Cali',     '{"smtp":"smtp.ironbody.co","puerto":587,"usuario":"hola@ironbody.co"}',  TRUE,  TRUE),
(3, 'WHATSAPP', 'IronBody WA',       '{"api_key":"wk_ib_003","numero":"+5723003003"}',                         FALSE, FALSE);

-- =========================================================
-- 13. plantilla_mensaje (12 plantillas)
-- =========================================================
INSERT INTO plantilla_mensaje (id_gimnasio, nombre, contenido, activa, creada_por) VALUES
(1, 'Bienvenida',           'Hola {{nombre}}, bienvenido a FitZone. Tu membresía inicia el {{fecha_inicio}}.',  TRUE,  1),
(1, 'Vencimiento Próximo',  'Hola {{nombre}}, tu membresía vence el {{fecha_fin}}. Renuévala hoy.',             TRUE,  1),
(1, 'Inactividad',          'Hola {{nombre}}, te echamos de menos. Llevas {{dias}} días sin visitarnos.',       TRUE,  1),
(1, 'Reto Activo',          'Hola {{nombre}}, el reto "{{reto}}" sigue activo. Llevas {{checkins}} visitas.',   TRUE,  1),
(2, 'Bienvenida',           'Hola {{nombre}}, bienvenido a PowerGym. Tu plan {{plan}} ya está activo.',         TRUE,  4),
(2, 'Vencimiento Próximo',  'Hola {{nombre}}, tu membresía vence pronto. ¡No pierdas tu lugar!',               TRUE,  4),
(2, 'Inactividad',          'Hola {{nombre}}, en PowerGym te esperamos. ¡Vuelve y sigue tu progreso!',         TRUE,  4),
(2, 'Promo Renovación',     'Hola {{nombre}}, renueva este mes y obtén 10% de descuento.',                     TRUE,  4),
(3, 'Bienvenida',           'Hola {{nombre}}, bienvenido a IronBody. Tu entrenamiento empieza hoy.',           TRUE,  7),
(3, 'Vencimiento Próximo',  'Hola {{nombre}}, tu membresía vence el {{fecha_fin}}. Renuévala ya.',             TRUE,  7),
(3, 'Inactividad',          'Hola {{nombre}}, llevas {{dias}} días sin entrenar. ¡Te esperamos!',              TRUE,  7),
(3, 'Oferta Especial',      'Hola {{nombre}}, plan trimestral con 15% OFF solo este mes. ¡Aprovéchalo!',       TRUE,  7);

-- =========================================================
-- 14. campana (10 campañas)
-- =========================================================
INSERT INTO campana (id_gimnasio, nombre, segmento, mensaje, id_plantilla, tipo_disparo, dias_inactividad, fecha_programada, fecha_ejecucion, estado, activa, creada_por) VALUES
(1, 'Campaña Reactivación Junio',   'INACTIVOS',         'Te echamos de menos en FitZone',           3,  'AUTOMATICO', 7,  NULL,                        '2026-06-01 08:00:00', 'ENVIADA',     TRUE,  1),
(1, 'Campaña Vencimientos Junio',   'PROXIMOS_A_VENCER', 'Tu membresía vence pronto',                2,  'PROGRAMADO', NULL,'2026-06-25 08:00:00',      NULL,                  'PROGRAMADA',  TRUE,  1),
(1, 'Bienvenida Nuevos Mayo',       'NUEVOS',            'Bienvenido a la familia FitZone',          1,  'AUTOMATICO', NULL,NULL,                        '2026-05-01 09:00:00', 'ENVIADA',     TRUE,  1),
(2, 'Reactivación PowerGym Mayo',   'INACTIVOS',         'Vuelve a PowerGym y retoma tu rutina',     7,  'MANUAL',     10, NULL,                        '2026-05-15 10:00:00', 'ENVIADA',     TRUE,  4),
(2, 'Promo Renovación Junio',       'PROXIMOS_A_VENCER', 'Renueva y llévate un descuento',           8,  'PROGRAMADO', NULL,'2026-06-20 08:00:00',      NULL,                  'PROGRAMADA',  TRUE,  4),
(2, 'Todos Junio',                  'TODOS',             'PowerGym: nuevas máquinas disponibles',    5,  'MANUAL',     NULL,NULL,                        '2026-06-02 09:00:00', 'ENVIADA',     TRUE,  4),
(3, 'Reactivación IronBody',        'INACTIVOS',         'Te esperamos en IronBody',                11,  'AUTOMATICO', 8,  NULL,                        '2026-05-20 08:00:00', 'ENVIADA',     TRUE,  7),
(3, 'Oferta Plan Trimestral',       'TODOS',             'Aprovecha la oferta trimestral',           12, 'PROGRAMADO', NULL,'2026-06-15 10:00:00',      NULL,                  'PROGRAMADA',  TRUE,  7),
(1, 'Campaña Cancelada Test',       'INACTIVOS',         'Mensaje de prueba cancelado',              3,  'MANUAL',     NULL,NULL,                        NULL,                  'CANCELADA',   FALSE, 1),
(2, 'Bienvenida Nuevos PowerGym',   'NUEVOS',            'Bienvenido a PowerGym, tu plan inicia hoy',5, 'AUTOMATICO', NULL,NULL,                        '2026-06-01 09:00:00', 'ENVIADA',     TRUE,  4);

-- =========================================================
-- 15. campana_destinatario (30 registros)
-- =========================================================
INSERT INTO campana_destinatario (id_campana, id_miembro, estado_envio, fecha_envio) VALUES
(1,  8, 'ENVIADO',  '2026-06-01 08:05:00'),
(1,  9, 'ENVIADO',  '2026-06-01 08:06:00'),
(1,  3, 'ENVIADO',  '2026-06-01 08:07:00'),
(2,  3, 'PENDIENTE', NULL),
(2,  6, 'PENDIENTE', NULL),
(2, 12, 'PENDIENTE', NULL),
(3,  1, 'ENVIADO',  '2026-05-01 09:01:00'),
(3,  2, 'ENVIADO',  '2026-05-01 09:02:00'),
(4, 17, 'ENVIADO',  '2026-05-15 10:05:00'),
(4, 22, 'ENVIADO',  '2026-05-15 10:06:00'),
(4, 19, 'ENVIADO',  '2026-05-15 10:07:00'),
(5, 16, 'PENDIENTE', NULL),
(5, 21, 'PENDIENTE', NULL),
(6, 13, 'ENVIADO',  '2026-06-02 09:01:00'),
(6, 14, 'ENVIADO',  '2026-06-02 09:02:00'),
(6, 15, 'ENVIADO',  '2026-06-02 09:03:00'),
(6, 16, 'ENVIADO',  '2026-06-02 09:04:00'),
(6, 18, 'ENVIADO',  '2026-06-02 09:05:00'),
(6, 20, 'FALLIDO',   '2026-06-02 09:06:00'),
(7, 26, 'ENVIADO',  '2026-05-20 08:05:00'),
(7, 28, 'ENVIADO',  '2026-05-20 08:06:00'),
(7, 29, 'ENVIADO',  '2026-05-20 08:07:00'),
(8, 23, 'PENDIENTE', NULL),
(8, 24, 'PENDIENTE', NULL),
(8, 25, 'PENDIENTE', NULL),
(8, 27, 'PENDIENTE', NULL),
(8, 30, 'PENDIENTE', NULL),
(10,13, 'ENVIADO',  '2026-06-01 09:01:00'),
(10,15, 'ENVIADO',  '2026-06-01 09:02:00'),
(10,20, 'FALLIDO',   '2026-06-01 09:03:00');

-- =========================================================
-- 16. envio_mensaje (20 envíos)
-- =========================================================
INSERT INTO envio_mensaje (id_gimnasio, id_miembro, id_canal, id_alerta, id_campana, id_plantilla, mensaje_copiado, estado, enviado_por) VALUES
(1,  8, 1, 1,  1, 3, 'Hola Luisa, te echamos de menos. Llevas 10 días sin visitarnos.',         'ENVIADO', 2),
(1,  9, 1, 2,  1, 3, 'Hola Andrés Felipe, te echamos de menos. Llevas 18 días sin visitarnos.', 'ENVIADO', 1),
(1,  3, 1, NULL,1, 3, 'Hola Sebastián, te echamos de menos. Llevas 7 días sin visitarnos.',     'ENVIADO', 2),
(1,  1, 1, NULL,3, 1, 'Hola Juan Pablo, bienvenido a FitZone. Tu membresía inicia el 01/05.',   'ENVIADO', 2),
(1,  2, 1, NULL,3, 1, 'Hola María Camila, bienvenida a FitZone.',                               'ENVIADO', 2),
(2, 17, 4, 3,  4, 7, 'Hola Santiago, en PowerGym te esperamos. ¡Vuelve!',                      'ENVIADO', 5),
(2, 22, 4, 6,  4, 7, 'Hola Isabela, en PowerGym te esperamos. ¡Vuelve!',                       'ENVIADO', 4),
(2, 19, 4, 5,  4, 7, 'Hola David, en PowerGym te esperamos. ¡Vuelve!',                         'ENVIADO', 5),
(2, 13, 4, NULL,6, 5, 'PowerGym: nuevas máquinas disponibles para ti.',                          'ENVIADO', 5),
(2, 14, 4, NULL,6, 5, 'PowerGym: nuevas máquinas disponibles para ti.',                          'ENVIADO', 5),
(2, 15, 4, NULL,6, 5, 'PowerGym: nuevas máquinas disponibles para ti.',                          'ENVIADO', 5),
(2, 16, 4, NULL,6, 5, 'PowerGym: nuevas máquinas disponibles para ti.',                          'ENVIADO', 5),
(2, 18, 4, NULL,6, 5, 'PowerGym: nuevas máquinas disponibles para ti.',                          'ENVIADO', 5),
(2, 20, 4, NULL,6, 5, 'PowerGym: nuevas máquinas disponibles para ti.',                          'FALLIDO', 5),
(3, 26, 5, 7,  7,11, 'Hola Lucía, llevas 20 días sin entrenar. ¡Te esperamos!',                 'ENVIADO', 8),
(3, 28, 5, 8,  7,11, 'Hola Esteban, llevas 9 días sin entrenar. ¡Te esperamos!',                'ENVIADO', 8),
(3, 29, 5, NULL,7,11, 'Hola Tatiana, llevas 13 días sin entrenar. ¡Te esperamos!',              'ENVIADO', 9),
(2, 13, 4, NULL,10, 5,'Hola Alejandro, bienvenido a PowerGym, tu plan inicia hoy.',              'ENVIADO', 5),
(2, 15, 4, NULL,10, 5,'Hola Mateo, bienvenido a PowerGym, tu plan inicia hoy.',                  'ENVIADO', 5),
(2, 20, 4, NULL,10, 5,'Hola Gabriela, bienvenida a PowerGym, tu plan inicia hoy.',               'FALLIDO', 5);

-- =========================================================
-- 17. hito_gamificacion (12 hitos)
-- =========================================================
INSERT INTO hito_gamificacion (id_gimnasio, nombre, tipo_hito, valor_objetivo, mensaje, activo) VALUES
(1, 'Primera Semana',       'RACHA',              7,   '¡Llevas 7 días seguidos entrenando en FitZone!',      TRUE),
(1, 'Primer Mes',           'RACHA',             30,   '¡Un mes completo de entrenamiento! ¡Increíble!',      TRUE),
(1, '50 Visitas',           'TOTAL_ASISTENCIAS', 50,   '¡50 visitas en FitZone! Eres un campeón.',            TRUE),
(1, '100 Visitas',          'TOTAL_ASISTENCIAS',100,   '¡100 visitas! Eres parte del Hall of Fame de FitZone.',TRUE),
(2, 'Primera Semana',       'RACHA',              7,   '¡7 días de racha en PowerGym! ¡Sigue así!',           TRUE),
(2, 'Dos Semanas Seguidas', 'RACHA',             14,   '¡14 días de racha! PowerGym es tu hogar.',            TRUE),
(2, '25 Visitas',           'TOTAL_ASISTENCIAS', 25,   '¡25 visitas en PowerGym! Estás progresando.',         TRUE),
(2, '75 Visitas',           'TOTAL_ASISTENCIAS', 75,   '¡75 visitas en PowerGym! Eres una leyenda.',          TRUE),
(3, 'Primera Semana',       'RACHA',              7,   '¡7 días de racha en IronBody! ¡Eres de hierro!',      TRUE),
(3, 'Primer Mes',           'RACHA',             30,   '¡Un mes de racha en IronBody! ¡Imparable!',           TRUE),
(3, '30 Visitas',           'TOTAL_ASISTENCIAS', 30,   '¡30 visitas en IronBody! El hierro te forja.',        TRUE),
(3, '60 Visitas',           'TOTAL_ASISTENCIAS', 60,   '¡60 visitas! IronBody corre por tus venas.',          TRUE);

-- =========================================================
-- 18. hito_miembro (15 hitos logrados)
-- =========================================================
INSERT INTO hito_miembro (id_hito, id_miembro, fecha_logro, mostrado_en_checkin) VALUES
(1,  1, NOW() - INTERVAL '20 days', TRUE),
(1,  2, NOW() - INTERVAL '15 days', TRUE),
(1,  6, NOW() - INTERVAL '10 days', TRUE),
(3,  1, NOW() - INTERVAL '5 days',  TRUE),
(2,  6, NOW() - INTERVAL '2 days',  FALSE),
(5, 13, NOW() - INTERVAL '12 days', TRUE),
(5, 14, NOW() - INTERVAL '8 days',  TRUE),
(5, 18, NOW() - INTERVAL '6 days',  TRUE),
(7, 13, NOW() - INTERVAL '3 days',  TRUE),
(6, 14, NOW() - INTERVAL '1 day',   FALSE),
(9, 23, NOW() - INTERVAL '10 days', TRUE),
(9, 24, NOW() - INTERVAL '7 days',  TRUE),
(9, 27, NOW() - INTERVAL '4 days',  TRUE),
(11,23, NOW() - INTERVAL '2 days',  FALSE),
(10,27, NOW() - INTERVAL '1 day',   TRUE);

-- =========================================================
-- 19. etiqueta_comportamiento (10 etiquetas)
-- =========================================================
INSERT INTO etiqueta_comportamiento (id_gimnasio, nombre, criterio, activa) VALUES
(1, 'VIP',              'Miembro con membresía activa por más de 6 meses',  TRUE),
(1, 'En Riesgo',        'Sin check-in en los últimos 7 días',               TRUE),
(1, 'Nuevo',            'Registrado en los últimos 30 días',                 TRUE),
(2, 'VIP',              'Membresía premium activa por más de 3 meses',      TRUE),
(2, 'En Riesgo',        'Inactivo por más de 10 días',                      TRUE),
(2, 'Referido',         'Ingresó por referencia de otro miembro',           TRUE),
(3, 'VIP',              'Membresía activa y más de 50 check-ins totales',   TRUE),
(3, 'En Riesgo',        'Sin asistencia en los últimos 7 días',             TRUE),
(3, 'Constante',        'Al menos 15 check-ins en el último mes',           TRUE),
(1, 'Inactivo',         'Sin check-in en los últimos 30 días',              FALSE);

-- =========================================================
-- 20. miembro_etiqueta (15 asignaciones)
-- =========================================================
INSERT INTO miembro_etiqueta (id_miembro, id_etiqueta, activa) VALUES
( 1, 1, TRUE),
( 2, 1, TRUE),
( 6, 1, TRUE),
( 8, 2, TRUE),
( 9, 2, TRUE),
(12, 3, TRUE),
(13, 4, TRUE),
(14, 4, TRUE),
(17, 5, TRUE),
(19, 6, TRUE),
(21, 4, TRUE),
(23, 7, TRUE),
(26, 8, TRUE),
(27, 9, TRUE),
(30, 9, TRUE);

-- =========================================================
-- 21. reto (8 retos)
-- =========================================================
INSERT INTO reto (id_gimnasio, nombre, descripcion, meta_asistencias, recompensa, segmento_elegible, estado, activo, fecha_inicio, fecha_fin, creado_por) VALUES
(1, 'Reto Junio FitZone',       'Asiste 20 veces en junio y gana un mes gratis',          20, 'Mes gratis',          'TODOS',             'ACTIVO',     TRUE, '2026-06-01', '2026-06-30', 1),
(1, 'Reto Nuevos Mayo',         'Los nuevos miembros con 10 visitas en mayo ganan premio', 10, 'Camiseta FitZone',   'NUEVOS',            'COMPLETADO', TRUE, '2026-05-01', '2026-05-31', 1),
(2, 'PowerChallenge Junio',     'Asiste 15 veces en junio y obtén descuento en renovación',15,'10% descuento',      'TODOS',             'ACTIVO',     TRUE, '2026-06-01', '2026-06-30', 4),
(2, 'Reto Inactivos Mayo',      'Regresa y asiste 8 veces en mayo',                        8, 'Evaluación gratis',  'INACTIVOS',         'COMPLETADO', TRUE, '2026-05-01', '2026-05-31', 4),
(2, 'Reto Anual',               'El miembro con más visitas en el año gana premio mayor', 100,'Premio mayor',       'TODOS',             'ACTIVO',     TRUE, '2026-01-01', '2026-12-31', 4),
(3, 'IronChallenge Junio',      'Completa 18 sesiones en junio',                          18, 'Suplemento gratis',  'TODOS',             'ACTIVO',     TRUE, '2026-06-01', '2026-06-30', 7),
(3, 'Reto Constancia Q2',       'Asiste 45 veces entre abril y junio',                    45, 'Mes gratis',         'PROXIMOS_A_VENCER', 'ACTIVO',     TRUE, '2026-04-01', '2026-06-30', 7),
(1, 'Reto Cancelado Test',      'Reto de prueba cancelado',                                5, NULL,                 'TODOS',             'CANCELADO',  FALSE,'2026-05-01', '2026-05-31', 1);

-- =========================================================
-- 22. reto_miembro (20 inscripciones)
-- =========================================================
INSERT INTO reto_miembro (id_reto, id_miembro, estado, checkins_acumulados, porcentaje_avance, fecha_completado) VALUES
(1,  1, 'EN_CURSO',  12, 60.00, NULL),
(1,  2, 'EN_CURSO',   9, 45.00, NULL),
(1,  5, 'EN_CURSO',   8, 40.00, NULL),
(1,  6, 'EN_CURSO',  14, 70.00, NULL),
(1,  7, 'EN_CURSO',   5, 25.00, NULL),
(2,  1, 'COMPLETADO',10,100.00, '2026-05-28 18:00:00'),
(2,  2, 'COMPLETADO',10,100.00, '2026-05-30 19:00:00'),
(3, 13, 'EN_CURSO',  10, 66.67, NULL),
(3, 14, 'EN_CURSO',   9, 60.00, NULL),
(3, 18, 'EN_CURSO',   7, 46.67, NULL),
(3, 20, 'EN_CURSO',   6, 40.00, NULL),
(4, 17, 'COMPLETADO', 8,100.00, '2026-05-29 17:00:00'),
(5, 13, 'EN_CURSO',  32, 32.00, NULL),
(5, 14, 'EN_CURSO',  28, 28.00, NULL),
(5, 16, 'EN_CURSO',  15, 15.00, NULL),
(6, 23, 'EN_CURSO',  10, 55.56, NULL),
(6, 24, 'EN_CURSO',   9, 50.00, NULL),
(6, 27, 'EN_CURSO',  11, 61.11, NULL),
(7, 25, 'EN_CURSO',  20, 44.44, NULL),
(7, 23, 'EN_CURSO',  24, 53.33, NULL);

-- =========================================================
-- 23. notificacion (20 notificaciones)
-- =========================================================
INSERT INTO notificacion (id_gimnasio, id_usuario, id_miembro, tipo, titulo, mensaje, leida) VALUES
(1, 1,  NULL, 'SISTEMA', 'Nuevo miembro registrado',          'El miembro Juan Pablo Ruiz fue registrado exitosamente.',          TRUE),
(1, 2,  8,    'ALERTA',  'Miembro inactivo detectado',        'Luisa Fernanda Gil lleva 10 días sin asistir.',                    TRUE),
(1, 1,  9,    'ALERTA',  'Alerta roja: miembro inactivo',     'Andrés Felipe Díaz lleva 18 días sin asistir.',                   TRUE),
(1, 2,  NULL, 'SISTEMA', 'Campaña enviada exitosamente',      'La campaña Reactivación Junio fue enviada a 3 miembros.',         FALSE),
(1, NULL,1,   'RETO',    'Avance en reto Junio FitZone',      'Juan Pablo, llevas 12 visitas. ¡Solo 8 más para ganar!',          FALSE),
(1, NULL,2,   'RETO',    'Avance en reto Junio FitZone',      'María Camila, llevas 9 visitas. ¡Sigue así!',                     FALSE),
(2, 4,  NULL, 'SISTEMA', 'Configuración actualizada',         'La configuración de PowerGym fue actualizada.',                    TRUE),
(2, 5,  17,   'ALERTA',  'Miembro inactivo detectado',        'Santiago Aguirre lleva 12 días sin asistir.',                     FALSE),
(2, 4,  22,   'ALERTA',  'Alerta roja: miembro inactivo',     'Isabela Muñoz lleva 15 días sin asistir.',                       TRUE),
(2, NULL,13,  'RETO',    'Avance en PowerChallenge',          'Alejandro, llevas 10 visitas. ¡A 5 de tu meta!',                  FALSE),
(2, 5,  NULL, 'CAMPANA', 'Campaña todos Junio enviada',       'La campaña PowerGym Junio se envió a 6 miembros.',                TRUE),
(2, 4,  NULL, 'SISTEMA', 'Membresía congelada',               'La membresía de Gabriela Zapata fue congelada.',                  FALSE),
(3, 7,  NULL, 'SISTEMA', 'Nuevo miembro IronBody',            'El miembro Nicolás Palacios fue registrado.',                     TRUE),
(3, 8,  26,   'ALERTA',  'Alerta roja: miembro inactivo',     'Lucía Pedraza lleva 20 días sin asistir.',                       FALSE),
(3, 9,  28,   'ALERTA',  'Miembro inactivo detectado',        'Esteban Quintero lleva 9 días sin asistir.',                     FALSE),
(3, NULL,23,  'RETO',    'Avance en IronChallenge',           'Nicolás, llevas 10 visitas. ¡Va muy bien!',                      FALSE),
(3, 7,  NULL, 'CAMPANA', 'Campaña reactivación IronBody',     'Se enviaron mensajes a 3 miembros inactivos.',                    TRUE),
(1, 1,  NULL, 'SISTEMA', 'Hito desbloqueado',                 'Juan Pablo Ruiz desbloqueó el hito "Primera Semana".',            FALSE),
(2, 4,  NULL, 'SISTEMA', 'Reto completado',                   'Santiago Aguirre completó el Reto Inactivos Mayo.',               TRUE),
(3, 7,  NULL, 'SISTEMA', 'Congelación registrada',            'Se registró la congelación de la membresía de Gabriela Zapata.',  TRUE);

-- =========================================================
-- 24. auditoria (30 registros de auditoría)
-- =========================================================
INSERT INTO auditoria (id_gimnasio, tabla_afectada, id_registro, accion, id_usuario, detalle, fecha_evento) VALUES
(1, 'gimnasio',              1,  'INSERT', 1,  '{"descripcion":"Registro inicial gimnasio FitZone"}',           NOW() - INTERVAL '180 days'),
(1, 'usuario',               1,  'INSERT', 1,  '{"descripcion":"Creación usuario administrador Carlos Mendoza"}',NOW() - INTERVAL '180 days'),
(1, 'usuario',               2,  'INSERT', 1,  '{"descripcion":"Creación usuario Laura Ríos"}',                  NOW() - INTERVAL '90 days'),
(1, 'miembro',               1,  'INSERT', 2,  '{"descripcion":"Registro miembro Juan Pablo Ruiz"}',             NOW() - INTERVAL '60 days'),
(1, 'miembro',               2,  'INSERT', 2,  '{"descripcion":"Registro miembro María Camila Pérez"}',          NOW() - INTERVAL '55 days'),
(1, 'membresia',             3,  'INSERT', 2,  '{"descripcion":"Nueva membresía mensual básico"}',               NOW() - INTERVAL '36 days'),
(1, 'pago',                  3,  'INSERT', 2,  '{"monto":80000,"metodo":"EFECTIVO"}',                            NOW() - INTERVAL '36 days'),
(1, 'checkin',               1,  'INSERT', 2,  '{"metodo":"QR","valido":true}',                                  NOW() - INTERVAL '1 day'),
(1, 'alerta_abandono',       1,  'INSERT', NULL,'{"descripcion":"Alerta amarilla miembro 8"}',                   NOW() - INTERVAL '12 days'),
(1, 'alerta_abandono',       1,  'UPDATE', 2,  '{"estado_anterior":"PENDIENTE","estado_nuevo":"GESTIONADA"}',    NOW() - INTERVAL '2 days'),
(1, 'usuario',               1,  'LOGIN',  1,  '{"ip":"192.168.1.10","dispositivo":"Chrome/Windows"}',           NOW() - INTERVAL '30 min'),
(1, 'usuario',               2,  'LOGIN',  2,  '{"ip":"192.168.1.11","dispositivo":"Firefox/Windows"}',          NOW() - INTERVAL '1 day'),
(1, 'campana',               1,  'INSERT', 1,  '{"descripcion":"Campaña Reactivación Junio creada"}',            NOW() - INTERVAL '7 days'),
(1, 'campana',               1,  'UPDATE', 1,  '{"estado_anterior":"PROGRAMADA","estado_nuevo":"ENVIADA"}',      NOW() - INTERVAL '6 days'),
(2, 'gimnasio',              2,  'INSERT', 4,  '{"descripcion":"Registro inicial gimnasio PowerGym"}',           NOW() - INTERVAL '150 days'),
(2, 'usuario',               4,  'INSERT', 4,  '{"descripcion":"Creación usuario administrador Patricia Suárez"}',NOW() - INTERVAL '150 days'),
(2, 'miembro',              13,  'INSERT', 5,  '{"descripcion":"Registro miembro Alejandro Betancur"}',          NOW() - INTERVAL '40 days'),
(2, 'membresia',            18,  'INSERT', 5,  '{"descripcion":"Nueva membresía mensual premium"}',              NOW() - INTERVAL '22 days'),
(2, 'congelacion_membresia', 1,  'INSERT', 5,  '{"descripcion":"Congelación membresía Gabriela Zapata"}',        NOW() - INTERVAL '4 days'),
(2, 'membresia',            25,  'UPDATE', 5,  '{"estado_anterior":"ACTIVA","estado_nuevo":"CONGELADA"}',        NOW() - INTERVAL '4 days'),
(2, 'reto',                  3,  'INSERT', 4,  '{"descripcion":"Reto PowerChallenge Junio creado"}',             NOW() - INTERVAL '7 days'),
(2, 'usuario',               4,  'LOGIN',  4,  '{"ip":"10.0.0.5","dispositivo":"Chrome/Android"}',              NOW() - INTERVAL '5 days'),
(2, 'usuario',               4,  'LOGOUT', 4,  '{"duracion_min":45}',                                            NOW() - INTERVAL '5 days'),
(3, 'gimnasio',              3,  'INSERT', 7,  '{"descripcion":"Registro inicial gimnasio IronBody"}',           NOW() - INTERVAL '120 days'),
(3, 'miembro',              23,  'INSERT', 8,  '{"descripcion":"Registro miembro Nicolás Palacios"}',            NOW() - INTERVAL '30 days'),
(3, 'membresia',            28,  'INSERT', 8,  '{"descripcion":"Nueva membresía mensual básico IronBody"}',      NOW() - INTERVAL '6 days'),
(3, 'checkin',              33,  'INSERT', 8,  '{"metodo":"QR","valido":true}',                                  NOW() - INTERVAL '1 day'),
(3, 'hito_miembro',         11,  'INSERT', NULL,'{"descripcion":"Hito Primera Semana logrado por Nicolás"}',     NOW() - INTERVAL '10 days'),
(3, 'reto',                  6,  'INSERT', 7,  '{"descripcion":"Reto IronChallenge Junio creado"}',              NOW() - INTERVAL '7 days'),
(1, 'configuracion_gimnasio',1,  'UPDATE', 1,  '{"campo":"umbral_alerta_amarilla","antes":10,"despues":7}',      NOW() - INTERVAL '3 days');

-- COMMIT;