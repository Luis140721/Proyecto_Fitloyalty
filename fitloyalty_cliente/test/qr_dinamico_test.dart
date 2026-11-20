// Mismo calculo que backend/src/lib/qr-dinamico.js: si este vector cambia,
// el check-in deja de aceptar el QR de la app.
import 'package:flutter_test/flutter_test.dart';
import 'package:fitloyalty_cliente/cliente/utils/qr_dinamico.dart';

void main() {
  final secreto = List<int>.generate(32, (i) => i);

  test('vector fijo compartido con el backend (qr-dinamico.test.js)', () {
    expect(QrDinamico.codigoEnPaso(secreto, 59000000), '06530560');
  });

  test('el token tiene la forma FLD<id>T<8 digitos> y cambia cada 30 s', () {
    final qr = QrDinamico(secreto: secreto, idMiembro: 12);
    final t0 = DateTime.fromMillisecondsSinceEpoch(59000000 * 30 * 1000, isUtc: true);
    expect(qr.tokenEn(t0), 'FLD12T06530560');
    expect(qr.tokenEn(t0.add(const Duration(seconds: 29))), 'FLD12T06530560');
    expect(qr.tokenEn(t0.add(const Duration(seconds: 30))), isNot('FLD12T06530560'));
    expect(qr.segundosRestantes(t0), 30);
    expect(qr.segundosRestantes(t0.add(const Duration(seconds: 25))), 5);
  });

  test('fromJson corrige el reloj del telefono con la hora del servidor', () {
    final local = DateTime.fromMillisecondsSinceEpoch(1000000, isUtc: true);
    final qr = QrDinamico.fromJson({
      'secreto': '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      'id': 12,
      'paso_seg': 30,
      'digitos': 8,
      'prefijo': 'FLD',
      'hora_servidor_ms': 59000000 * 30 * 1000,
    }, ahora: local);
    expect(qr.secreto, secreto);
    expect(qr.tokenEn(local), 'FLD12T06530560');
  });
}
