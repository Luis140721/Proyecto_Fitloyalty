// lib/cliente/models/miembro.dart
//
// Modelo del miembro autenticado. Viene de GET /api/cliente/me y de
// POST /api/cliente/login (en login viene anidado en `miembro`).

class Miembro {
  final int id;
  final int gymId;
  final String nombre;
  final String documento;
  final String? telefono;
  final String? email;
  final String codigoQr;
  final String? qrImagenDataUrl;   // data:image/png;base64,... o null
  final String? fotoUrl;
  final bool activo;
  final DateTime? fechaRegistro;
  final bool appAcceso;

  // Datos del gimnasio (para mostrar en el header / drawer).
  final GimnasioResumen? gimnasio;

  const Miembro({
    required this.id,
    required this.gymId,
    required this.nombre,
    required this.documento,
    required this.codigoQr,
    required this.activo,
    required this.appAcceso,
    this.telefono,
    this.email,
    this.qrImagenDataUrl,
    this.fotoUrl,
    this.fechaRegistro,
    this.gimnasio,
  });

  /// Iniciales para avatar (ej. "Carlos Perez" -> "CP").
  String get iniciales {
    final parts = nombre.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts[0].substring(0, 1).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  factory Miembro.fromJson(Map<String, dynamic> json) {
    final gimnasioRaw = json['gimnasio'];
    return Miembro(
      id:           json['id']            as int,
      gymId:        json['gymId']         as int,
      nombre:       json['nombre']        as String,
      documento:    json['documento']     as String,
      telefono:     json['telefono']      as String?,
      email:        json['email']         as String?,
      codigoQr:     json['codigoQr']      as String? ?? '',
      qrImagenDataUrl: json['qrImagen']   as String?,
      fotoUrl:      json['fotoUrl']       as String?,
      activo:       json['activo']        as bool? ?? true,
      appAcceso:    json['appAcceso']     as bool? ?? true,
      fechaRegistro: _parseFecha(json['fechaRegistro']),
      gimnasio:     gimnasioRaw is Map<String, dynamic>
        ? GimnasioResumen.fromJson(gimnasioRaw)
        : null,
    );
  }

  Miembro copyWith({
    String? nombre,
    String? telefono,
    String? email,
    String? fotoUrl,
    String? qrImagenDataUrl,
    GimnasioResumen? gimnasio,
  }) {
    return Miembro(
      id: id, gymId: gymId, nombre: nombre ?? this.nombre,
      documento: documento, telefono: telefono ?? this.telefono,
      email: email ?? this.email, codigoQr: codigoQr,
      qrImagenDataUrl: qrImagenDataUrl ?? this.qrImagenDataUrl,
      fotoUrl: fotoUrl ?? this.fotoUrl, activo: activo,
      appAcceso: appAcceso, fechaRegistro: fechaRegistro,
      gimnasio: gimnasio ?? this.gimnasio,
    );
  }

  static DateTime? _parseFecha(dynamic v) {
    if (v == null) return null;
    if (v is DateTime) return v;
    return DateTime.tryParse(v.toString());
  }
}

class GimnasioResumen {
  final int id;
  final String nombre;
  final String? logoUrl;
  final String? telefono;
  final String? direccion;
  final String? planActivo;

  const GimnasioResumen({
    required this.id,
    required this.nombre,
    this.logoUrl,
    this.telefono,
    this.direccion,
    this.planActivo,
  });

  factory GimnasioResumen.fromJson(Map<String, dynamic> json) {
    return GimnasioResumen(
      id:        json['id']        as int,
      nombre:    json['nombre']    as String? ?? '',
      logoUrl:   json['logoUrl']   as String?,
      telefono:  json['telefono']  as String?,
      direccion: json['direccion'] as String?,
      planActivo: json['planActivo'] as String?,
    );
  }
}
