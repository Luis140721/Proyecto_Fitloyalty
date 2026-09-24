// lib/cliente/services/gamificacion_service.dart
//
// Capa de red para la pantalla "Mis logros" y "Retos activos".
//   - resumen:    GET /api/cliente/gamificacion
//   - listarRetos: GET /api/cliente/retos

import '../models/gamificacion.dart';
import 'api_client.dart';

class GamificacionService {
  final ApiClient _api;
  GamificacionService({ApiClient? api}) : _api = api ?? ApiClient();

  Future<({GamificacionResumen resumen, List<Hito> hitos})> resumen() async {
    final data = await _api.get('/cliente/gamificacion');
    final resumen = GamificacionResumen.fromJson(
      (data['resumen'] as Map<String, dynamic>?) ?? const <String, dynamic>{},
    );
    final rawHitos = data['hitos'] as List<dynamic>? ?? const [];
    final hitos = rawHitos
        .map((e) => Hito.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
    return (resumen: resumen, hitos: hitos);
  }

  Future<List<Reto>> listarRetos() async {
    final data = await _api.get('/cliente/retos');
    final raw = data['retos'] as List<dynamic>? ?? const [];
    return raw
        .map((e) => Reto.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
  }
}
