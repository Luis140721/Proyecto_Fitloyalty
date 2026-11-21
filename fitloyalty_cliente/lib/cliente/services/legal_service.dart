// lib/cliente/services/legal_service.dart
//
// Capa de red de RQNF-17 y RQNF-18:
//   - autorizaciones:  GET   /api/cliente/autorizaciones
//   - datosSensibles:  PATCH /api/cliente/autorizaciones/datos-sensibles
//   - contrato:        GET   /api/cliente/contrato

import '../models/legal.dart';
import 'api_client.dart';

class LegalService {
  final ApiClient _api;
  LegalService({ApiClient? api}) : _api = api ?? ApiClient();

  Future<AutorizacionesResumen> autorizaciones() async {
    final data = await _api.get('/cliente/autorizaciones');
    return AutorizacionesResumen.fromJson(data);
  }

  /// Otorga (true) o revoca (false) la autorizacion de datos de salud.
  /// Al revocarla, el backend borra condiciones medicas y alergias.
  Future<({String mensaje, AutorizacionesResumen resumen})> datosSensibles({required bool otorgada}) async {
    final data = await _api.patch('/cliente/autorizaciones/datos-sensibles', body: {'otorgada': otorgada});
    return (
      mensaje: data['message']?.toString() ?? '',
      resumen: AutorizacionesResumen.fromJson(data),
    );
  }

  Future<Contrato> contrato() async {
    final data = await _api.get('/cliente/contrato');
    return Contrato.fromJson(data);
  }
}
