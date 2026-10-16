// lib/cliente/screens/plan_tab.dart
//
// Pestana "Mi plan": membresia vigente + datos del gimnasio.
// Si no hay plan activo, CTA para que hable con la recepcion.

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/membresia.dart';
import '../providers/auth_provider.dart';
import '../providers/perfil_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class PlanTab extends StatefulWidget {
  const PlanTab({super.key});

  @override
  State<PlanTab> createState() => _PlanTabState();
}

class _PlanTabState extends State<PlanTab> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<PerfilProvider>().cargarMembresia();
    });
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PerfilProvider>();
    final auth = context.watch<AuthProvider>();
    final m = auth.miembro;
    final fmtFecha = DateFormat("d 'de' MMMM 'de' yyyy", 'es_CO');

    return Scaffold(
      appBar: AppBar(title: const Text('Mi plan')),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => p.cargarMembresia(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            _gymCard(m?.gimnasio?.nombre ?? 'Tu gimnasio'),
            const SizedBox(height: 16),
            _membresiaCard(p.membresia, fmtFecha, p.membresiaStatus),
            if (p.membresiaError != null) ...[
              const SizedBox(height: 16),
              ErrorBanner(mensaje: p.membresiaError!, onRetry: () => p.cargarMembresia()),
            ],
          ],
        ),
      ),
    );
  }

  Widget _gymCard(String nombre) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.fitness_center, color: AppColors.primary, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('GIMNASIO', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: AppColors.textMuted)),
                const SizedBox(height: 4),
                Text(nombre, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _membresiaCard(Membresia? mb, DateFormat fmt, DataStatus status) {
    if (status == DataStatus.loading) return const ShimmerBox(height: 220);
    if (mb == null) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
        ),
        child: const EmptyState(
          icon: Icons.card_membership_outlined,
          title: 'Sin plan activo',
          subtitle: 'Pasa por recepcion del gimnasio para activar tu membresia.',
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.primary.withValues(alpha: 0.20), AppColors.surface],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.card_membership, color: AppColors.primary),
              const SizedBox(width: 8),
              const Text('MEMBRESIA', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: AppColors.primary)),
              const Spacer(),
              if (mb.vencido)         StatusChip.danger('Vencida')
              else if (mb.vencePronto) StatusChip.warning('Vence pronto')
              else                     StatusChip.success('Al dia'),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            mb.tipoPlan != null ? mb.tipoPlan![0].toUpperCase() + mb.tipoPlan!.substring(1).toLowerCase() : 'Plan activo',
            style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: -0.6, color: AppColors.textPrimary),
          ),
          const SizedBox(height: 18),
          _row('Inicio',  mb.fechaInicio != null ? fmt.format(mb.fechaInicio!) : '—'),
          _row('Vence',   mb.fechaFin    != null ? fmt.format(mb.fechaFin!)    : '—', highlight: true),
          if (mb.diasParaVencer != null)
            _row('Dias restantes', mb.diasParaVencer! >= 0 ? '${mb.diasParaVencer}' : 'Vencio hace ${-mb.diasParaVencer!} dias'),
          const Divider(color: AppColors.border, height: 28),
          _row('Estado de pago', _estadoPagoLegible(mb.estadoPago)),
          if (mb.metodoPago != null) _row('Metodo', mb.metodoPago!),
          if (mb.valorTotal  != null) _row('Valor',   _money(mb.valorTotal!)),
          if (mb.valorPagado != null && mb.valorPagado! > 0) _row('Abonado', _money(mb.valorPagado!)),
        ],
      ),
    );
  }

  Widget _row(String label, String value, {bool highlight = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 14,
              fontWeight: highlight ? FontWeight.w800 : FontWeight.w600,
              color: highlight ? AppColors.primary : AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }

  String _estadoPagoLegible(String? estado) {
    switch (estado) {
      case 'PAGADO':    return 'Pagado';
      case 'PENDIENTE': return 'Pendiente';
      case 'PARCIAL':   return 'Pago parcial';
      case 'ANULADO':   return 'Anulado';
      default:          return estado ?? '—';
    }
  }

  String _money(double v) {
    final f = NumberFormat.currency(locale: 'es_CO', symbol: r'$', decimalDigits: 0);
    return f.format(v);
  }
}
