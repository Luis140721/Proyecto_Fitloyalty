// lib/cliente/screens/contrato_screen.dart
//
// Pantalla "Mi contrato" (RQNF-18): el miembro ve su contrato de membresia,
// el mismo texto que el gimnasio le envia por WhatsApp (precio total, forma
// de pago, vigencia, renovacion, congelamiento, terminacion, datos del
// gimnasio y canal de PQR). Al abrirla, el backend deja constancia de la
// entrega en la app.
//
//   GET /api/cliente/contrato

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../models/legal.dart';
import '../services/api_client.dart';
import '../services/legal_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class ContratoScreen extends StatefulWidget {
  const ContratoScreen({super.key});

  @override
  State<ContratoScreen> createState() => _ContratoScreenState();
}

class _ContratoScreenState extends State<ContratoScreen> {
  final _service = LegalService();
  Contrato? _contrato;
  String? _error;
  bool _sinContrato = false;
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
      _sinContrato = false;
    });
    try {
      final c = await _service.contrato();
      if (!mounted) return;
      setState(() => _contrato = c);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _sinContrato = e.code == 'CONTRACT_INCOMPLETE';
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Error inesperado al cargar tu contrato.');
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  Future<void> _copiar() async {
    final c = _contrato;
    if (c == null) return;
    // Sin los asteriscos de negrita de WhatsApp.
    await Clipboard.setData(ClipboardData(text: c.texto.replaceAll('*', '')));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Contrato copiado'),
        backgroundColor: AppColors.surfaceHigh,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = _contrato;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mi contrato'),
        actions: [
          if (c != null)
            IconButton(
              tooltip: 'Copiar el contrato',
              icon: const Icon(Icons.copy_all_outlined),
              onPressed: _copiar,
            ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: _cargar,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            if (_cargando && c == null) ...const [
              ShimmerBox(height: 70),
              SizedBox(height: 10),
              ShimmerBox(height: 120),
              SizedBox(height: 10),
              ShimmerBox(height: 120),
            ],
            if (_sinContrato)
              EmptyState(
                icon: Icons.description_outlined,
                title: 'Tu contrato aun no esta listo',
                subtitle: _error,
              )
            else if (_error != null)
              ErrorBanner(mensaje: _error!, onRetry: _cargar),
            if (c != null) ..._contenido(c),
          ],
        ),
      ),
    );
  }

  List<Widget> _contenido(Contrato c) {
    final fmt = DateFormat("d 'de' MMMM 'de' y, HH:mm", 'es_CO');
    return [
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.description_outlined, color: AppColors.primary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Contrato de membresia · ${c.gimnasio}',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text(
                    'Version ${c.version}'
                    '${c.entregadoEn != null ? ' · entregado en la app el ${fmt.format(c.entregadoEn!)}' : ''}',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      for (final s in c.secciones)
        Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${s.numero}. ${s.titulo}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              SelectableText(s.texto,
                  style: const TextStyle(fontSize: 13, height: 1.45, color: AppColors.textSecondary)),
            ],
          ),
        ),
    ];
  }
}
