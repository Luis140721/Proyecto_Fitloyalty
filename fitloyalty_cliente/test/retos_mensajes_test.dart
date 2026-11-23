// test/retos_mensajes_test.dart
//
// RQF-12 en la app del miembro:
//   - Reto: lee porcentaje_avance como numero o como texto (NUMERIC de pg),
//     las fechas AAAA-MM-DD, los completados que ya no estan vigentes y los
//     dias que faltan.
//   - Mensaje: la fila de la bandeja (GET /api/cliente/mensajes).
//   - MensajesProvider: carga, marcar uno o todos, limpiar al cambiar de
//     miembro y que un error al refrescar en silencio no borre la lista.
//   - Pantalla de mensajes y contador de la pestaña.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'package:fitloyalty_cliente/cliente/models/gamificacion.dart';
import 'package:fitloyalty_cliente/cliente/models/mensaje.dart';
import 'package:fitloyalty_cliente/cliente/providers/mensajes_provider.dart';
import 'package:fitloyalty_cliente/cliente/screens/home_screen.dart';
import 'package:fitloyalty_cliente/cliente/screens/mensajes_screen.dart';
import 'package:fitloyalty_cliente/cliente/services/api_client.dart';
import 'package:fitloyalty_cliente/cliente/services/mensajes_service.dart';

