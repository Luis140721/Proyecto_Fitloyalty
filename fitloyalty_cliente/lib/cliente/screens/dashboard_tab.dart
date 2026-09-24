// lib/cliente/screens/dashboard_tab.dart
//
// Pestana "Inicio": resumen rapido del miembro.
//   - Saludo + nombre + gimnasio
//   - KPIs: checkins hoy, este mes, puntos de gamificacion
//   - Hito destacado (el mas reciente logrado) o CTA si no hay ninguno
//   - Atajos a las demas secciones

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../providers/perfil_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class DashboardTab extends StatefulWidget {
  const DashboardTab({super.key});

  @override
  State<DashboardTab> createState() => _DashboardTabState();
}

class _DashboardTabState extends State<DashboardTab> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final p = context.read<PerfilProvider>();
      p.cargarAsistencia();
      p.cargarGamificacion();
      p.cargarMembresia();
    });
  }

  String _saludo() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Buenos dias';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final m = auth.miembro;
    final p = context.watch<PerfilProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Inicio'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              auth.refresh();
              p.cargarAsistencia();
              p.cargarGamificacion();
              p.cargarMembresia();
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () async {
          await auth.refresh();
          await Future.wait([p.cargarAsistencia(), p.cargarGamificacion(), p.cargarMembresia()]);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            // Saludo
            Text(
              _saludo() + (m != null ? ',' : ''),
              style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 2),
            Text(
              m?.nombre.split(' ').first ?? 'Bienvenido',
              style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: -0.6),
            ),
            if (m?.gimnasio?.nombre != null) ...[
              const SizedBox(height: 2),
              Row(
                children: [
                  const Icon(Icons.fitness_center, size: 14, color: AppColors.textMuted),
                  const SizedBox(width: 6),
                  Text(
                    m!.gimnasio!.nombre,
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 20),

            // KPIs
            _kpisGrid(p),
            const SizedBox(height: 20),

            // Hito destacado
            _hitoDestacado(p),
            const SizedBox(height: 20),

            // Plan resumen
            _planResumen(p),
          ],
        ),
      ),
    );
  }

  Widget _kpisGrid(PerfilProvider p) {
    final resumen = p.resumenAsistencia;
    final gam = p.gamificacionResumen;
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.4,
      children: [
        KpiCard(
          label: 'Visitas hoy',
          value: p.asistenciaStatus == DataStatus.loaded ? '${resumen.hoy}' : '—',
          icon: Icons.bolt,
          accent: AppColors.primary,
          meta: resumen.hoy > 0 ? '¡Excelente!' : 'Todavia no vienes hoy',
        ),
        KpiCard(
          label: 'Este mes',
          value: p.asistenciaStatus == DataStatus.loaded ? '${resumen.esteMes}' : '—',
          icon: Icons.calendar_month,
          meta: 'Ingresos al gimnasio',
        ),
        KpiCard(
          label: 'Puntos',
          value: p.gamificacionStatus == DataStatus.loaded ? '${gam.puntosTotales}' : '—',
          icon: Icons.star_rounded,
          accent: AppColors.warning,
          meta: '${gam.totalLogrados}/${gam.totalHitos} hitos',
        ),
        KpiCard(
          label: 'Asistencias totales',
          value: p.asistenciaStatus == DataStatus.loaded ? '${resumen.total}' : '—',
          icon: Icons.local_fire_department,
          accent: AppColors.success,
          meta: 'Historico',
        ),
      ],
    );
  }

  Widget _hitoDestacado(PerfilProvider p) {
    if (p.gamificacionStatus == DataStatus.loading) {
      return const ShimmerBox(height: 96);
    }
    final hitos = p.hitos.where((h) => h.logrado).toList();
    if (hitos.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            const Icon(Icons.emoji_events_outlined, color: AppColors.warning, size: 30),
            const SizedBox(width: 14),
            const Expanded(
              child: Text(
                'Aun no tienes hitos. Empieza a entrenar y completa retos para ganar puntos.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.4),
              ),
            ),
          ],
        ),
      );
    }
    // Mostrar el mas reciente
    hitos.sort((a, b) => (b.fechaOtorgado ?? DateTime(2000)).compareTo(a.fechaOtorgado ?? DateTime(2000)));
    final h = hitos.first;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.primary.withValues(alpha: 0.18), AppColors.surface],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.emoji_events, color: AppColors.primary, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('ULTIMO LOGRO',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: AppColors.primary)),
                const SizedBox(height: 4),
                Text(h.nombre,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
                if (h.fechaOtorgado != null)
                  Text(
                    'Logrado el ${DateFormat('d MMM yyyy', 'es_CO').format(h.fechaOtorgado!)}',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _planResumen(PerfilProvider p) {
    if (p.membresiaStatus == DataStatus.loading) {
      return const ShimmerBox(height: 96);
    }
    final mb = p.membresia;
    if (mb == null) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
        ),
        child: const Row(
          children: [
            Icon(Icons.info_outline, color: AppColors.textMuted),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Aun no tienes un plan activo. Habla con la recepcion.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
              ),
            ),
          ],
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.card_membership, color: AppColors.primary, size: 22),
              const SizedBox(width: 10),
              const Text('MI PLAN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: AppColors.primary)),
              const Spacer(),
              if (mb.vencido)         StatusChip.danger('Vencida')
              else if (mb.vencePronto) StatusChip.warning('Vence pronto')
              else                     StatusChip.success('Al dia'),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            mb.tipoPlan != null ? mb.tipoPlan!.toLowerCase() : 'Plan activo',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.5),
          ),
          const SizedBox(height: 6),
          if (mb.fechaFin != null)
            Text(
              mb.vencido
                  ? 'Vencio el ${DateFormat('d MMM yyyy', 'es_CO').format(mb.fechaFin!)}'
                  : 'Vence el ${DateFormat('d MMM yyyy', 'es_CO').format(mb.fechaFin!)}',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
        ],
      ),
    );
  }
}
