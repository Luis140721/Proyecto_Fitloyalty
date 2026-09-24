// lib/cliente/screens/splash_screen.dart
//
// Pantalla de carga inicial: mientras el AuthProvider hace checkAuthStatus()
// muestra un spinner simple con el logo. Mismo patron que el _SplashGate del
// Store_Pro_Ss de la profe.

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/common.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            InitialsAvatar(name: 'FL', size: 80, color: AppColors.primary),
            const SizedBox(height: 20),
            const Text(
              'FitLoyalty',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.6,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 30),
            const SizedBox(
              width: 26, height: 26,
              child: CircularProgressIndicator(strokeWidth: 2.2, color: AppColors.primary),
            ),
          ],
        ),
      ),
    );
  }
}
