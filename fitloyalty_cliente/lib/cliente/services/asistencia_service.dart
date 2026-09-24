// lib/cliente/services/asistencia_service.dart
//
// Capa de red para la pantalla "Mi asistencia" (historial de check-ins).
//   - listar: GET /api/cliente/asistencia?limit=N (default 20)

import '../models/asistencia.dart';
import 'api_client.dart';

class AsistenciaService {
  final ApiClient _api;
  AsistenciaService({ApiClient? api}) : _api = api ?? ApiClient();

  Future<({List<Checkin> checkins, AsistenciaResumen resumen})> listar({int limit = 20}) async {
    final data = await _api.get('/cliente/asistencia?limit=$limit');
    final rawCheckins = data['checkins'] as List<dynamic>? ?? const [];
    final checkins = rawCheckins
        .map((e) => Checkin.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
    final resumen = AsistenciaResumen.fromJson(
      (data['resumen'] as Map<String, dynamic>?) ?? const <String, dynamic>{},
    );
    return (checkins: checkins, resumen: resumen);
  }
}
