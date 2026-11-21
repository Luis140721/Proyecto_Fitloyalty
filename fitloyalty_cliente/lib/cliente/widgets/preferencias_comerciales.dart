// lib/cliente/widgets/preferencias_comerciales.dart
//
// RQNF-16 (Ley 2300 de 2023, arts. 2 y 5): tarjeta "Mensajes del gimnasio" de
// la pestana Mas.
//   - Los canales por los que el gimnasio le puede enviar mensajes
//     comerciales (WhatsApp, correo). El texto que acepta dice "por los
//     canales que marco": nada se marca solo.
//   - Un interruptor para aceptar o cancelar, en cualquier momento, los
//     mensajes comerciales (promociones, campanas, mensajes para volver).
//     Para encenderlo hay que marcar antes al menos un canal; apagarlo no
//     pide nada.
//
// Con el interruptor apagado, marcar canales solo prepara la eleccion (no se
// guarda nada). Con el interruptor encendido, cada cambio se guarda al
// momento (PATCH /api/cliente/preferencias). Si el servidor no responde, el
// control vuelve a como estaba y se avisa. Un menor de edad solo puede
// cancelarlos: aceptarlos le toca a su representante, en el gimnasio.

import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/preferencias_service.dart';
import '../theme/app_theme.dart';

class PreferenciasComercialesCard extends StatefulWidget {
  final PreferenciasService? service;
  const PreferenciasComercialesCard({super.key, this.service});

  @override
  State<PreferenciasComercialesCard> createState() => _PreferenciasComercialesCardState();
}

class _PreferenciasComercialesCardState extends State<PreferenciasComercialesCard> {
  late final PreferenciasService _service = widget.service ?? PreferenciasService();
  PreferenciasComerciales? _pref;
  String? _error;
  bool _guardando = false;

  /// Canales marcados en pantalla. Con el interruptor encendido son los
  /// guardados; apagado, la eleccion que se guardara al encenderlo.
  Set<String> _elegidos = {};

  static const _canales = [('WHATSAPP', 'WhatsApp'), ('EMAIL', 'Correo')];

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  void _aplicar(PreferenciasComerciales p) {
    _pref = p;
    _elegidos = p.aceptaComerciales ? p.canalesAutorizados.toSet() : <String>{};
  }

