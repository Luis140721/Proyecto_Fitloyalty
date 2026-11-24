// lib/cliente/services/preferencias_service.dart
//
// RQNF-16 (Ley 2300 de 2023, arts. 2 y 5): si el miembro acepta mensajes
// comerciales del gimnasio y por que canales.
//   - obtener:  GET   /api/cliente/preferencias
//   - guardar:  PATCH /api/cliente/preferencias
//
// El servidor guarda cada cambio como una constancia (fecha, version del
// texto y canal APP) en el historial de autorizaciones del miembro.

import 'api_client.dart';

class PreferenciasComerciales {
  final bool aceptaComerciales;
  final List<String> canalesAutorizados;
  final DateTime? fecha;
  final String? canal;

  /// Texto que el miembro acepta (version actual).
  final String texto;

  /// El horario de la Ley 2300, en una frase.
  final String horario;

  /// Un menor no puede aceptarlos aqui (lo hace su representante), pero si cancelarlos.
  final bool puedeAceptar;

  const PreferenciasComerciales({
    required this.aceptaComerciales,
    required this.canalesAutorizados,
    required this.texto,
    required this.horario,
    required this.puedeAceptar,
    this.fecha,
    this.canal,
  });

  factory PreferenciasComerciales.fromJson(Map<String, dynamic> j) {
    final p = (j['preferencias'] as Map<String, dynamic>?) ?? const {};
    final canales = p['canalesAutorizados'];
    final fecha = p['fecha'];
    return PreferenciasComerciales(
      aceptaComerciales: p['aceptaComerciales'] == true,
      canalesAutorizados: canales is List ? canales.map((c) => c.toString()).toList() : const [],
      fecha: fecha is String ? DateTime.tryParse(fecha) : null,
      canal: p['canal'] as String?,
      texto: j['texto']?.toString() ?? '',
      horario: j['horario']?.toString() ?? '',
      puedeAceptar: j['puede_aceptar'] != false,
    );
  }

  bool autoriza(String canal) => canalesAutorizados.contains(canal);
}

class PreferenciasService {
  final ApiClient _api;
  PreferenciasService({ApiClient? api}) : _api = api ?? ApiClient();

  Future<PreferenciasComerciales> obtener() async {
    final data = await _api.get('/cliente/preferencias');
    return PreferenciasComerciales.fromJson(data);
  }

  /// Devuelve el mensaje del servidor y las preferencias como quedaron.
  Future<({String mensaje, PreferenciasComerciales preferencias})> guardar({
    bool? aceptaComerciales,
    List<String>? canalesAutorizados,
  }) async {
    final body = <String, dynamic>{
      'aceptaComerciales': ?aceptaComerciales,
      'canalesAutorizados': ?canalesAutorizados,
    };
    final data = await _api.patch('/cliente/preferencias', body: body);
    return (
      mensaje: data['message']?.toString() ?? '',
      preferencias: PreferenciasComerciales.fromJson(data),
    );
  }
}
