// lib/cliente/models/gamificacion.dart
//
// Gamificacion y retos del miembro.
// Vienen de GET /api/cliente/gamificacion y GET /api/cliente/retos.
//
// Mapeo de campos (la BD tiene nombres diferentes a los del front):
//   Hito:
//     BD: id_hito, nombre, tipo_hito, valor_objetivo, mensaje
//     JSON viene con esos nombres del backend (que ya calcula puntos).
//     Se mapean a Hito.idHito, Hito.nombre, Hito.tipoHito, Hito.descripcion (mensaje), Hito.puntos.
//
//   Reto:
//     BD: id_reto, nombre, descripcion, fecha_inicio, fecha_fin,
//         meta_asistencias, recompensa, estado
//     reto_miembro: checkins_acumulados, porcentaje_avance, estado (EN_CURSO/COMPLETADO/CANCELADO),
//                   fecha_completado
//     Se mapean a Reto.meta (meta_asistencias), Reto.premio (recompensa), etc.
//     `participa`: ya esta inscrito (entra solo con su primer ingreso dentro de
//     las fechas); `elegible`: hoy es del segmento del reto (RQF-12).
//     porcentaje_avance es NUMERIC: el backend lo manda como numero, pero
//     se acepta tambien como texto ("40.00") por si viene de una version vieja.

class GamificacionResumen {
  final int puntosTotales;
  final int totalHitos;
  final int totalLogrados;
  final int porcentaje;       // 0-100

  const GamificacionResumen({
    this.puntosTotales = 0,
    this.totalHitos = 0,
    this.totalLogrados = 0,
    this.porcentaje = 0,
  });

  factory GamificacionResumen.fromJson(Map<String, dynamic> json) {
    return GamificacionResumen(
      puntosTotales: (json['puntosTotales'] as num?)?.toInt() ?? 0,
      totalHitos:    (json['totalHitos']    as num?)?.toInt() ?? 0,
      totalLogrados: (json['totalLogrados'] as num?)?.toInt() ?? 0,
      porcentaje:    (json['porcentaje']    as num?)?.toInt() ?? 0,
    );
  }
}

class Hito {
  final int idHito;
  final String nombre;
  final String? tipoHito;       // 'RACHA' | 'TOTAL_ASISTENCIAS'
  final String? descripcion;    // viene del campo `mensaje` de la BD
  final int puntos;
  final bool logrado;
  final DateTime? fechaOtorgado; // viene del campo `fecha_logro` de hito_miembro

  const Hito({
    required this.idHito,
    required this.nombre,
    required this.puntos,
    required this.logrado,
    this.tipoHito,
    this.descripcion,
    this.fechaOtorgado,
  });

  factory Hito.fromJson(Map<String, dynamic> json) {
    return Hito(
      idHito:        (json['id_hito']        as num).toInt(),
      nombre:        json['nombre']          as String? ?? '',
      tipoHito:      json['tipo_hito']       as String?,
      descripcion:   json['mensaje']         as String?,  // backend envia `mensaje` mapeado a descripcion
      puntos:        (json['puntos']         as num?)?.toInt() ?? 0,
      logrado:       json['logrado']         as bool? ?? false,
      fechaOtorgado: json['fecha_logro'] == null
        ? null : DateTime.tryParse(json['fecha_logro'].toString()),
    );
  }
}

class Reto {
  final int idReto;
  final String nombre;
  final String? descripcion;
  final DateTime fechaInicio;
  final DateTime fechaFin;
  final int? meta;           // meta_asistencias (numero de checkins requeridos)
  final String? premio;      // recompensa
  final bool participa;
  final int? checkinsAcumulados;
  final double? porcentajeAvance;
  final bool completado;
  final DateTime? fechaCompletado;
  final bool elegible;

  const Reto({
    required this.idReto,
    required this.nombre,
    required this.fechaInicio,
    required this.fechaFin,
    required this.participa,
    this.descripcion,
    this.meta,
    this.premio,
    this.checkinsAcumulados,
    this.porcentajeAvance,
    this.completado = false,
    this.fechaCompletado,
    this.elegible = false,
  });

  /// Dias que faltan para que termine, contando el de hoy como el ultimo si
  /// termina hoy (0). Negativo si ya cerro.
  int get diasRestantes {
    final ahora = DateTime.now();
    final hoy = DateTime(ahora.year, ahora.month, ahora.day);
    final fin = DateTime(fechaFin.year, fechaFin.month, fechaFin.day);
    return fin.difference(hoy).inDays;
  }

  /// Todavia no empieza (reto programado).
  bool get porEmpezar {
    final ahora = DateTime.now();
    return DateTime(fechaInicio.year, fechaInicio.month, fechaInicio.day)
        .isAfter(DateTime(ahora.year, ahora.month, ahora.day));
  }

  static double? _numero(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString());
  }

  factory Reto.fromJson(Map<String, dynamic> json) {
    return Reto(
      idReto:             (json['id_reto'] as num).toInt(),
      nombre:             json['nombre']             as String? ?? '',
      descripcion:        json['descripcion']        as String?,
      fechaInicio:        DateTime.parse(json['fecha_inicio'] as String),
      fechaFin:           DateTime.parse(json['fecha_fin']    as String),
      meta:               (json['meta_asistencias']  as num?)?.toInt(),
      premio:             json['recompensa']         as String?,
      participa:          json['participa']          as bool? ?? false,
      checkinsAcumulados: (json['checkins_acumulados'] as num?)?.toInt(),
      porcentajeAvance:   _numero(json['porcentaje_avance']),
      completado:         json['completado']         as bool? ?? false,
      fechaCompletado:    json['fecha_completado'] == null
        ? null : DateTime.tryParse(json['fecha_completado'].toString())?.toLocal(),
      elegible:           json['elegible']           as bool? ?? false,
    );
  }
}
