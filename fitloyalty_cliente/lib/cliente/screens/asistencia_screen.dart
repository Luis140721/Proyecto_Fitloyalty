// lib/cliente/screens/asistencia_screen.dart
//
// Pantalla "Mi asistencia": KPIs (hoy / mes / total) + lista de los
// ultimos check-ins.

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/asistencia.dart';
import '../providers/perfil_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class AsistenciaScreen extends StatefulWidget {
  const AsistenciaScreen({super.key});

  @override
  State<AsistenciaScreen> createState() => _AsistenciaScreenState();
}

class _AsistenciaScreenState extends State<AsistenciaScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<PerfilProvider>().cargarAsistencia();
    });
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PerfilProvider>();
    final r = p.resumenAsistencia;

    return Scaffold(
      appBar: AppBar(title: const Text('Mi asistencia')),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => p.cargarAsistencia(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.05,
              children: [
                KpiCard(
                  label: 'Hoy',
                  value: p.asistenciaStatus == DataStatus.loaded ? '${r.hoy}' : '—',
                  icon: Icons.bolt,
                  accent: AppColors.primary,
                ),
                KpiCard(
                  label: 'Este mes',
                  value: p.asistenciaStatus == DataStatus.loaded ? '${r.esteMes}' : '—',
                  icon: Icons.calendar_month,
                ),
                KpiCard(
                  label: 'Total',
                  value: p.asistenciaStatus == DataStatus.loaded ? '${r.total}' : '—',
                  icon: Icons.local_fire_department,
                  accent: AppColors.success,
                ),
              ],
            ),
            const SizedBox(height: 18),
            const Text('ULTIMOS INGRESOS',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: AppColors.textMuted)),
            const SizedBox(height: 10),
            _lista(p),
            if (p.asistenciaError != null) ...[
              const SizedBox(height: 18),
              ErrorBanner(mensaje: p.asistenciaError!, onRetry: () => p.cargarAsistencia()),
            ],
          ],
        ),
      ),
    );
  }

  Widget _lista(PerfilProvider p) {
    if (p.asistenciaStatus == DataStatus.loading) {
      return Column(
        children: const [
          ShimmerBox(height: 64),
          SizedBox(height: 8),
          ShimmerBox(height: 64),
          SizedBox(height: 8),
          ShimmerBox(height: 64),
        ],
      );
    }
    if (p.checkins.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
        ),
        child: const EmptyState(
          icon: Icons.event_busy,
          title: 'Aun no hay ingresos',
          subtitle: 'Cuando pases tu QR en recepcion, aparecera aqui.',
        ),
      );
    }
    return Column(
      children: [
        for (final c in p.checkins) _checkinTile(c),
      ],
    );
  }

  Widget _checkinTile(Checkin c) {
    final fmtFecha = DateFormat('EEEE d MMM', 'es_CO');
    final fmtHora  = DateFormat('HH:mm', 'es_CO');
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.qr_code_scanner, color: AppColors.primary, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(fmtFecha.format(c.fechaHora).toUpperCase(),
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.textPrimary, letterSpacing: 0.3)),
                const SizedBox(height: 2),
                Text('${fmtHora.format(c.fechaHora)}  ·  ${c.metodoLegible}',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
