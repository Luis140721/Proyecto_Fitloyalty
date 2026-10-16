// lib/cliente/services/auth_service.dart
//
// Capa de red para autenticacion del cliente (miembro).
//   - login: POST /api/cliente/login con (gimnasio, documento, pin)
//   - me:    GET  /api/cliente/me  para refrescar el perfil
//   - logout: borra el token local (el backend no lo necesita porque JWT es stateless)

import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/miembro.dart';
import 'api_client.dart';

class AuthService {
  final ApiClient _api;
  final _storage = const FlutterSecureStorage();
  static const _tokenKey = 'cliente_jwt';
  static const _userKey = 'cliente_user';

  AuthService({ApiClient? api}) : _api = api ?? ApiClient();

  /// Login: gimnasio (codigo o NIT) + telefono + contrasena.
  Future<({Miembro miembro, GimnasioResumen gimnasio, String token})> login({
    required String gimnasio,
    required String telefono,
    required String password,
  }) async {
    final data = await _api.post(
      '/cliente/login',
      body: {
        'gimnasio': gimnasio.trim(),
        'telefono': telefono.trim(),
        'password': password,
      },
      requireAuth: false,  // el login va SIN token
    );

    final token = data['token'] as String;
    final miembro = Miembro.fromJson(data['miembro'] as Map<String, dynamic>);
    final gymRaw = data['gimnasio'] as Map<String, dynamic>?;
    final gym = GimnasioResumen(
      id:        gymRaw?['id']       as int? ?? miembro.gymId,
      nombre:    gymRaw?['nombre']   as String? ?? '',
      telefono:  null,
      direccion: null,
      planActivo: gymRaw?['planActivo'] as String?,
    );

    // Guardamos token + un snapshot del miembro para que el splash pueda
    // mostrar algo mientras hace el /me en paralelo.
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _userKey, value: jsonEncode(_miembroToJson(miembro)));

    return (miembro: miembro, gimnasio: gym, token: token);
  }

  /// Trae el perfil actualizado del miembro. Lo usamos al abrir la app y al
  /// volver del editor de perfil.
  Future<Miembro> me() async {
    final data = await _api.get('/cliente/me');
    final m = Miembro.fromJson(data['miembro'] as Map<String, dynamic>);
    await _storage.write(key: _userKey, value: jsonEncode(_miembroToJson(m)));
    return m;
  }

  Future<void> logout() async {
    // El backend no invalida JWT (stateless), pero le pegamos /logout para
    // simetria y por si en el futuro se quiere registrar el cierre.
    try { await _api.post('/cliente/logout'); } catch (_) {}
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _userKey);
  }

  /// Lee el miembro cacheado del storage para arrancar mas rapido.
  Future<Miembro?> getCachedMiembro() async {
    final raw = await _storage.read(key: _userKey);
    if (raw == null) return null;
    try {
      return Miembro.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<String?> getCachedToken() => _storage.read(key: _tokenKey);

  // Para no acoplar el modelo a JSON, serializamos manualmente.
  Map<String, dynamic> _miembroToJson(Miembro m) {
    return {
      'id': m.id, 'gymId': m.gymId,
      'nombre': m.nombre, 'documento': m.documento,
      'telefono': m.telefono, 'email': m.email,
      'codigoQr': m.codigoQr, 'qrImagen': m.qrImagenDataUrl,
      'fotoUrl': m.fotoUrl, 'activo': m.activo, 'appAcceso': m.appAcceso,
      'fechaRegistro': m.fechaRegistro?.toIso8601String(),
    };
  }
}
