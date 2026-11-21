// lib/cliente/screens/mensajes_screen.dart
//
// Pestana "Mensajes": lo que el gimnasio le avisa al miembro (issue #46).
//   - Lista con fecha y estado leido / sin leer
//   - Deslizar hacia abajo para refrescar
//   - Tocar un mensaje lo marca como leido
//   - "Marcar todo como leido" en la barra de arriba
//
// Por ahora llegan los retos completados y cancelados (RQF-12).

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/mensaje.dart';
import '../providers/mensajes_provider.dart';
import '../providers/perfil_provider.dart' show DataStatus;
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class MensajesScreen extends StatelessWidget {
  const MensajesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final p = context.watch<MensajesProvider>();
    final fmt = DateFormat("d MMM yyyy, h:mm a", 'es_CO');

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mensajes'),
        actions: [
          if (p.noLeidos > 0)
            TextButton.icon(
              onPressed: () => p.marcarTodos(),
              icon: const Icon(Icons.done_all, size: 18),
              label: const Text('Marcar todo como leido'),
            ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => p.cargar(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            if (p.error != null) ...[
              ErrorBanner(mensaje: p.error!, onRetry: () => p.cargar()),
              const SizedBox(height: 12),
            ],
            if (p.status == DataStatus.loading && p.mensajes.isEmpty) ...const [
              ShimmerBox(height: 76),
              SizedBox(height: 8),
              ShimmerBox(height: 76),
            ] else if (p.mensajes.isEmpty && p.error == null)
              const EmptyState(
                icon: Icons.mark_email_unread_outlined,
                title: 'Sin mensajes',
                subtitle: 'Aqui te avisara tu gimnasio, por ejemplo cuando completes un reto.',
              )
            else
              for (final m in p.mensajes) _mensajeTile(context, m, fmt),
          ],
        ),
      ),
    );
  }

  IconData _icono(String tipo) {
    switch (tipo) {
      case 'RETO':    return Icons.emoji_events;
      case 'ALERTA':  return Icons.warning_amber_rounded;
      case 'CAMPANA': return Icons.campaign_outlined;
      default:        return Icons.notifications_none;
    }
  }

  Widget _mensajeTile(BuildContext context, Mensaje m, DateFormat fmt) {
    final color = m.tipo == 'RETO' ? AppColors.warning : AppColors.primary;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => context.read<MensajesProvider>().marcarLeido(m),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: m.leida ? AppColors.border : color.withValues(alpha: 0.55)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 40, height: 40, alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: m.leida ? 0.08 : 0.18),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(_icono(m.tipo), color: m.leida ? AppColors.textMuted : color, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(m.titulo,
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: m.leida ? FontWeight.w600 : FontWeight.w800,
                                  color: m.leida ? AppColors.textSecondary : AppColors.textPrimary,
                                )),
                          ),
                          if (!m.leida)
                            Semantics(
                              label: 'Sin leer',
                              child: Container(
                                width: 9, height: 9,
                                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(m.mensaje,
                          style: const TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.35)),
                      if (m.fecha != null) ...[
                        const SizedBox(height: 6),
                        Text(fmt.format(m.fecha!),
                            style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
