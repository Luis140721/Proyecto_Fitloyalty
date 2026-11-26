/**
 * db/db.js: si se corta una conexion que esta en uso, el cliente de pg emite
 * 'error'. Sin oyente, Node termina el proceso y ni la ruta ni el job alcanzan
 * a manejarlo (#111: la campana no llegaba a reintentar la constancia).
 *
 * pg se reemplaza por un Pool minimo (EventEmitter): no abre conexiones.
 */
const { EventEmitter } = require('events');

jest.mock('pg', () => {
  const { EventEmitter: E } = require('events');
  return { Pool: class extends E {} };
});

test('should log the lost connection instead of ending the process when a client in use fails', () => {
  const registro = jest.spyOn(console, 'error').mockImplementation(() => {});
  const pool = require('../src/db/db');
  const cliente = new EventEmitter();

  pool.emit('connect', cliente);

  // Sin oyente, emit('error') lanza: es lo que tumbaba el proceso.
  expect(() => cliente.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow();
  expect(() => cliente.emit('error', new Error('otra vez'))).not.toThrow();
  expect(registro.mock.calls).toEqual([
    ['[DB] Se perdió una conexión:', 'Connection terminated unexpectedly'],
    ['[DB] Se perdió una conexión:', 'otra vez'],
  ]);
  expect(() => pool.emit('error', new Error('ociosa'))).not.toThrow();
  registro.mockRestore();
});
