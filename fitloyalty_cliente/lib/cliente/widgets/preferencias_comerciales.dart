// lib/cliente/widgets/preferencias_comerciales.dart
//
// RQNF-16 (Ley 2300 de 2023, arts. 2 y 5): tarjeta "Mensajes del gimnasio" de
// la pestana Mas.
//   - Un interruptor para aceptar o cancelar, en cualquier momento, los
//     mensajes comerciales (promociones, campanas, mensajes para volver).
//   - Los canales por los que el gimnasio le puede enviar esos mensajes
//     (WhatsApp, correo).
//
// Cada cambio se guarda al momento (PATCH /api/cliente/preferencias). Si el
// servidor no responde, el control vuelve a como estaba y se avisa. Un menor
// de edad solo puede cancelarlos: aceptarlos le toca a su representante, en
// el gimnasio.

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

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _error = null);
    try {
      final p = await _service.obtener();
      if (!mounted) return;
      setState(() => _pref = p);
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
    if (anterior == null || _guardando) return;
    setState(() => _guardando = true);
    try {
      final r = await _service.guardar(aceptaComerciales: acepta, canalesAutorizados: canales);
      if (!mounted) return;
      setState(() => _pref = r.preferencias);
      if (r.mensaje.isNotEmpty) _aviso(r.mensaje);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _pref = anterior);
      _aviso(e.message, error: true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _pref = anterior);
      _aviso('No pudimos guardar tus preferencias.', error: true);
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  void _aviso(String texto, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(texto),
      backgroundColor: error ? AppColors.danger.withValues(alpha: 0.85) : AppColors.surfaceHigh,
      behavior: SnackBarBehavior.floating,
    ));
  }

  void _alternarAcepta(bool valor) {
    final canales = _pref?.canalesAutorizados ?? const <String>[];
    // Para aceptar hace falta al menos un canal: si no hay, se propone WhatsApp.
    if (valor) {
      _guardar(acepta: true, canales: canales.isEmpty ? const ['WHATSAPP'] : canales);
    } else {
      _guardar(acepta: false);
    }
  }

  void _alternarCanal(String canal, bool marcado) {
    final actuales = List<String>.from(_pref?.canalesAutorizados ?? const <String>[]);
    if (marcado) {
      if (!actuales.contains(canal)) actuales.add(canal);
    } else {
      actuales.remove(canal);
    }
    if (actuales.isEmpty) {
      _aviso('Deja al menos un canal, o apaga los mensajes comerciales.', error: true);
      return;
    }
    _guardar(canales: actuales);
  }

  @override
  Widget build(BuildContext context) {
    final p = _pref;
    final puedeEncender = p != null && (p.aceptaComerciales || p.puedeAceptar);
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
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
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              activeThumbColor: AppColors.primary,
              title: const Text('Recibir promociones y mensajes comerciales',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              subtitle: Text(
                p.aceptaComerciales
                    ? 'Puedes apagarlo cuando quieras: dejas de recibirlos desde ya.'
                    : (p.puedeAceptar
                        ? 'Apagado: no te enviamos campañas ni mensajes para que vuelvas.'
                        : 'Eres menor de edad: los acepta tu representante legal en el gimnasio.'),
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
              value: p.aceptaComerciales,
              onChanged: _guardando || !puedeEncender ? null : _alternarAcepta,
            ),
            if (p.aceptaComerciales) ...[
              const SizedBox(height: 4),
              const Text('Por dónde te los pueden enviar',
                  style: TextStyle(fontSize: 12, color: AppColors.textMuted, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                children: [
                  FilterChip(
                    label: const Text('WhatsApp'),
                    selected: p.autoriza('WHATSAPP'),
                    onSelected: _guardando || (!p.puedeAceptar && !p.autoriza('WHATSAPP'))
                        ? null
                        : (v) => _alternarCanal('WHATSAPP', v),
                  ),
                  FilterChip(
                    label: const Text('Correo'),
                    selected: p.autoriza('EMAIL'),
                    onSelected: _guardando || (!p.puedeAceptar && !p.autoriza('EMAIL'))
                        ? null
                        : (v) => _alternarCanal('EMAIL', v),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 8),
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
