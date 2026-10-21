// lib/cliente/screens/qr_fullscreen.dart
//
// Pantalla completa con zoom para mostrar el QR al staff. Usa photo_view.

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:photo_view/photo_view.dart';
import 'package:qr_flutter/qr_flutter.dart';

class QrFullscreen extends StatelessWidget {
  final String codigo;
  final String? imagenDataUrl;

  const QrFullscreen({super.key, required this.codigo, this.imagenDataUrl});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: Text(codigo, style: const TextStyle(fontFamily: 'monospace', fontSize: 14)),
      ),
      body: Center(child: _body()),
    );
  }

  Widget _body() {
    if (imagenDataUrl != null && imagenDataUrl!.contains('base64,')) {
      final b64 = imagenDataUrl!.split('base64,').last;
      try {
        final bytes = base64Decode(b64);
        return PhotoView(
          imageProvider: MemoryImage(bytes),
          minScale: PhotoViewComputedScale.contained,
          maxScale: PhotoViewComputedScale.covered * 3,
          backgroundDecoration: const BoxDecoration(color: Colors.black),
        );
      } catch (_) {
        // cae al render local
      }
    }
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
        ),
        child: QrImageView(
          data: codigo,
          version: QrVersions.auto,
          backgroundColor: Colors.white,
          eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Colors.black),
          dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: Colors.black),
        ),
      ),
    );
  }
}
