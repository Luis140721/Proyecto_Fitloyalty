// lib/cliente/services/api_client.dart
//
// Cliente HTTP central para la app del cliente.
// Mismo patron que auth_service.dart de la profe en Store_Pro_Ss:
//
//   - Lee baseUrl de Environment.apiUrl
//   - Lee el JWT de FlutterSecureStorage y lo pega en Authorization
//   - Devuelve una clase ApiResponse tipada en vez de http.Response crudo
//     para que las pantallas no tengan que parsear statusCode/body en cada llamada
//
// Decisiones:
//   - timeout 10s para no dejar al usuario colgado en una pantalla
//   - manejo de error uniforme: status 0 = error de red, status >= 1 = HTTP
//   - el 401 fuerza limpieza del token (requireClient lo va a rechazar igual,
//     pero por si acaso evitamos loops)

import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../config/environment.dart';

class ApiException implements Exception {
  final int status;
  final String code;
  final String message;
  ApiException({required this.status, required this.code, required this.message});

  bool get isNetwork => status == 0;
  bool get isUnauthorized => status == 401;
  bool get isForbidden => status == 403;
  bool get isNotFound => status == 404;

  @override
  String toString() => 'ApiException($status, $code): $message';
}

class ApiClient {
  final String baseUrl;
  final _storage = const FlutterSecureStorage();

  static const _tokenKey = 'cliente_jwt';

  ApiClient({String? baseUrl}) : baseUrl = baseUrl ?? Environment.apiUrl;

  // -------- Token (almacenamiento seguro) ------------------------------
  Future<String?> getToken() => _storage.read(key: _tokenKey);
  Future<void> deleteToken() => _storage.delete(key: _tokenKey);

  // -------- Helpers internos --------------------------------------------
  Map<String, String> _headers({String? token, bool json = true}) {
    return {
      if (json) 'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<Map<String, dynamic>> _request({
    required String method,
    required String path,
    Object? body,
    bool requireAuth = true,
    Duration timeout = const Duration(seconds: 12),
  }) async {
    String? token;
    if (requireAuth) {
      token = await getToken();
      // Si la ruta exige auth pero no hay token, fallamos rapido sin pegarle
      // al backend (asi no dependemos de su 401).
      if (token == null || token.isEmpty) {
        throw ApiException(
          status: 401,
          code: 'NO_TOKEN',
          message: 'No has iniciado sesion.',
        );
      }
    }

    final uri = Uri.parse('$baseUrl$path');
    final headers = _headers(token: token);
    final bodyStr = body == null ? null : jsonEncode(body);

    http.Response resp;
    try {
      switch (method) {
        case 'GET':    resp = await http.get(uri, headers: headers).timeout(timeout); break;
        case 'POST':   resp = await http.post(uri, headers: headers, body: bodyStr).timeout(timeout); break;
        case 'PUT':    resp = await http.put(uri, headers: headers, body: bodyStr).timeout(timeout); break;
        case 'DELETE': resp = await http.delete(uri, headers: headers, body: bodyStr).timeout(timeout); break;
        default: throw ArgumentError('Metodo HTTP no soportado: $method');
      }
    } on TimeoutException {
      throw ApiException(status: 0, code: 'TIMEOUT', message: 'La conexion tardo demasiado. Revisa tu internet.');
    } catch (e) {
      throw ApiException(status: 0, code: 'NETWORK', message: 'Sin conexion con el servidor.');
    }

    // 204 no tiene body
    if (resp.statusCode == 204) return const <String, dynamic>{};

    Map<String, dynamic> data;
    try {
      data = jsonDecode(resp.body) as Map<String, dynamic>;
    } catch (_) {
      data = {'raw': resp.body};
    }

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return data;
    }

    // Token muerto: lo limpiamos para que la app no quede en bucle.
    if (resp.statusCode == 401 && requireAuth) {
      await deleteToken();
    }

    throw ApiException(
      status:  resp.statusCode,
      code:    data['code']?.toString() ?? data['error_code']?.toString() ?? 'HTTP_${resp.statusCode}',
      message: data['error']?.toString()
            ?? data['message']?.toString()
            ?? 'Error del servidor (${resp.statusCode})',
    );
  }

  Future<Map<String, dynamic>> get(String path, {bool requireAuth = true}) =>
      _request(method: 'GET', path: path, requireAuth: requireAuth);

  Future<Map<String, dynamic>> post(String path, {Object? body, bool requireAuth = true}) =>
      _request(method: 'POST', path: path, body: body, requireAuth: requireAuth);

  Future<Map<String, dynamic>> put(String path, {Object? body, bool requireAuth = true}) =>
      _request(method: 'PUT', path: path, body: body, requireAuth: requireAuth);

  Future<Map<String, dynamic>> delete(String path, {bool requireAuth = true}) =>
      _request(method: 'DELETE', path: path, requireAuth: requireAuth);
}
