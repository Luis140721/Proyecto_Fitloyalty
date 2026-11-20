/**
 * tests/integracion/entorno-del-proceso.js
 *
 * setupFiles de jest.config.js: corre antes de cada archivo de test, antes de
 * que su codigo pueda cargar dotenv. Guarda la DATABASE_URL del entorno del
 * proceso, la que exporta quien corre los tests o el job del CI.
 *
 * La de backend/.env (la de desarrollo) nunca llega aqui: dotenv la carga
 * despues, y Jest empieza cada archivo con el entorno del proceso, sin lo que
 * otro archivo haya cargado. tests/integracion/bd-pruebas.js usa este valor y
 * no process.env, asi que backend/.env no puede activar los tests de
 * integracion.
 */
globalThis.DATABASE_URL_DEL_PROCESO = process.env.DATABASE_URL;
