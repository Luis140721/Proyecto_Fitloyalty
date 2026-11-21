import { createRequire } from 'node:module';
import { exigirBdDePruebas } from '../../guardia-bd.cjs';
import { BD_PRUEBAS_URL } from './entorno.js';

// Acceso directo a la BD de pruebas, solo para lo que el API no deja controlar:
// el orden de dos peticiones dentro del backend. Usa el `pg` del backend (ya
// instalado alli), asi que e2e/ no suma dependencias. La guardia revisa la URL
// igual que en playwright.config.js.
const { Client } = createRequire(new URL('../../../backend/package.json', import.meta.url))('pg');

/**
 * Abre una transaccion que bloquea la fila del gimnasio con FOR UPDATE. Un INSERT
 * en miembro revisa su llave foranea (id_gimnasio) con FOR KEY SHARE, que choca
 * con FOR UPDATE: las altas de ese gimnasio esperan antes de insertar, mientras
 * que las consultas (como la revision del documento) siguen. Las de otros
 * gimnasios no se enteran, asi que no frena a los tests en paralelo.
 */
export async function retenerAltasDelGimnasio(idGimnasio) {
  exigirBdDePruebas(BD_PRUEBAS_URL, 'E2E_DATABASE_URL');
  const bd = new Client({ connectionString: BD_PRUEBAS_URL });
  await bd.connect();
  await bd.query('BEGIN');
  await bd.query('SELECT 1 FROM gimnasio WHERE id_gimnasio = $1 FOR UPDATE', [idGimnasio]);
  let abierta = true;
  return {
    /**
     * Sesiones de la BD que esperan, directa o indirectamente, por esta
     * transaccion: la primera alta espera por ella y la segunda por la primera.
     */
    async esperando() {
      const { rows } = await bd.query(`
        WITH RECURSIVE bloqueadas(pid) AS (
          SELECT pid FROM pg_stat_activity WHERE pg_backend_pid() = ANY (pg_blocking_pids(pid))
          UNION
          SELECT a.pid FROM pg_stat_activity a JOIN bloqueadas b ON b.pid = ANY (pg_blocking_pids(a.pid))
        )
        SELECT count(*)::int AS n FROM bloqueadas`);
      return rows[0].n;
    },
    /** Termina la transaccion: las altas retenidas siguen. */
    async soltar() {
      if (!abierta) return;
      abierta = false;
      try { await bd.query('ROLLBACK'); } finally { await bd.end(); }
    },
  };
}
