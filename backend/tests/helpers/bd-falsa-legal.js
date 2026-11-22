/**
 * Base de datos falsa para las pruebas de RQNF-17 y RQNF-18.
 *
 * Simula solo las consultas que hacen el alta y la edicion de miembros,
 * las rutas de autorizaciones y contrato de la app y el envio del contrato,
 * con estado en memoria (miembros, planes, autorizaciones, entregas). Asi las
 * pruebas pueden mirar que filas quedan, no solo que SQL se mando.
 *
 * Cualquier consulta que no reconoce lanza un error: si una ruta empieza a
 * hacer algo nuevo, la prueba lo dice.
 */
function crearBdFalsa() {
  const bd = {
    gimnasios: new Map(),
    miembros: new Map(),
    planes: [],
    autorizaciones: [],
    contratos: [],
    log: [],        // [sql, params] de cada consulta, en orden
    conexiones: 0,  // cuantas veces se pidio pool.connect()
    siguienteId: 100,
    reloj: Date.parse('2026-11-17T15:00:00Z'),
  };

  const ahora = () => { bd.reloj += 1000; return new Date(bd.reloj); };

  bd.agregarGimnasio = (g) => bd.gimnasios.set(g.id_gimnasio, {
    nit: null, direccion: null, email: null, dias_aviso_vencimiento: 3, activo: true, ...g,
  });

  bd.agregarMiembro = (m) => {
    const fila = {
      tipo_documento: 'CC', fecha_nacimiento: null, condiciones_medicas: null, alergias: null,
      representante_nombre: null, representante_tipo_documento: null, representante_documento: null,
      representante_parentesco: null, representante_telefono: null, activo: true,
      acepto_terminos: true, autorizo_datos: true, telefono: '3001234567', codigo_pais_telefono: '+57',
      fecha_registro: new Date('2026-10-01T15:00:00Z'), documento: String(m.id_miembro),
      ...m,
    };
    bd.miembros.set(fila.id_miembro, fila);
    return fila;
  };

  bd.agregarPlan = (p) => bd.planes.push({
    id_plan_cobro: bd.siguienteId++, activo: true, estado_pago: 'PAGADO', congelado_desde: null, ...p,
  });

  bd.agregarAutorizacion = (a) => bd.autorizaciones.push({
    id_autorizacion: bd.siguienteId++, version_texto: 'v1', canal: 'PANEL', registrada_por: null,
    detalle: null, fecha: ahora(), ...a,
  });

  const vigentes = (idM, gym) => {
    const porTipo = new Map();
    for (const a of bd.autorizaciones) {
      if (a.id_miembro !== idM || a.id_gimnasio !== gym) continue;
      const prev = porTipo.get(a.tipo);
      if (!prev || a.fecha > prev.fecha || (a.fecha.getTime() === prev.fecha.getTime() && a.id_autorizacion > prev.id_autorizacion)) {
        porTipo.set(a.tipo, a);
      }
    }
    return [...porTipo.values()].map((a) => ({ ...a, registrada_por: a.registrada_por ? `Usuario ${a.registrada_por}` : null }));
  };

  const planVigente = (idM) => bd.planes
    .filter((p) => p.id_miembro === idM && p.activo)
    .sort((a, b) => String(b.fecha_fin).localeCompare(String(a.fecha_fin)) || b.id_plan_cobro - a.id_plan_cobro)[0] || null;

  /** Aplica "SET a = $1, b = NULL, c = CURRENT_TIMESTAMP" sobre una fila. */
  const aplicarSet = (sql, params, fila) => {
    const set = /SET\s+([\s\S]+?)\s+WHERE/i.exec(sql)[1];
    for (const parte of set.split(',')) {
      const m = /^\s*(\w+)\s*=\s*(\$(\d+)|NULL|CURRENT_TIMESTAMP)\s*$/i.exec(parte);
      if (!m) throw new Error(`SET no soportado por la base falsa: ${parte}`);
      fila[m[1]] = m[3] ? params[Number(m[3]) - 1] : (m[2].toUpperCase() === 'NULL' ? null : new Date());
    }
  };

  const devolverMiembro = (m) => ({
    id_miembro: m.id_miembro, nombre: m.nombre, documento: m.documento, telefono: m.telefono,
    email: m.email || null, codigo_qr: m.codigo_qr || 'QR', qr_imagen: null, activo: m.activo,
    fecha_registro: m.fecha_registro, app_acceso: true, password_asignada: false, foto_url: null,
  });

  async function query(sql, params = []) {
    bd.log.push([sql, params]);
    const s = sql.replace(/\s+/g, ' ').trim();

    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(s)) return { rows: [] };

    // requireActiveTrial
    if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/i.test(s)) {
      const g = bd.gimnasios.get(params[0]);
      return { rows: g ? [{ id_gimnasio: g.id_gimnasio, activo: true, trial_ends_at: null }] : [] };
    }
    if (/^SELECT nombre FROM gimnasio WHERE id_gimnasio = \$1$/i.test(s)) {
      const g = bd.gimnasios.get(params[0]);
      return { rows: g ? [{ nombre: g.nombre }] : [] };
    }

    // Alta: duplicados y QR
    if (/SELECT id_miembro FROM miembro WHERE id_gimnasio = \$1 AND documento = \$2 AND activo = TRUE/i.test(s)) {
      return { rows: [...bd.miembros.values()].filter((m) => m.id_gimnasio === params[0] && m.documento === params[1] && m.activo) };
    }
    if (/SELECT id_miembro FROM miembro WHERE id_gimnasio = \$1 AND LOWER\(email\)/i.test(s)) return { rows: [] };
    if (/SELECT 1 FROM miembro WHERE codigo_qr = \$1/i.test(s)) return { rows: [] };

    if (/^INSERT INTO miembro \(/i.test(s)) {
      const cols = /INSERT INTO miembro \(([^)]+)\)/i.exec(s)[1].split(',').map((c) => c.trim());
      const fila = { id_miembro: bd.siguienteId++, activo: true, fecha_registro: ahora() };
      cols.forEach((c, i) => { fila[c] = params[i]; });
      bd.miembros.set(fila.id_miembro, fila);
      return { rows: [devolverMiembro(fila)] };
    }
    if (/^INSERT INTO plan_cobro/i.test(s)) {
      bd.agregarPlan({
        id_miembro: params[0], id_gimnasio: params[1], tipo_plan: params[2], fecha_inicio: params[3],
        fecha_fin: params[4], valor_total: params[5], valor_pagado: params[6], metodo_pago: params[7],
        estado_pago: params[9],
      });
      return { rows: [] };
    }

    // Autorizaciones
    if (/^INSERT INTO autorizacion_miembro/i.test(s)) {
      const fila = {
        id_autorizacion: bd.siguienteId++, id_miembro: params[0], id_gimnasio: params[1], tipo: params[2],
        otorgada: params[3], version_texto: params[4], canal: params[5], registrada_por: params[6],
        detalle: params[7] ? JSON.parse(params[7]) : null, fecha: ahora(),
      };
      bd.autorizaciones.push(fila);
      return { rows: [{ ...fila }] };
    }
    if (/FROM autorizacion_miembro a .* DISTINCT ON|SELECT DISTINCT ON \(a\.tipo\)/i.test(s)) {
      return { rows: vigentes(params[0], params[1]) };
    }
    if (/FROM autorizacion_miembro a LEFT JOIN usuario u .* ORDER BY a\.fecha DESC/i.test(s)) {
      const rows = bd.autorizaciones
        .filter((a) => a.id_miembro === params[0] && a.id_gimnasio === params[1])
        .sort((a, b) => b.fecha - a.fecha || b.id_autorizacion - a.id_autorizacion)
        .slice(0, params[2])
        .map((a) => ({ ...a, registrada_por: a.registrada_por ? `Usuario ${a.registrada_por}` : null }));
      return { rows };
    }

    // Edicion con autorizaciones: fila actual bloqueada
    if (/FROM miembro WHERE id_miembro = \$1 AND id_gimnasio = \$2 FOR UPDATE$/i.test(s)
        || /FROM miembro WHERE id_miembro = \$1 AND id_gimnasio = \$2 AND activo = TRUE( FOR UPDATE)?$/i.test(s)) {
      const m = bd.miembros.get(params[0]);
      if (!m || m.id_gimnasio !== params[1]) return { rows: [] };
      if (/activo = TRUE/i.test(s) && !m.activo) return { rows: [] };
      return { rows: [{ ...m }] };
    }
    // GET /admin/miembros/:id
    if (/^SELECT id_miembro, nombre, documento, telefono, email, codigo_qr, qr_imagen, activo, fecha_registro, tipo_documento/i.test(s)) {
      const m = bd.miembros.get(params[0]);
      if (!m || m.id_gimnasio !== params[1]) return { rows: [] };
      const fecha = m.fecha_nacimiento ? new Date(`${m.fecha_nacimiento}T00:00:00`) : null;
      return { rows: [{ ...m, fecha_nacimiento: fecha }] };
    }
    if (/^UPDATE miembro SET/i.test(s)) {
      const idIdx = Number(/WHERE id_miembro = \$(\d+)/i.exec(s)[1]) - 1;
      const gymIdx = Number(/AND id_gimnasio = \$(\d+)/i.exec(s)[1]) - 1;
      const m = bd.miembros.get(params[idIdx]);
      if (!m || m.id_gimnasio !== params[gymIdx]) return { rows: [] };
      aplicarSet(sql, params, m);
      return { rows: [devolverMiembro(m)] };
    }

    // Contrato
    if (/FROM miembro m JOIN gimnasio g ON g\.id_gimnasio = m\.id_gimnasio LEFT JOIN LATERAL/i.test(s)) {
      const m = bd.miembros.get(params[0]);
      if (!m || m.id_gimnasio !== params[1]) return { rows: [] };
      const g = bd.gimnasios.get(m.id_gimnasio);
      const p = planVigente(m.id_miembro) || {};
      return {
        rows: [{
          ...m,
          gym_nombre: g.nombre, gym_nit: g.nit, gym_direccion: g.direccion, gym_telefono: g.telefono,
          gym_email: g.email, gym_dias_aviso: g.dias_aviso_vencimiento,
          id_plan_cobro: p.id_plan_cobro || null, tipo_plan: p.tipo_plan || null, fecha_inicio: p.fecha_inicio || null,
          fecha_fin: p.fecha_fin || null, valor_total: p.valor_total ?? null, valor_pagado: p.valor_pagado ?? null,
          metodo_pago: p.metodo_pago || null, estado_pago: p.estado_pago || null, congelado_desde: p.congelado_desde || null,
        }],
      };
    }
    if (/FROM contrato_enviado WHERE id_miembro = \$1 AND id_gimnasio = \$2 AND canal = 'APP' AND md5\(contenido\) = md5\(\$3\)/i.test(s)) {
      const rows = bd.contratos.filter((c) => c.id_miembro === params[0] && c.id_gimnasio === params[1]
        && c.canal === 'APP' && c.contenido === params[2]);
      return { rows };
    }
    if (/^INSERT INTO contrato_enviado/i.test(s)) {
      const app = /'APP', \$4\)/.test(s);
      const fila = app
        ? { id_miembro: params[0], id_gimnasio: params[1], enviado_por: null, telefono_destino: null, plantilla_version: params[2], exito: true, error_mensaje: null, canal: 'APP', contenido: params[3] }
        : { id_miembro: params[0], id_gimnasio: params[1], enviado_por: params[2], telefono_destino: params[3], plantilla_version: params[4], exito: params[5], error_mensaje: params[6], canal: 'WHATSAPP', contenido: params[7] };
      fila.id_contrato_enviado = bd.siguienteId++;
      fila.creado_en = ahora();
      bd.contratos.push(fila);
      return { rows: [{ id_contrato_enviado: fila.id_contrato_enviado, creado_en: fila.creado_en }] };
    }
    if (/^SELECT id_miembro FROM miembro WHERE id_miembro = \$1 AND id_gimnasio = \$2$/i.test(s)) {
      const m = bd.miembros.get(params[0]);
      return { rows: m && m.id_gimnasio === params[1] ? [{ id_miembro: m.id_miembro }] : [] };
    }
    if (/FROM contrato_enviado ce JOIN miembro m/i.test(s)) {
      return { rows: bd.contratos.filter((c) => c.id_miembro === params[0] && c.id_gimnasio === params[1]) };
    }

    throw new Error(`Consulta inesperada en la base falsa: ${s.slice(0, 160)}`);
  }

  bd.query = query;
  bd.connect = async () => {
    bd.conexiones += 1;
    return { query, release: () => {} };
  };
  bd.sqls = () => bd.log.map(([sql]) => sql.replace(/\s+/g, ' ').trim());
  return bd;
}

module.exports = { crearBdFalsa };
