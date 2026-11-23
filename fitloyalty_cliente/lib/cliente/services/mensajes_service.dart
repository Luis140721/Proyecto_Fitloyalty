// lib/cliente/services/mensajes_service.dart
//
// Capa de red de la bandeja "Mensajes" (issue #46):
//   - listar:       GET   /api/cliente/mensajes?limit=N   -> { mensajes, no_leidos }
//   - marcarLeido:  PATCH /api/cliente/mensajes/:id/leido -> { no_leidos }
//   - marcarTodos:  PATCH /api/cliente/mensajes/leidos
//
// El backend solo devuelve los mensajes del miembro del token (un mensaje
// ajeno responde 404).

import '../models/mensaje.dart';
import 'api_client.dart';

class MensajesService {
  final ApiClient _api;
  MensajesService({ApiClient? api}) : _api = api ?? ApiClient();

  Future<({List<Mensaje> mensajes, int noLeidos})> listar({int limit = 50}) async {
    final data = await _api.get('/cliente/mensajes?limit=$limit');
    final raw = data['mensajes'] as List<dynamic>? ?? const [];
    final mensajes = raw
        .map((e) => Mensaje.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
    return (mensajes: mensajes, noLeidos: (data['no_leidos'] as num?)?.toInt() ?? 0);
  }

  /// Marca un mensaje propio como leido y devuelve cuantos quedan sin leer.
  Future<int> marcarLeido(int id) async {
    final data = await _api.patch('/cliente/mensajes/$id/leido');
    return (data['no_leidos'] as num?)?.toInt() ?? 0;
  }

  Future<void> marcarTodos() async {
    await _api.patch('/cliente/mensajes/leidos');
  }
}
