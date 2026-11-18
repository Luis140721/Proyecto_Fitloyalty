// lib/cliente/models/mensaje.dart
//
// Mensaje del gimnasio para el miembro (bandeja de la app, issue #46).
// Viene de GET /api/cliente/mensajes: filas de la tabla notificacion con
// destinatario = 'MIEMBRO'.
//
//   BD / JSON: id (id_notificacion), tipo (ALERTA | RETO | CAMPANA | SISTEMA),
//              titulo, mensaje, leida, fecha_creacion

class Mensaje {
  final int id;
  final String tipo;
  final String titulo;
  final String mensaje;
  final bool leida;
  final DateTime? fecha;

  const Mensaje({
    required this.id,
    required this.tipo,
    required this.titulo,
    required this.mensaje,
    required this.leida,
    this.fecha,
  });

  Mensaje copyWith({bool? leida}) => Mensaje(
        id: id,
        tipo: tipo,
        titulo: titulo,
        mensaje: mensaje,
        leida: leida ?? this.leida,
        fecha: fecha,
      );

  factory Mensaje.fromJson(Map<String, dynamic> json) {
    return Mensaje(
      id:      (json['id'] as num).toInt(),
      tipo:    json['tipo']    as String? ?? 'SISTEMA',
      titulo:  json['titulo']  as String? ?? '',
      mensaje: json['mensaje'] as String? ?? '',
      leida:   json['leida']   as bool? ?? false,
      fecha:   json['fecha_creacion'] == null
        ? null : DateTime.tryParse(json['fecha_creacion'].toString())?.toLocal(),
    );
  }
}
