// test/preferencias_comerciales_test.dart
//
// RQNF-16 (Ley 2300 de 2023) en la app: la tarjeta "Mensajes del gimnasio".
//   - Aceptar exige marcar antes al menos un canal: el interruptor no se puede
//     encender sin canal y no se elige WhatsApp por el miembro.
//   - Al encenderlo se guardan exactamente los canales marcados.
//   - Apagarlo cancela los mensajes comerciales sin pedir nada.
//   - Un menor no puede encenderlo, pero si apagarlo.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:fitloyalty_cliente/cliente/services/api_client.dart';
import 'package:fitloyalty_cliente/cliente/services/preferencias_service.dart';
import 'package:fitloyalty_cliente/cliente/widgets/preferencias_comerciales.dart';

/// Servicio sin red: guarda las preferencias en memoria, como el backend.
class _ServicioFalso extends PreferenciasService {
  _ServicioFalso({this.acepta = false, List<String>? canales, this.puedeAceptar = true})
    : canales = canales ?? [],
      super(api: ApiClient(baseUrl: 'http://prueba.local'));

  bool acepta;
  List<String> canales;
  final bool puedeAceptar;
  final guardados = <({bool? acepta, List<String>? canales})>[];

  PreferenciasComerciales _actual() => PreferenciasComerciales(
    aceptaComerciales: acepta,
    canalesAutorizados: List.of(canales),
    texto: 'Acepto recibir mensajes comerciales por los canales que marco.',
    horario: 'de lunes a viernes de 7:00 a. m. a 7:00 p. m.',
    puedeAceptar: puedeAceptar,
  );

  @override
  Future<PreferenciasComerciales> obtener() async => _actual();

  @override
  Future<({String mensaje, PreferenciasComerciales preferencias})> guardar({
    bool? aceptaComerciales,
    List<String>? canalesAutorizados,
  }) async {
    guardados.add((acepta: aceptaComerciales, canales: canalesAutorizados));
    if (aceptaComerciales != null) acepta = aceptaComerciales;
    if (canalesAutorizados != null) canales = List.of(canalesAutorizados);
    if (!acepta) canales = [];
    if (acepta && canales.isEmpty) {
      throw ApiException(status: 400, code: 'SIN_CANAL', message: 'Elige al menos un canal.');
    }
    return (mensaje: 'Guardado', preferencias: _actual());
  }
}

Future<void> _montar(WidgetTester tester, _ServicioFalso s) async {
  await tester.pumpWidget(
    MaterialApp(
      // La clave por servicio hace que cada montaje sea una tarjeta nueva.
      home: Scaffold(
        body: SingleChildScrollView(
          child: PreferenciasComercialesCard(key: ObjectKey(s), service: s),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

SwitchListTile _interruptor(WidgetTester tester) =>
    tester.widget<SwitchListTile>(find.byKey(const Key('interruptor-comerciales')));

void main() {
  testWidgets('sin canal marcado el interruptor no se puede encender ni se marca WhatsApp solo', (tester) async {
    final s = _ServicioFalso();
    await _montar(tester, s);
    expect(_interruptor(tester).value, isFalse);
    expect(_interruptor(tester).onChanged, isNull);
    expect(find.textContaining('marca primero WhatsApp, correo o los dos'), findsOneWidget);
    await tester.tap(find.byKey(const Key('interruptor-comerciales')));
    await tester.pumpAndSettle();
    expect(s.guardados, isEmpty);
    expect(tester.widget<FilterChip>(find.byKey(const Key('canal-WHATSAPP'))).selected, isFalse);
  });

  testWidgets('al marcar un canal con el interruptor apagado no se guarda nada; al encenderlo se guarda ese canal', (
    tester,
  ) async {
    final s = _ServicioFalso();
    await _montar(tester, s);
    await tester.tap(find.byKey(const Key('canal-EMAIL')));
    await tester.pumpAndSettle();
    expect(s.guardados, isEmpty);
    expect(_interruptor(tester).onChanged, isNotNull);

    await tester.tap(find.byKey(const Key('interruptor-comerciales')));
    await tester.pumpAndSettle();
    expect(s.guardados.single.acepta, isTrue);
    expect(s.guardados.single.canales, ['EMAIL']);
    expect(_interruptor(tester).value, isTrue);
  });

  testWidgets('apagarlo cancela los mensajes comerciales', (tester) async {
    final s = _ServicioFalso(acepta: true, canales: ['WHATSAPP']);
    await _montar(tester, s);
    expect(_interruptor(tester).value, isTrue);
    await tester.tap(find.byKey(const Key('interruptor-comerciales')));
    await tester.pumpAndSettle();
    expect(s.guardados.single.acepta, isFalse);
    expect(_interruptor(tester).value, isFalse);
    expect(tester.widget<FilterChip>(find.byKey(const Key('canal-WHATSAPP'))).selected, isFalse);
  });

  testWidgets('con el interruptor encendido no deja quitar el ultimo canal', (tester) async {
    final s = _ServicioFalso(acepta: true, canales: ['WHATSAPP']);
    await _montar(tester, s);
    await tester.tap(find.byKey(const Key('canal-WHATSAPP')));
    await tester.pumpAndSettle();
    expect(s.guardados, isEmpty);
    expect(find.textContaining('Deja al menos un canal'), findsOneWidget);
  });

  testWidgets('un menor no puede encenderlo pero si apagarlo', (tester) async {
    final apagado = _ServicioFalso(puedeAceptar: false);
    await _montar(tester, apagado);
    expect(_interruptor(tester).onChanged, isNull);
    expect(tester.widget<FilterChip>(find.byKey(const Key('canal-EMAIL'))).onSelected, isNull);

    final encendido = _ServicioFalso(acepta: true, canales: ['WHATSAPP'], puedeAceptar: false);
    await _montar(tester, encendido);
    expect(_interruptor(tester).onChanged, isNotNull);
    await tester.tap(find.byKey(const Key('interruptor-comerciales')));
    await tester.pumpAndSettle();
    expect(encendido.guardados.single.acepta, isFalse);
  });
}
