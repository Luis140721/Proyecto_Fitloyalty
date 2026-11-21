// lib/cliente/models/legal.dart
//
// Modelos de RQNF-17 (autorizaciones del miembro) y RQNF-18 (contrato).
//   - Autorizacion / AutorizacionesResumen: GET /api/cliente/autorizaciones
//   - Contrato / ContratoSeccion:           GET /api/cliente/contrato

DateTime? _toDate(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString())?.toLocal();
}

/// Nombre legible de cada tipo de autorizacion.
const nombresAutorizacion = <String, String>{
  'TERMINOS': 'Contrato y términos',
  'TRATAMIENTO_DATOS': 'Tratamiento de datos',
  'DATOS_SENSIBLES': 'Datos de salud (opcional)',
  'REPRESENTANTE_MENOR': 'Representante legal',
  'MENSAJES_COMERCIALES': 'Mensajes comerciales',
};

class Autorizacion {
  final String tipo;
  final bool otorgada;
  final String? version;
  final String? canal;          // PANEL, APP o ENLACE (baja de mensajes comerciales, RQNF-16)
  final DateTime? fecha;
  final String? registradaPor;  // usuario del gimnasio (null si fue en la app)
  final String? texto;          // texto que se le mostro, segun la version
  final bool porRepresentante;

  const Autorizacion({
    required this.tipo,
    required this.otorgada,
    this.version,
    this.canal,
    this.fecha,
    this.registradaPor,
    this.texto,
    this.porRepresentante = false,
  });

  String get nombre => nombresAutorizacion[tipo] ?? tipo;

  String get canalLegible => switch (canal) {
        'APP' => 'en la app',
        'ENLACE' => 'con el enlace de baja',
        _ => 'en el gimnasio',
      };

  factory Autorizacion.fromJson(Map<String, dynamic> json) {
    final detalle = json['detalle'];
    return Autorizacion(
      tipo:          json['tipo'] as String? ?? '',
      otorgada:      json['otorgada'] == true,
      version:       json['version'] as String?,
      canal:         json['canal'] as String?,
      fecha:         _toDate(json['fecha']),
      registradaPor: json['registrada_por'] as String?,
      texto:         json['texto'] as String?,
      porRepresentante: detalle is Map && detalle['otorgada_por'] == 'REPRESENTANTE_LEGAL',
    );
  }
}

class AutorizacionesResumen {
  final Map<String, Autorizacion?> vigentes;
  final List<Autorizacion> historial;
  final Map<String, String> textosActuales;
  final bool menorDeEdad;
  final String? representanteNombre;
  final bool puedeOtorgarSensibles;
  final bool puedeRevocarSensibles;

  const AutorizacionesResumen({
    this.vigentes = const {},
    this.historial = const [],
    this.textosActuales = const {},
    this.menorDeEdad = false,
    this.representanteNombre,
    this.puedeOtorgarSensibles = false,
    this.puedeRevocarSensibles = false,
  });

  Autorizacion? operator [](String tipo) => vigentes[tipo];

  factory AutorizacionesResumen.fromJson(Map<String, dynamic> json) {
    final rawVig = (json['vigentes'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    final vigentes = <String, Autorizacion?>{
      for (final e in rawVig.entries)
        e.key: e.value == null ? null : Autorizacion.fromJson((e.value as Map).cast<String, dynamic>()),
    };
    final historial = (json['historial'] as List<dynamic>? ?? const [])
        .map((e) => Autorizacion.fromJson((e as Map).cast<String, dynamic>()))
        .toList(growable: false);
    final textos = (json['textos_actuales'] as Map?)?.map(
          (k, v) => MapEntry(k.toString(), v.toString()),
        ) ??
        const <String, String>{};
    final rep = json['representante'];
    return AutorizacionesResumen(
      vigentes: vigentes,
      historial: historial,
      textosActuales: textos,
      menorDeEdad: json['menor_de_edad'] == true,
      representanteNombre: rep is Map ? rep['nombre']?.toString() : null,
      puedeOtorgarSensibles: json['puede_otorgar_datos_sensibles'] == true,
      puedeRevocarSensibles: json['puede_revocar_datos_sensibles'] == true,
    );
  }
}

class ContratoSeccion {
  final int numero;
  final String titulo;
  final String texto;

  const ContratoSeccion({required this.numero, required this.titulo, required this.texto});

  factory ContratoSeccion.fromJson(Map<String, dynamic> json) => ContratoSeccion(
        numero: (json['numero'] as num?)?.toInt() ?? 0,
        titulo: json['titulo'] as String? ?? '',
        texto:  json['texto'] as String? ?? '',
      );
}

class Contrato {
  final String version;
  final String gimnasio;
  final List<ContratoSeccion> secciones;
  final String texto;
  final DateTime? entregadoEn;

  const Contrato({
    required this.version,
    required this.gimnasio,
    required this.secciones,
    required this.texto,
    this.entregadoEn,
  });

  factory Contrato.fromJson(Map<String, dynamic> json) => Contrato(
        version:   json['version'] as String? ?? '',
        gimnasio:  json['gimnasio'] as String? ?? '',
        secciones: (json['secciones'] as List<dynamic>? ?? const [])
            .map((e) => ContratoSeccion.fromJson((e as Map).cast<String, dynamic>()))
            .toList(growable: false),
        texto:     json['contrato'] as String? ?? '',
        entregadoEn: _toDate(json['entregado_en']),
      );
}
