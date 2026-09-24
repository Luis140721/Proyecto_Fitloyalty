// lib/cliente/models/asistencia.dart
//
// Historial de check-ins del miembro autenticado.
// Viene de GET /api/cliente/asistencia.

class AsistenciaResumen {
  final int total;
  final int hoy;
  final int esteMes;

  const AsistenciaResumen({this.total = 0, this.hoy = 0, this.esteMes = 0});

  factory AsistenciaResumen.fromJson(Map<String, dynamic> json) {
    return AsistenciaResumen(
      total:    (json['total']    as num?)?.toInt() ?? 0,
      hoy:      (json['hoy']      as num?)?.toInt() ?? 0,
      esteMes:  (json['este_mes'] as num?)?.toInt() ?? 0,
    );
  }
}

class Checkin {
  final int idCheckin;
  final DateTime fechaHora;
  final String metodo;      // QR / CODIGOBARRAS / MANUAL
  final String? observacion;

  const Checkin({
    required this.idCheckin,
    required this.fechaHora,
    required this.metodo,
    this.observacion,
  });

  /// Etiqueta legible del metodo en espanol.
  String get metodoLegible {
    switch (metodo.toUpperCase()) {
      case 'QR':           return 'QR';
      case 'CODIGOBARRAS': return 'Codigo de barras';
      case 'MANUAL':       return 'Manual';
      default:             return metodo;
    }
  }

  factory Checkin.fromJson(Map<String, dynamic> json) {
    return Checkin(
      idCheckin:  (json['id_checkin'] as num).toInt(),
      fechaHora:  DateTime.parse(json['fecha_hora'] as String),
      metodo:     json['metodo'] as String? ?? 'QR',
      observacion: json['observacion'] as String?,
    );
  }
}
