// lib/cliente/providers/auth_provider.dart
//
// Estado global de la sesion del cliente (miembro del gimnasio).
// Patron ChangeNotifier, mismo enfoque que AuthProvider del Store_Pro_Ss de la profe.
//
// Estados:
//   - checking        : estamos validando token en background al arrancar
//   - unauthenticated : no hay token o ya caduco -> mostrar Login
//   - authenticated   : hay token valido y un Miembro cargado
//
// Ademas expone el Miembro actual y un helper para actualizarlo desde las
// pantallas (perfil, editar perfil) sin tener que recargarlo del backend.

import 'package:flutter/foundation.dart';

import '../models/miembro.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';

enum AuthStatus { checking, unauthenticated, authenticated }

class AuthProvider extends ChangeNotifier {
  AuthProvider({AuthService? authService})
      : _authService = authService ?? AuthService() {
    checkAuthStatus();
  }

  final AuthService _authService;

  AuthStatus _status = AuthStatus.checking;
  Miembro? _miembro;
  String? _lastError;

  AuthStatus get status => _status;
  Miembro?  get miembro => _miembro;
  String?   get lastError => _lastError;
  bool get isAuthenticated => _status == AuthStatus.authenticated && _miembro != null;

  /// Llamado por el SplashGate al arrancar la app.
  Future<void> checkAuthStatus() async {
    _status = AuthStatus.checking;
    notifyListeners();

    final token = await _authService.getCachedToken();
    if (token == null || token.isEmpty) {
      _status = AuthStatus.unauthenticated;
      notifyListeners();
      return;
    }

    // Hay token: intentamos refrescar el perfil del backend para validar.
    try {
      final m = await _authService.me();
      _miembro = m;
      _status = AuthStatus.authenticated;
      _lastError = null;
    } on ApiException catch (e) {
      // 401/403 -> token muerto. Limpiamos y mandamos a login.
      if (e.isUnauthorized || e.isForbidden) {
        await _authService.logout();
        _miembro = null;
        _status = AuthStatus.unauthenticated;
        _lastError = null;
      } else {
        // Error de red u otro: dejamos al usuario intentar (perfil cacheado).
        final cached = await _authService.getCachedMiembro();
        _miembro = cached;
        _status = cached != null ? AuthStatus.authenticated : AuthStatus.unauthenticated;
        _lastError = e.message;
      }
    } catch (e) {
      // Cualquier otra excepcion: caemos al login para no dejar la app rota.
      _miembro = null;
      _status = AuthStatus.unauthenticated;
      _lastError = e.toString();
    }
    notifyListeners();
  }

  /// Login: gimnasio + telefono + contrasena. Devuelve true si fue OK.
  Future<bool> login({required String gimnasio, required String telefono, required String password}) async {
    _lastError = null;
    try {
      final res = await _authService.login(
        gimnasio: gimnasio, telefono: telefono, password: password,
      );
      _miembro = res.miembro;
      _status = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _lastError = e.message;
      notifyListeners();
      return false;
    } catch (e) {
      _lastError = 'Error inesperado al iniciar sesion.';
      notifyListeners();
      return false;
    }
  }

  /// Refresca el miembro desde el backend (por ejemplo al volver de editar).
  Future<void> refresh() async {
    try {
      _miembro = await _authService.me();
      notifyListeners();
    } catch (_) {
      // Si falla, mantenemos el cache. No cambiamos status.
    }
  }

  /// Reemplaza el miembro en memoria (cuando la pantalla de edicion hace PUT).
  void setMiembro(Miembro m) {
    _miembro = m;
    notifyListeners();
  }

  Future<void> logout() async {
    await _authService.logout();
    _miembro = null;
    _status = AuthStatus.unauthenticated;
    _lastError = null;
    notifyListeners();
  }
}
