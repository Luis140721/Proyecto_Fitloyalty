// test/retos_mensajes_test.dart
//
// RQF-12 en la app: los modelos leen lo que manda el backend.
//   - Reto: porcentaje_avance como numero o como texto (NUMERIC de pg),
//     fechas AAAA-MM-DD, `elegible` y los dias que faltan.
//   - Mensaje: la bandeja de GET /api/cliente/mensajes.

import 'package:flutter_test/flutter_test.dart';

import 'package:fitloyalty_cliente/cliente/models/gamificacion.dart';
import 'package:fitloyalty_cliente/cliente/models/mensaje.dart';

String _dia(int desplazamiento) {
  final d = DateTime.now().add(Duration(days: desplazamiento));
  return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

void main() {
  group('Reto.fromJson', () {
    Map<String, dynamic> base() => {
          'id_reto': 4,
          'nombre': 'Reto de noviembre',
          'fecha_inicio': _dia(-2),
          'fecha_fin': _dia(5),
          'meta_asistencias': 10,
          'recompensa': 'Camiseta',
          'participa': true,
          'checkins_acumulados': 4,
          'completado': false,
          'elegible': true,
        };

    test('porcentaje como numero', () {
      final r = Reto.fromJson({...base(), 'porcentaje_avance': 40});
      expect(r.porcentajeAvance, 40.0);
      expect(r.meta, 10);
      expect(r.premio, 'Camiseta');
      expect(r.elegible, isTrue);
    });

    test('porcentaje como texto (NUMERIC sin convertir)', () {
      expect(Reto.fromJson({...base(), 'porcentaje_avance': '40.00'}).porcentajeAvance, 40.0);
    });

    test('sin inscripcion: porcentaje nulo y no participa', () {
      final r = Reto.fromJson({...base(), 'participa': false, 'checkins_acumulados': null, 'porcentaje_avance': null});
      expect(r.participa, isFalse);
      expect(r.porcentajeAvance, isNull);
    });

    test('dias restantes y reto que no ha empezado', () {
      expect(Reto.fromJson(base()).diasRestantes, 5);
      expect(Reto.fromJson({...base(), 'fecha_fin': _dia(0)}).diasRestantes, 0);
      expect(Reto.fromJson(base()).porEmpezar, isFalse);
      expect(Reto.fromJson({...base(), 'fecha_inicio': _dia(1)}).porEmpezar, isTrue);
    });
  });

  group('Mensaje.fromJson', () {
    test('lee la fila de la bandeja', () {
      final m = Mensaje.fromJson({
        'id': 30,
        'tipo': 'RETO',
        'titulo': '¡Completaste un reto!',
        'mensaje': '¡Completaste el reto «Noviembre»!',
        'leida': false,
        'fecha_creacion': '2026-11-17T20:00:00.000Z',
      });
      expect(m.id, 30);
      expect(m.tipo, 'RETO');
      expect(m.leida, isFalse);
      expect(m.fecha, isNotNull);
      expect(m.copyWith(leida: true).leida, isTrue);
    });

    test('sin fecha ni tipo: valores por defecto', () {
      final m = Mensaje.fromJson({'id': 1, 'titulo': 'Hola', 'mensaje': 'x'});
      expect(m.tipo, 'SISTEMA');
      expect(m.fecha, isNull);
      expect(m.leida, isFalse);
    });
  });
}
