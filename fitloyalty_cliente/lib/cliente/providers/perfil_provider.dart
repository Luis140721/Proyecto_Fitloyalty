// lib/cliente/providers/perfil_provider.dart
//
// Estado de los datos secundarios del miembro (QR, plan, asistencia, gamificacion).
// Cada "pantalla" instancia su provider para no tener un god-provider de todo.
//
//   - Carga bajo demanda (no al abrir la app)
//   - Estado: idle | loading | loaded | error
//   - Permite reintentar

import 'package:flutter/foundation.dart';

import '../models/asistencia.dart';
import '../models/gamificacion.dart';
import '../models/membresia.dart';
import '../models/miembro.dart';
import '../services/api_client.dart';
import '../services/asistencia_service.dart';
import '../services/gamificacion_service.dart';
import '../services/perfil_service.dart';

enum DataStatus { idle, loading, loaded, error }

class PerfilProvider extends ChangeNotifier {
  final PerfilService _perfilService;

  PerfilProvider({PerfilService? perfilService})
      : _perfilService = perfilService ?? PerfilService();

  // -- QR --
  String? _qrCodigo;
  String? _qrImagen;
  DataStatus _qrStatus = DataStatus.idle;
  String? _qrError;

  String? get qrCodigo => _qrCodigo;
  String? get qrImagen => _qrImagen;
  DataStatus get qrStatus => _qrStatus;
  String? get qrError => _qrError;

  Future<void> cargarQr() async {
    _qrStatus = DataStatus.loading;
    _qrError = null;
    notifyListeners();
    try {
      final res = await _perfilService.getQr();
      _qrCodigo = res.codigo;
      _qrImagen = res.imagenDataUrl;
      _qrStatus = DataStatus.loaded;
    } on ApiException catch (e) {
      _qrError = e.message;
      _qrStatus = DataStatus.error;
    } catch (e) {
      _qrError = 'Error inesperado al cargar el QR.';
      _qrStatus = DataStatus.error;
    }
    notifyListeners();
  }

  // -- Membresia --
  Membresia? _membresia;
  DataStatus _membresiaStatus = DataStatus.idle;
  String? _membresiaError;

  Membresia? get membresia => _membresia;
  DataStatus get membresiaStatus => _membresiaStatus;
  String? get membresiaError => _membresiaError;

  Future<void> cargarMembresia() async {
    _membresiaStatus = DataStatus.loading;
    _membresiaError = null;
    notifyListeners();
    try {
      _membresia = await _perfilService.getMembresia();
      _membresiaStatus = DataStatus.loaded;
    } on ApiException catch (e) {
      _membresiaError = e.message;
      _membresiaStatus = DataStatus.error;
    } catch (e) {
      _membresiaError = 'Error inesperado al cargar tu plan.';
      _membresiaStatus = DataStatus.error;
    }
    notifyListeners();
  }

  // -- Asistencia --
  List<Checkin> _checkins = const [];
  AsistenciaResumen _resumenAsistencia = const AsistenciaResumen();
  DataStatus _asistenciaStatus = DataStatus.idle;
  String? _asistenciaError;

  List<Checkin> get checkins => _checkins;
  AsistenciaResumen get resumenAsistencia => _resumenAsistencia;
  DataStatus get asistenciaStatus => _asistenciaStatus;
  String? get asistenciaError => _asistenciaError;

  Future<void> cargarAsistencia({int limit = 20}) async {
    _asistenciaStatus = DataStatus.loading;
    _asistenciaError = null;
    notifyListeners();
    try {
      final res = await AsistenciaService().listar(limit: limit);
      _checkins = res.checkins;
      _resumenAsistencia = res.resumen;
      _asistenciaStatus = DataStatus.loaded;
    } on ApiException catch (e) {
      _asistenciaError = e.message;
      _asistenciaStatus = DataStatus.error;
    } catch (e) {
      _asistenciaError = 'Error inesperado al cargar tu asistencia.';
      _asistenciaStatus = DataStatus.error;
    }
    notifyListeners();
  }

  // -- Gamificacion --
  GamificacionResumen _gamificacionResumen = const GamificacionResumen();
  List<Hito> _hitos = const [];
  DataStatus _gamificacionStatus = DataStatus.idle;
  String? _gamificacionError;

  GamificacionResumen get gamificacionResumen => _gamificacionResumen;
  List<Hito> get hitos => _hitos;
  DataStatus get gamificacionStatus => _gamificacionStatus;
  String? get gamificacionError => _gamificacionError;

  Future<void> cargarGamificacion() async {
    _gamificacionStatus = DataStatus.loading;
    _gamificacionError = null;
    notifyListeners();
    try {
      final res = await GamificacionService().resumen();
      _gamificacionResumen = res.resumen;
      _hitos = res.hitos;
      _gamificacionStatus = DataStatus.loaded;
    } on ApiException catch (e) {
      _gamificacionError = e.message;
      _gamificacionStatus = DataStatus.error;
    } catch (e) {
      _gamificacionError = 'Error inesperado al cargar tus logros.';
      _gamificacionStatus = DataStatus.error;
    }
    notifyListeners();
  }

  // -- Retos --
  List<Reto> _retos = const [];
  DataStatus _retosStatus = DataStatus.idle;
  String? _retosError;

  List<Reto> get retos => _retos;
  DataStatus get retosStatus => _retosStatus;
  String? get retosError => _retosError;

  Future<void> cargarRetos() async {
    _retosStatus = DataStatus.loading;
    _retosError = null;
    notifyListeners();
    try {
      _retos = await GamificacionService().listarRetos();
      _retosStatus = DataStatus.loaded;
    } on ApiException catch (e) {
      _retosError = e.message;
      _retosStatus = DataStatus.error;
    } catch (e) {
      _retosError = 'Error inesperado al cargar los retos.';
      _retosStatus = DataStatus.error;
    }
    notifyListeners();
  }

  // -- Edicion de perfil --
  String? _editError;
  DataStatus _editStatus = DataStatus.idle;

  String? get editError => _editError;
  DataStatus get editStatus => _editStatus;

  /// Actualizar perfil (PUT /api/cliente/me). Devuelve el Miembro actualizado
  /// o null si fallo. La pantalla que llama muestra _editError.
  Future<Miembro?> actualizarPerfil({
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
    _editStatus = DataStatus.loading;
    _editError = null;
    notifyListeners();
    try {
      final m = await _perfilService.updatePerfil(
        telefono: telefono,
        email: email,
        direccion: direccion,
        contactoEmergencia: contactoEmergencia,
        telefonoEmergencia: telefonoEmergencia,
        condicionesMedicas: condicionesMedicas,
        alergias: alergias,
        objetivo: objetivo,
        nivelExperiencia: nivelExperiencia,
      );
      _editStatus = DataStatus.loaded;
      notifyListeners();
      return m;
    } on ApiException catch (e) {
      _editError = e.message;
      _editStatus = DataStatus.error;
      notifyListeners();
      return null;
    } catch (_) {
      _editError = 'Error inesperado al guardar.';
      _editStatus = DataStatus.error;
      notifyListeners();
      return null;
    }
  }
}