String _dia(int desplazamiento) {
  final d = DateTime.now().add(Duration(days: desplazamiento));
  return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

/// Servicio sin red: guarda los mensajes en memoria, como el backend.
class _ServicioFalso extends MensajesService {
  _ServicioFalso(this.lista) : super(api: ApiClient(baseUrl: 'http://prueba.local'));

  List<Mensaje> lista;
  bool falla = false;

  int get _sinLeer => lista.where((m) => !m.leida).length;

  @override
  Future<({List<Mensaje> mensajes, int noLeidos})> listar({int limit = 50}) async {
    if (falla) throw ApiException(status: 503, code: 'DB_UNREACHABLE', message: 'Sin conexion');
    return (mensajes: List<Mensaje>.of(lista), noLeidos: _sinLeer);
  }

  @override
  Future<int> marcarLeido(int id) async {
    lista = [for (final m in lista) m.id == id ? m.copyWith(leida: true) : m];
    return _sinLeer;
  }

  @override
  Future<void> marcarTodos() async {
    lista = [for (final m in lista) m.copyWith(leida: true)];
  }
}

Mensaje _mensaje(int id, {bool leida = false, String titulo = '¡Completaste un reto!'}) => Mensaje(
      id: id,
      tipo: 'RETO',
      titulo: titulo,
      mensaje: '¡Completaste el reto «Reto $id»!',
      leida: leida,
      fecha: DateTime(2026, 11, 20, 10),
    );

void main() {
  setUpAll(() => initializeDateFormatting('es_CO', null));

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
          'vigente': true,
        };

    test('porcentaje como numero', () {
      final r = Reto.fromJson({...base(), 'porcentaje_avance': 40});
      expect(r.porcentajeAvance, 40.0);
      expect(r.meta, 10);
      expect(r.premio, 'Camiseta');
      expect(r.vigente, isTrue);
    });

    test('porcentaje como texto (NUMERIC sin convertir) ya no rompe la lista', () {
      expect(Reto.fromJson({...base(), 'porcentaje_avance': '40.00'}).porcentajeAvance, 40.0);
    });

    test('sin inscripcion: porcentaje nulo y no participa', () {
      final r = Reto.fromJson({...base(), 'participa': false, 'checkins_acumulados': null, 'porcentaje_avance': null});
      expect(r.participa, isFalse);
      expect(r.porcentajeAvance, isNull);
    });

    test('completado de un reto que ya termino', () {
      final r = Reto.fromJson({
        ...base(),
        'fecha_inicio': _dia(-20),
        'fecha_fin': _dia(-3),
        'completado': true,
        'vigente': false,
        'porcentaje_avance': 100,
        'fecha_completado': '2026-11-10T15:00:00.000Z',
      });
      expect(r.completado, isTrue);
      expect(r.vigente, isFalse);
      expect(r.fechaCompletado, isNotNull);
      expect(r.diasRestantes, -3);
    });

    test('dias restantes por dias de calendario', () {
      expect(Reto.fromJson(base()).diasRestantes, 5);
      expect(Reto.fromJson({...base(), 'fecha_fin': _dia(0)}).diasRestantes, 0);
      expect(Reto.fromJson({...base(), 'fecha_fin': _dia(1)}).diasRestantes, 1);
    });

    test('una version vieja del backend sin `vigente`: se toma como vigente', () {
      final sinCampo = Map<String, dynamic>.of(base())..remove('vigente');
      expect(Reto.fromJson(sinCampo).vigente, isTrue);
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

  group('MensajesProvider', () {
    test('carga, marca uno y despues todos', () async {
      final servicio = _ServicioFalso([_mensaje(1), _mensaje(2), _mensaje(3, leida: true)]);
      final p = MensajesProvider(service: servicio);
      await p.cargar();
      expect(p.mensajes, hasLength(3));
      expect(p.noLeidos, 2);

      await p.marcarLeido(p.mensajes.first);
      expect(p.noLeidos, 1);
      expect(p.mensajes.first.leida, isTrue);

      await p.marcarTodos();
      expect(p.noLeidos, 0);
      expect(servicio.lista.every((m) => m.leida), isTrue);
    });

    test('limpiar borra lo del miembro anterior', () async {
      final p = MensajesProvider(service: _ServicioFalso([_mensaje(1)]));
      await p.cargar();
      expect(p.noLeidos, 1);
      p.limpiar();
      expect(p.mensajes, isEmpty);
      expect(p.noLeidos, 0);
    });

    test('un error al refrescar en silencio no borra la lista ni muestra error', () async {
      final servicio = _ServicioFalso([_mensaje(1)]);
      final p = MensajesProvider(service: servicio);
      await p.cargar();
      servicio.falla = true;
      await p.cargar(silencioso: true);
      expect(p.mensajes, hasLength(1));
      expect(p.error, isNull);
      await p.cargar();
      expect(p.error, 'Sin conexion');
    });
  });

  group('pantalla', () {
    testWidgets('la bandeja lista los mensajes y tocar uno lo marca como leido', (tester) async {
      final p = MensajesProvider(service: _ServicioFalso([
        _mensaje(1),
        _mensaje(2, titulo: 'Reto cancelado'),
      ]));
      await p.cargar();
      await tester.pumpWidget(ChangeNotifierProvider<MensajesProvider>.value(
        value: p,
        child: const MaterialApp(home: MensajesScreen()),
      ));
      expect(find.text('¡Completaste un reto!'), findsOneWidget);
      expect(find.text('Reto cancelado'), findsOneWidget);
      expect(find.text('Marcar todo como leido'), findsOneWidget);

      await tester.tap(find.text('Reto cancelado'));
      await tester.pumpAndSettle();
      expect(p.noLeidos, 1);

      await tester.tap(find.text('Marcar todo como leido'));
      await tester.pumpAndSettle();
      expect(p.noLeidos, 0);
      expect(find.text('Marcar todo como leido'), findsNothing);
    });

    testWidgets('sin mensajes muestra el estado vacio', (tester) async {
      final p = MensajesProvider(service: _ServicioFalso([]));
      await p.cargar();
      await tester.pumpWidget(ChangeNotifierProvider<MensajesProvider>.value(
        value: p,
        child: const MaterialApp(home: MensajesScreen()),
      ));
      expect(find.text('Sin mensajes'), findsOneWidget);
    });

    testWidgets('contador de la pestaña: numero, 99+ y nada sin mensajes nuevos', (tester) async {
      Future<void> pintar(int n) => tester.pumpWidget(
            MaterialApp(home: Scaffold(body: Center(child: IconoMensajes(noLeidos: n)))),
          );
      await pintar(3);
      expect(find.text('3'), findsOneWidget);
      await pintar(150);
      expect(find.text('99+'), findsOneWidget);
      await pintar(0);
      expect(find.text('0'), findsNothing);
    });
  });
}
