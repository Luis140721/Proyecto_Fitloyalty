// lib/cliente/screens/qr_tab.dart
//
// Pestana "Mi QR": muestra el codigo QR del miembro para que el staff lo
// escanee en la recepcion. Si el backend envio la imagen PNG en base64, se
// muestra esa; si no, se genera en el cliente con qr_flutter a partir del
// codigo en texto. Tambien permite verlo en pantalla completa.

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../providers/perfil_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'qr_fullscreen.dart';

class QrTab extends StatefulWidget {
  const QrTab({super.key});

  @override
  State<QrTab> createState() => _QrTabState();
}

class _QrTabState extends State<QrTab> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<PerfilProvider>().cargarQr();
    });
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PerfilProvider>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mi QR'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => p.cargarQr(),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => p.cargarQr(),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const SizedBox(height: 8),
            const Center(
              child: Text(
                'Muestra este codigo en recepcion',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
              ),
            ),
            const SizedBox(height: 24),

            // QR
            Center(child: _qrBox(p)),
            const SizedBox(height: 16),

            // Codigo en texto
            if (p.qrCodigo != null)
              Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Text(
                    p.qrCodigo!,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 14, fontWeight: FontWeight.w700,
                      letterSpacing: 1.5,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
              ),

            if (p.qrError != null) ...[
              const SizedBox(height: 24),
              ErrorBanner(mensaje: p.qrError!, onRetry: () => p.cargarQr()),
            ],

            const SizedBox(height: 24),
            if (p.qrCodigo != null)
              OutlinedButton.icon(
                icon: const Icon(Icons.fullscreen),
                label: const Text('Ver en pantalla completa'),
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => QrFullscreen(codigo: p.qrCodigo!, imagenDataUrl: p.qrImagen)),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _qrBox(PerfilProvider p) {
    if (p.qrStatus == DataStatus.loading) {
      return const ShimmerBox(height: 280, width: 280, radius: 24);
    }
    if (p.qrCodigo == null || p.qrCodigo!.isEmpty) {
      return Container(
        width: 280, height: 280,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: AppColors.border),
        ),
        child: const EmptyState(
          icon: Icons.qr_code_2,
          title: 'Sin QR asignado',
          subtitle: 'Pide al administrador que te asigne uno.',
        ),
      );
    }
    final imagenBase64 = p.qrImagen;

    Widget child;
    if (imagenBase64 != null && imagenBase64.contains('base64,')) {
      final b64 = imagenBase64.split('base64,').last;
      try {
        final bytes = base64Decode(b64);
        child = Image.memory(bytes, width: 280, height: 280, fit: BoxFit.contain, gaplessPlayback: true);
      } catch (_) {
        child = _renderQrLocal(p.qrCodigo!);
      }
    } else {
      child = _renderQrLocal(p.qrCodigo!);
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(color: AppColors.primary.withValues(alpha: 0.18), blurRadius: 30, spreadRadius: 4),
        ],
      ),
      child: child,
    );
  }

  Widget _renderQrLocal(String codigo) {
    return SizedBox(
      width: 252, height: 252,
      child: QrImageView(
        data: codigo,
        version: QrVersions.auto,
        backgroundColor: Colors.white,
        eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Colors.black),
        dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: Colors.black),
      ),
    );
  }
}
