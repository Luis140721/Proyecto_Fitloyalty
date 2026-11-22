// lib/cliente/screens/autorizaciones_screen.dart
//
// Pantalla "Mis autorizaciones" (RQNF-17): el miembro ve que autorizo, cuando,
// por que canal y con que texto, y puede revocar la autorizacion de datos de
// salud (o darla, si es mayor de edad). Al revocarla, el gimnasio borra sus
// condiciones medicas y alergias.
//
//   GET   /api/cliente/autorizaciones
//   PATCH /api/cliente/autorizaciones/datos-sensibles

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/legal.dart';
import '../services/api_client.dart';
import '../services/legal_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class AutorizacionesScreen extends StatefulWidget {
  const AutorizacionesScreen({super.key});

  @override
  State<AutorizacionesScreen> createState() => _AutorizacionesScreenState();
}

class _AutorizacionesScreenState extends State<AutorizacionesScreen> {
  final _service = LegalService();
  AutorizacionesResumen? _resumen;
  String? _error;
  bool _cargando = true;
  bool _guardando = false;

  static const _tipos = ['TERMINOS', 'TRATAMIENTO_DATOS', 'DATOS_SENSIBLES', 'REPRESENTANTE_MENOR'];

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final r = await _service.autorizaciones();
      if (!mounted) return;
      setState(() => _resumen = r);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Error inesperado al cargar tus autorizaciones.');
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  Future<void> _cambiarSensibles(bool otorgar) async {
    final r = _resumen;
    if (r == null) return;
    final texto = r.textosActuales['DATOS_SENSIBLES'] ?? '';
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text(otorgar ? 'Autorizar datos de salud' : 'Revocar la autorizacion'),
        content: SingleChildScrollView(
          child: Text(
            otorgar
                ? '$texto\n\nNo estas obligado(a) a darla.'
                : 'El gimnasio borrara tus condiciones medicas y alergias y dejara constancia de la revocacion. '
                    'Puedes volver a autorizarlo despues.',
            style: const TextStyle(height: 1.4),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(
            style: otorgar
                ? null
                : FilledButton.styleFrom(backgroundColor: AppColors.danger, minimumSize: const Size(96, 40)),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(otorgar ? 'Autorizo' : 'Revocar'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;

    setState(() => _guardando = true);
    try {
      final res = await _service.datosSensibles(otorgada: otorgar);
      if (!mounted) return;
      setState(() => _resumen = res.resumen);
      _aviso(res.mensaje.isEmpty ? 'Listo.' : res.mensaje);
    } on ApiException catch (e) {
      if (!mounted) return;
      _aviso(e.message, error: true);
    } catch (_) {
      if (!mounted) return;
      _aviso('No pudimos guardar el cambio.', error: true);
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  void _aviso(String mensaje, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(mensaje),
        backgroundColor: error ? AppColors.danger.withValues(alpha: 0.85) : AppColors.surfaceHigh,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mis autorizaciones')),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: _cargar,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            const Text(
              'Estas son las autorizaciones que diste al gimnasio sobre tus datos personales. '
              'Cada una queda registrada con su fecha, el canal y la version del texto.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 16),
            if (_cargando && _resumen == null) ...const [
              ShimmerBox(height: 90),
              SizedBox(height: 10),
              ShimmerBox(height: 90),
              SizedBox(height: 10),
              ShimmerBox(height: 90),
            ],
            if (_error != null) ErrorBanner(mensaje: _error!, onRetry: _cargar),
            if (_resumen != null) ..._contenido(_resumen!),
          ],
        ),
      ),
    );
  }

  List<Widget> _contenido(AutorizacionesResumen r) {
    final tipos = _tipos.where((t) => t != 'REPRESENTANTE_MENOR' || r.menorDeEdad || r[t] != null);
    return [
      if (r.menorDeEdad)
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.warning.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.warning.withValues(alpha: 0.35)),
          ),
          child: Text(
            'Eres menor de edad: tus autorizaciones las da tu representante legal'
            '${r.representanteNombre != null ? ' (${r.representanteNombre})' : ''} en el gimnasio.',
            style: const TextStyle(fontSize: 13, height: 1.4),
          ),
        ),
      for (final t in tipos) _tarjeta(t, r),
      const SizedBox(height: 8),
      const Text(
        'Para revocar la autorizacion de tratamiento de datos o pedir que borren tus datos, '
        'escribe al gimnasio por su canal de peticiones, quejas y reclamos (lo encuentras en «Mi contrato»).',
        style: TextStyle(color: AppColors.textMuted, fontSize: 12, height: 1.4),
      ),
      const SizedBox(height: 20),
      const Text('HISTORIAL',
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: AppColors.textMuted)),
      const SizedBox(height: 8),
      if (r.historial.isEmpty)
        const Text('Aun no hay autorizaciones registradas.',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13))
      else
        for (final a in r.historial) _filaHistorial(a),
    ];
  }

  Widget _tarjeta(String tipo, AutorizacionesResumen r) {
    final a = r[tipo];
    final esSensibles = tipo == 'DATOS_SENSIBLES';
    final fmt = DateFormat("d 'de' MMMM 'de' y", 'es_CO');
    final chip = a == null
        ? StatusChip.neutral('SIN REGISTRO')
        : a.otorgada
            ? StatusChip.success('OTORGADA')
            : StatusChip.warning(esSensibles ? 'NO AUTORIZADA' : 'NO OTORGADA');
    final texto = a?.texto ?? r.textosActuales[tipo];

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(nombresAutorizacion[tipo] ?? tipo,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                ),
                chip,
              ],
            ),
            if (a != null) ...[
              const SizedBox(height: 4),
              Text(
                '${a.fecha != null ? fmt.format(a.fecha!) : 'Sin fecha'} · ${a.canalLegible}'
                '${a.version != null ? ' · texto ${a.version}' : ''}'
                '${a.porRepresentante ? ' · por tu representante' : ''}',
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
            ],
            if (texto != null && texto.isNotEmpty)
              Theme(
                data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                child: ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: const EdgeInsets.only(bottom: 6),
                  title: const Text('Ver el texto', style: TextStyle(fontSize: 13, color: AppColors.primary)),
                  children: [
                    Text(texto, style: const TextStyle(fontSize: 13, height: 1.45, color: AppColors.textSecondary)),
                  ],
                ),
              ),
            if (esSensibles) ...[
              const Text(
                'Es opcional: no estas obligado(a) a darla y tu membresia no depende de ella.',
                style: TextStyle(fontSize: 12, color: AppColors.textMuted, height: 1.4),
              ),
              const SizedBox(height: 10),
              if (r.puedeRevocarSensibles)
                OutlinedButton.icon(
                  icon: const Icon(Icons.block, size: 18),
                  label: const Text('Revocar autorizacion'),
                  style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
                  onPressed: _guardando ? null : () => _cambiarSensibles(false),
                )
              else if (r.puedeOtorgarSensibles)
                OutlinedButton.icon(
                  icon: const Icon(Icons.check_circle_outline, size: 18),
                  label: const Text('Autorizar'),
                  onPressed: _guardando ? null : () => _cambiarSensibles(true),
                )
              else
                const Text(
                  'Si quieres darla, pidesela a tu representante legal en el gimnasio.',
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _filaHistorial(Autorizacion a) {
    final fmt = DateFormat("d MMM y, HH:mm", 'es_CO');
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.border, width: 0.6)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(a.otorgada ? Icons.check_circle : Icons.remove_circle_outline,
              size: 18, color: a.otorgada ? AppColors.success : AppColors.warning),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '${a.nombre}: ${a.otorgada ? 'otorgada' : 'no otorgada o revocada'}\n'
              '${a.fecha != null ? fmt.format(a.fecha!) : ''} · ${a.canalLegible}'
              '${a.version != null ? ' · texto ${a.version}' : ''}',
              style: const TextStyle(fontSize: 12, height: 1.4, color: AppColors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}
