// lib/cliente/widgets/qr_dinamico_view.dart
//
// Muestra el QR dinamico y lo redibuja cada segundo, con la cuenta regresiva
// hasta el siguiente cambio.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../theme/app_theme.dart';
import '../utils/qr_dinamico.dart';

class QrDinamicoView extends StatefulWidget {
  final QrDinamico qr;
  final double size;
  final bool oscuro;

  const QrDinamicoView({super.key, required this.qr, this.size = 252, this.oscuro = false});

  @override
  State<QrDinamicoView> createState() => _QrDinamicoViewState();
}

class _QrDinamicoViewState extends State<QrDinamicoView> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final token = widget.qr.tokenEn();
    final quedan = widget.qr.segundosRestantes();
    final textoColor = widget.oscuro ? Colors.white70 : AppColors.textSecondary;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(color: AppColors.primary.withValues(alpha: 0.18), blurRadius: 30, spreadRadius: 4),
            ],
          ),
          child: SizedBox(
            width: widget.size,
            height: widget.size,
            child: QrImageView(
              key: ValueKey(token),
              data: token,
              version: QrVersions.auto,
              backgroundColor: Colors.white,
              eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Colors.black),
              dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: Colors.black),
            ),
          ),
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: widget.size,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: quedan / widget.qr.pasoSeg,
              minHeight: 6,
              backgroundColor: widget.oscuro ? Colors.white24 : AppColors.border,
              color: AppColors.primary,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.autorenew, size: 14, color: textoColor),
            const SizedBox(width: 4),
            Text(
              'Cambia en $quedan s · las capturas no sirven',
              style: TextStyle(fontSize: 12, color: textoColor),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          token,
          style: TextStyle(
            fontFamily: 'monospace',
            fontSize: 13,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.2,
            color: widget.oscuro ? Colors.white : AppColors.textPrimary,
          ),
        ),
      ],
    );
  }
}
