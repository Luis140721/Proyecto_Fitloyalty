// lib/cliente/theme/app_theme.dart
//
// Tema dark de FitLoyalty. Paleta oficial confirmada por el usuario
// (la del frontend React/Vite):
//
//   --color-primary:        #E879F9   (fucsia neón, CTAs, acentos)
//   --color-primary-dark:   #A855F7   (violeta oscuro, hover/pressed)
//   --color-background:     #25272D   (gris oscuro, fondo principal)
//   --color-surface:        #34343F   (tarjetas, containers)
//   --color-panel:          #474754   (paneles elevados)
//   --color-panel-light:    #4C4F57   (paneles más claros)
//   --color-text:           #F5F3F7   (texto principal)
//   --color-text-muted:     #BEBCC6   (texto secundario)
//   --color-border:         #666371   (bordes sutiles)

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AppColors {
  // Fondos (gris oscuro, NO negro puro)
  static const bg          = Color(0xFF25272D);   // --color-background
  static const surface     = Color(0xFF34343F);   // --color-surface
  static const surfaceHigh = Color(0xFF474754);   // --color-panel
  static const panelLight  = Color(0xFF4C4F57);   // --color-panel-light
  static const border      = Color(0xFF666371);   // --color-border

  // Acentos — fucsia + violeta (paleta oficial)
  static const primary     = Color(0xFFE879F9);   // --color-primary  fucsia neón
  static const primaryDark = Color(0xFFA855F7);   // --color-primary-dark  violeta oscuro
  static const primarySoft = Color(0xFFC4A6F2);   // lila (derivado)
  static const accent      = Color(0xFFE879F9);   // alias del primary
  static const success     = Color(0xFF34D399);
  static const warning     = Color(0xFFFACC15);
  static const danger      = Color(0xFFEF4444);

  // Texto
  static const textPrimary   = Color(0xFFF5F3F7);  // --color-text
  static const textSecondary = Color(0xFFBEBCC6);  // --color-text-muted
  static const textMuted     = Color(0xFF8E8C96);  // derivado
}

class AppTheme {
  static ThemeData get dark {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.bg,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.primary,
        onPrimary: Colors.black,
        secondary: AppColors.accent,
        onSecondary: Colors.black,
        surface: AppColors.surface,
        onSurface: AppColors.textPrimary,
        error: AppColors.danger,
      ),
      fontFamily: 'Roboto',
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.4,
          color: AppColors.textPrimary,
        ),
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: AppColors.border, width: 1),
        ),
        margin: EdgeInsets.zero,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: -0.2),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.textPrimary,
          minimumSize: const Size.fromHeight(48),
          side: const BorderSide(color: AppColors.border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: AppColors.primary),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceHigh,
        hintStyle: const TextStyle(color: AppColors.textMuted),
        labelStyle: const TextStyle(color: AppColors.textSecondary),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.danger),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.surface,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.textMuted,
        type: BottomNavigationBarType.fixed,
        showUnselectedLabels: true,
        selectedLabelStyle: TextStyle(fontWeight: FontWeight.w700, fontSize: 11),
        unselectedLabelStyle: TextStyle(fontWeight: FontWeight.w500, fontSize: 11),
      ),
      dividerColor: AppColors.border,
      textTheme: const TextTheme(
        headlineSmall: TextStyle(fontWeight: FontWeight.w800, color: AppColors.textPrimary, letterSpacing: -0.4),
        titleLarge:     TextStyle(fontWeight: FontWeight.w800, color: AppColors.textPrimary, letterSpacing: -0.3),
        titleMedium:    TextStyle(fontWeight: FontWeight.w700, color: AppColors.textPrimary, letterSpacing: -0.2),
        bodyLarge:      TextStyle(color: AppColors.textPrimary, fontSize: 15),
        bodyMedium:     TextStyle(color: AppColors.textSecondary, fontSize: 14),
        labelSmall:     TextStyle(color: AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4),
      ),
    );
  }
}
