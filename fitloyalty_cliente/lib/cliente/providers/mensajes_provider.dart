// lib/cliente/providers/mensajes_provider.dart
//
// Estado de la bandeja "Mensajes" (issue #46). Lo comparten la pantalla de
// mensajes y el contador de la barra de abajo (home_screen.dart), asi que
// marcar un mensaje como leido baja el numero al instante.
//
// Sin notificaciones push: se refresca al abrir la app, al volver a ella y al
// deslizar hacia abajo en la bandeja.

import 'package:flutter/foundation.dart';

import '../models/mensaje.dart';
import '../services/api_client.dart';
import '../services/mensajes_service.dart';
import 'perfil_provider.dart' show DataStatus;

class MensajesProvider extends ChangeNotifier {
  final MensajesService _service;

  MensajesProvider({MensajesService? service}) : _service = service ?? MensajesService();

  List<Mensaje> _mensajes = const [];
  int _noLeidos = 0;
  DataStatus _status = DataStatus.idle;
  String? _error;

  List<Mensaje> get mensajes => _mensajes;
  int get noLeidos => _noLeidos;
  DataStatus get status => _status;
  String? get error => _error;

  /// Carga la bandeja. Con [silencioso] no muestra el estado de carga (para
  /// refrescar el contador sin que la lista parpadee).
  Future<void> cargar({bool silencioso = false}) async {
    if (!silencioso) {
      _status = DataStatus.loading;
      _error = null;
      notifyListeners();
    }
    try {
      final res = await _service.listar();
      _mensajes = res.mensajes;
      _noLeidos = res.noLeidos;
      _status = DataStatus.loaded;
      _error = null;
    } on ApiException catch (e) {
      if (!silencioso) {
        _error = e.message;
        _status = DataStatus.error;
      }
    } catch (_) {
      if (!silencioso) {
        _error = 'Error inesperado al cargar tus mensajes.';
        _status = DataStatus.error;
      }
    }
    notifyListeners();
  }

  Future<void> marcarLeido(Mensaje m) async {
    if (m.leida) return;
    // Se marca de una vez en pantalla; si el servidor falla, se recarga.
    _mensajes = [for (final x in _mensajes) x.id == m.id ? x.copyWith(leida: true) : x];
    _noLeidos = _noLeidos > 0 ? _noLeidos - 1 : 0;
    notifyListeners();
    try {
      _noLeidos = await _service.marcarLeido(m.id);
      notifyListeners();
    } catch (_) {
      await cargar(silencioso: true);
    }
  }

  Future<void> marcarTodos() async {
    if (_noLeidos == 0) return;
    _mensajes = [for (final x in _mensajes) x.copyWith(leida: true)];
    _noLeidos = 0;
    notifyListeners();
    try {
      await _service.marcarTodos();
    } catch (_) {
      await cargar(silencioso: true);
    }
  }
}
