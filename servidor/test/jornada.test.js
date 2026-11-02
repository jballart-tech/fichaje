const test = require('node:test');
const assert = require('node:assert');
const { estadoTras, transicionValida, resumenHoras } = require('../src/jornada');

test('secuencia de estados', () => {
  assert.equal(estadoTras([]).estado, 'fuera');
  assert.equal(estadoTras([{ tipo: 'entrada', obra_id: 3 }]).obra_id, 3);
  assert.equal(estadoTras([{ tipo: 'entrada' }, { tipo: 'pausa' }]).estado, 'pausa');
  assert.ok(transicionValida('fuera', 'entrada'));
  assert.ok(!transicionValida('fuera', 'salida'));
  assert.ok(!transicionValida('pausa', 'cambio_obra'));
  assert.ok(transicionValida('pausa', 'salida'));
});

test('resumen de horas con pausa y cambio de obra', () => {
  const f = (tipo, hora, obra_id = null, obra = null) => ({ trabajador_id: 1, trabajador: 'A', tipo, hora_fichaje: hora, obra_id, obra });
  const filas = resumenHoras([
    f('entrada', '2026-11-02T07:00:00Z', 1, 'Nave'),
    f('pausa', '2026-11-02T09:00:00Z'),
    f('reanudar', '2026-11-02T09:30:00Z'),
    f('cambio_obra', '2026-11-02T11:00:00Z', 2, 'Cuadro'),
    f('salida', '2026-11-02T15:00:00Z'),
    f('salida', '2026-11-02T16:00:00Z'), // incidencia: no suma
  ]);
  const nave = filas.find(x => x.obra_id === 1);
  const cuadro = filas.find(x => x.obra_id === 2);
  assert.equal(nave.minutos_trabajo, 210);
  assert.equal(nave.minutos_pausa, 30);
  assert.equal(cuadro.minutos_trabajo, 240);
  assert.equal(nave.fecha, '2026-11-02');
});

test('jornada abierta cuenta hasta ahora', () => {
  const filas = resumenHoras(
    [{ trabajador_id: 1, trabajador: 'A', tipo: 'entrada', hora_fichaje: '2026-11-02T07:00:00Z' }],
    'Europe/Madrid',
    new Date('2026-11-02T08:00:00Z'),
  );
  assert.equal(filas[0].minutos_trabajo, 60);
  assert.equal(filas[0].abierta, true);
});
