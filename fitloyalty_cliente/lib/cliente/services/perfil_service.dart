// lib/cliente/services/perfil_service.dart
//
// Capa de red para la pantalla de perfil y edicion.
//   - getQr:        GET  /api/cliente/qr (QR fijo y datos del QR dinamico)
//   - getMembresia: GET  /api/cliente/membresia
//   - updatePerfil: PUT  /api/cliente/me

import '../models/membresia.dart';
import '../models/miembro.dart';
import '../utils/qr_dinamico.dart';
import 'api_client.dart';

class PerfilService {
  final ApiClient _api;
  PerfilService({ApiClient? api}) : _api = api ?? ApiClient();

  Future<({String codigo, String? imagenDataUrl, QrDinamico? dinamico, bool soloDinamico})> getQr() async {
    final data = await _api.get('/cliente/qr');
    final raw = data['dinamico'];
    return (
      codigo:       data['codigo']        as String? ?? '',
      imagenDataUrl: data['imagenDataUrl'] as String?,
      // QR que cambia cada 30 s; null si el servidor es anterior a esta version.
      dinamico:     raw is Map<String, dynamic> ? QrDinamico.fromJson(raw) : null,
      soloDinamico: data['solo_dinamico'] == true,
    );
  }

  /// Devuelve null si el miembro no tiene plan activo (la API lo distingue).
  Future<Membresia?> getMembresia() async {
    final data = await _api.get('/cliente/membresia');
    final raw = data['membresia'];
    if (raw == null) return null;
    return Membresia.fromJson(raw as Map<String, dynamic>);
  }

  /// Devuelve el miembro actualizado, el mensaje del servidor y si descarto
  /// los datos de salud (sin la autorizacion de datos sensibles, RQNF-17, el
  /// backend guarda condiciones medicas y alergias en NULL). La pantalla no
  /// debe decir solo "Perfil actualizado" en ese caso (ajuste 7 del #102).
  Future<({Miembro miembro, String mensaje, bool sensiblesDescartados})> updatePerfil({
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
    return (
      miembro: Miembro.fromJson(data['miembro'] as Map<String, dynamic>),
      mensaje: data['message']?.toString() ?? 'Perfil actualizado.',
      sensiblesDescartados: data['datos_sensibles_descartados'] == true,
    );
  }
}
