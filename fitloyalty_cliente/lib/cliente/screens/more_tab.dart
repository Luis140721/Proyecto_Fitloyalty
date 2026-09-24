// lib/cliente/screens/more_tab.dart
//
// Pestana "Mas": agrupa todo lo secundario que no es QR ni Plan:
//   - Mi asistencia (historial de check-ins)
//   - Mis logros (gamificacion)
//   - Retos activos
//   - Mi perfil (con editar)
//   - Cerrar sesion

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';
import 'asistencia_screen.dart';
import 'gamificacion_screen.dart';
import 'perfil_screen.dart';
import 'login_screen.dart';

class MoreTab extends StatelessWidget {
  const MoreTab({super.key});

  Future<void> _cerrarSesion(BuildContext context) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Cerrar sesion?'),
        content: const Text('Tendras que volver a ingresar tu documento y PIN.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger, minimumSize: const Size(96, 40)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cerrar sesion'),
          ),
        ],
      ),
    );
    if (confirmar != true) return;
    if (!context.mounted) return;
    await context.read<AuthProvider>().logout();
    if (!context.mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final m = auth.miembro;

    return Scaffold(
      appBar: AppBar(title: const Text('Mas')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          // Tarjeta con resumen del miembro
          if (m != null)
            Container(
              margin: const EdgeInsets.only(bottom: 18),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  Container(
                    width: 50, height: 50, alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        colors: [AppColors.primary, AppColors.primary.withValues(alpha: 0.6)],
                      ),
                    ),
                    child: Text(
                      m.iniciales,
                      style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(m.nombre, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 2),
                        Text('CC ${m.documento}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                      ],
                    ),
                  ),
                ],
              ),
            ),

          _SectionLabel('Tu actividad'),
          _MenuTile(
            icon: Icons.event_available_outlined,
            color: AppColors.success,
            title: 'Mi asistencia',
            subtitle: 'Mira tus ultimos ingresos al gimnasio',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AsistenciaScreen())),
          ),
          _MenuTile(
            icon: Icons.emoji_events_outlined,
            color: AppColors.warning,
            title: 'Mis logros y retos',
            subtitle: 'Puntos, hitos y retos activos',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const GamificacionScreen())),
          ),

          const SizedBox(height: 18),
          _SectionLabel('Tu cuenta'),
          _MenuTile(
            icon: Icons.person_outline,
            color: AppColors.primary,
            title: 'Mi perfil',
            subtitle: 'Ver y editar tus datos personales',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PerfilScreen())),
          ),
          _MenuTile(
            icon: Icons.logout,
            color: AppColors.danger,
            title: 'Cerrar sesion',
            subtitle: 'Salir de la app en este celular',
            onTap: () => _cerrarSesion(context),
          ),

          const SizedBox(height: 24),
          const Center(
            child: Text(
              'FitLoyalty Cliente v1.0.0',
              style: TextStyle(color: AppColors.textMuted, fontSize: 11, letterSpacing: 0.5),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel(this.label);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 0, 10),
      child: Text(
        label.toUpperCase(),
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
          color: AppColors.textMuted,
        ),
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _MenuTile({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: ListTile(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: color, size: 22),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(subtitle, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ),
        trailing: const Icon(Icons.chevron_right, color: AppColors.textMuted),
        onTap: onTap,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      ),
    );
  }
}