  Future<void> _cargar() async {
    setState(() => _error = null);
    try {
      final p = await _service.obtener();
      if (!mounted) return;
      setState(() => _aplicar(p));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'No pudimos cargar tus preferencias.');
    }
  }

  Future<void> _guardar({bool? acepta, List<String>? canales}) async {
    final anterior = _pref;
    final elegidosAntes = Set<String>.of(_elegidos);
    if (anterior == null || _guardando) return;
    setState(() => _guardando = true);
    try {
      final r = await _service.guardar(aceptaComerciales: acepta, canalesAutorizados: canales);
      if (!mounted) return;
      setState(() => _aplicar(r.preferencias));
      if (r.mensaje.isNotEmpty) _aviso(r.mensaje);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _pref = anterior;
        _elegidos = elegidosAntes;
      });
      _aviso(e.message, error: true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _pref = anterior;
        _elegidos = elegidosAntes;
      });
      _aviso('No pudimos guardar tus preferencias.', error: true);
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  void _aviso(String texto, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(texto),
        backgroundColor: error ? AppColors.danger.withValues(alpha: 0.85) : AppColors.surfaceHigh,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  /// Los canales en el orden de siempre (WhatsApp, correo).
  List<String> _ordenados(Set<String> s) => [
    for (final c in _canales)
      if (s.contains(c.$1)) c.$1,
  ];

  void _alternarAcepta(bool valor) {
    if (valor) {
      // Solo con los canales que el miembro marco: nunca se elige uno por el.
      if (_elegidos.isEmpty) {
        _aviso('Marca primero por dónde quieres recibirlos (WhatsApp, correo o los dos).', error: true);
        return;
      }
      _guardar(acepta: true, canales: _ordenados(_elegidos));
    } else {
      _guardar(acepta: false);
    }
  }

  void _alternarCanal(String canal, bool marcado) {
    final p = _pref;
    if (p == null) return;
    final nuevos = Set<String>.of(_elegidos);
    if (marcado) {
      nuevos.add(canal);
    } else {
      nuevos.remove(canal);
    }
    if (!p.aceptaComerciales) {
      // Interruptor apagado: solo se prepara la eleccion.
      setState(() => _elegidos = nuevos);
      return;
    }
    if (nuevos.isEmpty) {
      _aviso('Deja al menos un canal, o apaga los mensajes comerciales.', error: true);
      return;
    }
    setState(() => _elegidos = nuevos);
    _guardar(canales: _ordenados(nuevos));
  }

  @override
  Widget build(BuildContext context) {
    final p = _pref;
    // Material (y no un Container con color): el SwitchListTile pinta su fondo
    // y su efecto de toque sobre el Material mas cercano.
    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_error != null) ...[
              Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
              TextButton(onPressed: _cargar, child: const Text('Reintentar')),
            ] else if (p == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
              )
            else ...[
              const Text(
                'Por dónde te los pueden enviar',
                style: TextStyle(fontSize: 12, color: AppColors.textMuted, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                children: [
                  for (final c in _canales)
                    FilterChip(
                      key: Key('canal-${c.$1}'),
                      label: Text(c.$2),
                      selected: _elegidos.contains(c.$1),
                      // Un menor no puede agregar canales (solo quitarlos).
                      onSelected: _guardando || (!p.puedeAceptar && !_elegidos.contains(c.$1))
                          ? null
                          : (v) => _alternarCanal(c.$1, v),
                    ),
                ],
              ),
              SwitchListTile(
                key: const Key('interruptor-comerciales'),
                contentPadding: EdgeInsets.zero,
                activeThumbColor: AppColors.primary,
                title: const Text(
                  'Recibir promociones y mensajes comerciales',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                ),
                subtitle: Text(
                  p.aceptaComerciales
                      ? 'Puedes apagarlo cuando quieras: dejas de recibirlos desde ya.'
                      : (!p.puedeAceptar
                            ? 'Eres menor de edad: los acepta tu representante legal en el gimnasio.'
                            : (_elegidos.isEmpty
                                  ? 'Apagado. Para activarlos, marca primero WhatsApp, correo o los dos.'
                                  : 'Apagado: no te enviamos campañas ni mensajes para que vuelvas.')),
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
                value: p.aceptaComerciales,
                // Encenderlo exige un canal marcado; apagarlo, nada.
                onChanged: _guardando || (!p.aceptaComerciales && (!p.puedeAceptar || _elegidos.isEmpty))
                    ? null
                    : _alternarAcepta,
              ),
              const SizedBox(height: 4),
              Text(
                'Los avisos de tu plan, como el de vencimiento, no son comerciales y te siguen llegando por WhatsApp. '
                'Todos los mensajes del gimnasio salen solo ${p.horario.isNotEmpty ? p.horario : 'en el horario permitido'}, '
                'máximo uno al día. También puedes darte de baja con el enlace que va al final de cada mensaje comercial.',
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
              if (p.fecha != null) ...[
                const SizedBox(height: 6),
                Text(
                  'Último cambio: ${_fecha(p.fecha!)}${p.canal == null ? '' : ' (${_canal(p.canal!)})'}.',
                  style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  String _fecha(DateTime f) {
    final l = f.toLocal();
    String dos(int n) => n.toString().padLeft(2, '0');
    return '${dos(l.day)}/${dos(l.month)}/${l.year}';
  }

  String _canal(String c) => switch (c) {
    'APP' => 'en la app',
    'PANEL' => 'en el gimnasio',
    'ENLACE' => 'con el enlace de baja',
    _ => c,
  };
}
