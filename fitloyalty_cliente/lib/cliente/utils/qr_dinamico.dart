// lib/cliente/utils/qr_dinamico.dart
//
// QR dinamico del miembro: un codigo que cambia cada 30 segundos (estilo TOTP,
// RFC 6238, con HMAC-SHA256). Es el mismo calculo de
// backend/src/lib/qr-dinamico.js:
//
//   paso   = floor(segundos_unix / 30)
//   codigo = 8 digitos de HMAC-SHA256(secreto, paso) (truncado RFC 4226)
//   QR     = FLD<id_miembro>T<codigo>
//
// El secreto llega una vez en GET /api/cliente/qr; despues el codigo se
// calcula en el telefono, sin internet. Una captura de pantalla deja de servir
// a los pocos segundos. La hora del servidor viene en la misma respuesta para
// corregir un reloj del telefono que no este exacto.

import 'dart:typed_data';

import 'package:crypto/crypto.dart';

class QrDinamico {
  final List<int> secreto;
  final int pasoSeg;
  final int digitos;
  final String prefijo;
  final int idMiembro;

  /// Diferencia (ms) entre la hora del servidor y la del telefono.
  final int desfaseMs;

  const QrDinamico({
    required this.secreto,
    required this.idMiembro,
    this.pasoSeg = 30,
    this.digitos = 8,
    this.prefijo = 'FLD',
    this.desfaseMs = 0,
  });

  factory QrDinamico.fromJson(Map<String, dynamic> json, {DateTime? ahora}) {
    final hex = json['secreto'] as String? ?? '';
    final local = (ahora ?? DateTime.now()).millisecondsSinceEpoch;
    final servidor = (json['hora_servidor_ms'] as num?)?.toInt();
    return QrDinamico(
      secreto: hexABytes(hex),
      idMiembro: (json['id'] as num).toInt(),
      pasoSeg: (json['paso_seg'] as num?)?.toInt() ?? 30,
      digitos: (json['digitos'] as num?)?.toInt() ?? 8,
      prefijo: json['prefijo'] as String? ?? 'FLD',
      desfaseMs: servidor == null ? 0 : servidor - local,
    );
  }

  static List<int> hexABytes(String hex) {
    final limpio = hex.trim();
    final out = <int>[];
    for (var i = 0; i + 1 < limpio.length; i += 2) {
      out.add(int.parse(limpio.substring(i, i + 2), radix: 16));
    }
    return out;
  }

  /// Codigo de `digitos` cifras para un paso (truncado dinamico, RFC 4226).
  static String codigoEnPaso(List<int> secreto, int paso, {int digitos = 8}) {
    // Contador de 8 bytes big-endian. Se escribe en dos mitades de 32 bits
    // para que tambien funcione en web, donde setUint64 no existe.
    final contador = ByteData(8)
      ..setUint32(0, (paso ~/ 0x100000000) & 0xffffffff)
      ..setUint32(4, paso & 0xffffffff);
    final h = Hmac(sha256, secreto).convert(contador.buffer.asUint8List()).bytes;
    final offset = h[h.length - 1] & 0x0f;
    final numero = ((h[offset] & 0x7f) << 24) |
        (h[offset + 1] << 16) |
        (h[offset + 2] << 8) |
        h[offset + 3];
    var modulo = 1;
    for (var i = 0; i < digitos; i++) {
      modulo *= 10;
    }
    return (numero % modulo).toString().padLeft(digitos, '0');
  }

  DateTime ahoraServidor([DateTime? ahora]) =>
      (ahora ?? DateTime.now()).add(Duration(milliseconds: desfaseMs));

  int pasoEn([DateTime? ahora]) =>
      ahoraServidor(ahora).millisecondsSinceEpoch ~/ 1000 ~/ pasoSeg;

  /// Texto que va dentro del QR en este momento.
  String tokenEn([DateTime? ahora]) =>
      '$prefijo${idMiembro}T${codigoEnPaso(secreto, pasoEn(ahora), digitos: digitos)}';

  /// Segundos que le quedan al codigo actual (de pasoSeg a 1).
  int segundosRestantes([DateTime? ahora]) {
    final s = ahoraServidor(ahora).millisecondsSinceEpoch ~/ 1000;
    return pasoSeg - (s % pasoSeg);
  }
}
