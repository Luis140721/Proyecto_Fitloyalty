// lib/cliente/screens/gamificacion_screen.dart
//
// Pantalla "Mis logros y retos":
//   - Resumen (puntos, % completado)
//   - Lista de hitos (logrados vs disponibles)
//   - Lista de retos activos

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/gamificacion.dart';
import '../providers/perfil_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class GamificacionScreen extends StatefulWidget {
  const GamificacionScreen({super.key});

  @override
  State<GamificacionScreen> createState() => _GamificacionScreenState();
}

class _GamificacionScreenState extends State<GamificacionScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final p = context.read<PerfilProvider>();
      p.cargarGamificacion();
      p.cargarRetos();
    });
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PerfilProvider>();
    final r = p.gamificacionResumen;
    final fmtFecha = DateFormat('d MMM yyyy', 'es_CO');

    return Scaffold(
      appBar: AppBar(title: const Text('Mis logros y retos')),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () async {
          await Future.wait([p.cargarGamificacion(), p.cargarRetos()]);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            // Resumen
            _resumenCard(r, p.gamificacionStatus),
            const SizedBox(height: 22),

            // Hitos
            const Text('HITOS',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: AppColors.textMuted)),
            const SizedBox(height: 10),
            _hitos(p, fmtFecha),
            if (p.gamificacionError != null) ...[
              const SizedBox(height: 12),
              ErrorBanner(mensaje: p.gamificacionError!, onRetry: () => p.cargarGamificacion()),
            ],

            const SizedBox(height: 22),

            // Retos
            const Text('RETOS ACTIVOS',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: AppColors.textMuted)),
            const SizedBox(height: 10),
            _retos(p),
            if (p.retosError != null) ...[
              const SizedBox(height: 12),
              ErrorBanner(mensaje: p.retosError!, onRetry: () => p.cargarRetos()),
            ],
          ],
        ),
      ),
    );
  }

  Widget _resumenCard(GamificacionResumen r, DataStatus status) {
    if (status == DataStatus.loading) return const ShimmerBox(height: 130);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.warning.withValues(alpha: 0.22), AppColors.surface],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.emoji_events, color: AppColors.warning),
              const SizedBox(width: 8),
              const Text('TU PROGRESO',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: AppColors.warning)),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            '${r.puntosTotales}',
            style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w900, letterSpacing: -1, color: AppColors.textPrimary),
          ),
          const Text('puntos acumulados', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: (r.porcentaje / 100).clamp(0.0, 1.0),
              minHeight: 10,
              backgroundColor: AppColors.border,
              color: AppColors.warning,
            ),
          ),
          const SizedBox(height: 8),
          Text('${r.totalLogrados} de ${r.totalHitos} hitos  ·  ${r.porcentaje}% completado',
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ],
      ),
    );
  }

  Widget _hitos(PerfilProvider p, DateFormat fmt) {
    if (p.gamificacionStatus == DataStatus.loading) {
      return Column(
        children: const [
          ShimmerBox(height: 70),
          SizedBox(height: 8),
          ShimmerBox(height: 70),
        ],
      );
    }
    if (p.hitos.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
        ),
        child: const EmptyState(
          icon: Icons.emoji_events_outlined,
          title: 'Aun no hay hitos',
          subtitle: 'Tu gimnasio aun no ha definido hitos.',
        ),
      );
    }
    return Column(
      children: [
        for (final h in p.hitos) _hitoTile(h, fmt),
      ],
    );
  }

  Widget _hitoTile(Hito h, DateFormat fmt) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: h.logrado ? AppColors.success.withValues(alpha: 0.45) : AppColors.border,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 42, height: 42, alignment: Alignment.center,
            decoration: BoxDecoration(
              color: h.logrado ? AppColors.success.withValues(alpha: 0.18) : AppColors.surfaceHigh,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              h.logrado ? Icons.check_circle : Icons.lock_outline,
              color: h.logrado ? AppColors.success : AppColors.textMuted,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(h.nombre,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: h.logrado ? AppColors.textPrimary : AppColors.textSecondary,
                    )),
                if (h.descripcion != null && h.descripcion!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(h.descripcion!,
                        style: const TextStyle(fontSize: 12, color: AppColors.textMuted, height: 1.3)),
                  ),
                if (h.logrado && h.fechaOtorgado != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('Logrado el ${fmt.format(h.fechaOtorgado!)}',
                        style: const TextStyle(fontSize: 11, color: AppColors.success, fontWeight: FontWeight.w700)),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.warning.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '+${h.puntos}',
              style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w800, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _retos(PerfilProvider p) {
    if (p.retosStatus == DataStatus.loading) {
      return Column(
        children: const [
          ShimmerBox(height: 90),
          SizedBox(height: 8),
          ShimmerBox(height: 90),
        ],
      );
    }
    if (p.retos.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
        ),
        child: const EmptyState(
          icon: Icons.flag_outlined,
          title: 'Sin retos activos',
          subtitle: 'Cuando el gimnasio lance un reto, aparecera aqui.',
        ),
      );
    }
    return Column(
      children: [
        for (final r in p.retos) _retoTile(r),
      ],
    );
  }

  Widget _retoTile(Reto r) {
    final dias = r.diasRestantes;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(r.nombre,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
              ),
              if (r.completado) const StatusChip(label: 'Completado', color: AppColors.success)
              else if (r.participa) const StatusChip(label: 'Inscrito', color: AppColors.primary)
              else const StatusChip(label: 'Disponible', color: AppColors.textMuted),
            ],
          ),
          if (r.descripcion != null && r.descripcion!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(r.descripcion!,
                style: const TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.35)),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(Icons.event_outlined, size: 14, color: AppColors.textMuted),
              const SizedBox(width: 4),
              Text(
                dias >= 0 ? 'Termina en $dias dias' : 'Termino hace ${-dias} dias',
                style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
              const Spacer(),
              if (r.premio != null && r.premio!.isNotEmpty) ...[
                const Icon(Icons.workspace_premium, size: 14, color: AppColors.warning),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(r.premio!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: AppColors.warning, fontWeight: FontWeight.w700)),
                ),
              ],
            ],
          ),
          if (r.participa && r.meta != null && r.checkinsAcumulados != null && !r.completado) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: LinearProgressIndicator(
                      value: ((r.porcentajeAvance ?? 0) / 100).clamp(0.0, 1.0),
                      minHeight: 6,
                      backgroundColor: AppColors.border,
                      color: AppColors.primary,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Text('${r.checkinsAcumulados}/${r.meta} visitas',
                    style: const TextStyle(fontSize: 11, color: AppColors.textSecondary, fontWeight: FontWeight.w700)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
