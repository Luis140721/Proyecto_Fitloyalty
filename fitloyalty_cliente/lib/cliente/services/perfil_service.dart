// lib/cliente/services/perfil_service.dart
//
// Capa de red para la pantalla de perfil y edicion.
//   - getQr:        GET  /api/cliente/qr
//   - getMembresia: GET  /api/cliente/membresia
//   - updatePerfil: PUT  /api/cliente/me

import '../models/membresia.dart';
import '../models/miembro.dart';
import 'api_client.dart';

class PerfilService {
  final ApiClient _api;
  PerfilService({ApiClient? api}) : _api = api ?? ApiClient();

  Future<({String codigo, String? imagenDataUrl})> getQr() async {
    final data = await _api.get('/cliente/qr');
    return (
      codigo:       data['codigo']        as String? ?? '',
      imagenDataUrl: data['imagenDataUrl'] as String?,
    );
  }

  /// Devuelve null si el miembro no tiene plan activo (la API lo distingue).
  Future<Membresia?> getMembresia() async {
    final data = await _api.get('/cliente/membresia');
    final raw = data['membresia'];
    if (raw == null) return null;
    return Membresia.fromJson(raw as Map<String, dynamic>);
  }

  Future<Miembro> updatePerfil({
    String? telefono,
    String? email,
    String? direccion,
    String? contactoEmergencia,
    String? telefonoEmergencia,
    String? condicionesMedicas,
    String? alergias,
    String? objetivo,
    String? nivelExperiencia,
  }) async {
    final body = <String, dynamic>{
      'telefono':            ?telefono,
      'email':               ?email,
      'direccion':           ?direccion,
      'contacto_emergencia': ?contactoEmergencia,
      'telefono_emergencia': ?telefonoEmergencia,
      'condiciones_medicas': ?condicionesMedicas,
      'alergias':            ?alergias,
      'objetivo':            ?objetivo,
      'nivel_experiencia':   ?nivelExperiencia,
    };
    final data = await _api.put('/cliente/me', body: body);
    return Miembro.fromJson(data['miembro'] as Map<String, dynamic>);
  }
}
