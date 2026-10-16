// lib/cliente/models/membresia.dart
//
// Modelo del plan vigente del miembro. Viene de GET /api/cliente/membresia.

class Membresia {
  final int? idPlanCobro;
  final String? tipoPlan;
  final DateTime? fechaInicio;
  final DateTime? fechaFin;
  final String? estadoPago;       // PENDIENTE / PAGADO / PARCIAL / ANULADO
  final double? valorTotal;
  final double? valorPagado;
  final String? metodoPago;
  final DateTime? proximaFechaCobro;
  final bool activo;
  final bool vencido;
  final bool vencePronto;
  final int? diasParaVencer;      // negativo si ya esta vencido

  const Membresia({
    this.idPlanCobro,
    this.tipoPlan,
    this.fechaInicio,
    this.fechaFin,
    this.estadoPago,
    this.valorTotal,
    this.valorPagado,
    this.metodoPago,
    this.proximaFechaCobro,
    this.activo = true,
    this.vencido = false,
    this.vencePronto = false,
    this.diasParaVencer,
  });

  bool get pagada => estadoPago == 'PAGADO';
  bool get pendiente => estadoPago == 'PENDIENTE';
  bool get parcial => estadoPago == 'PARCIAL';

  /// Etiqueta humana del estado para mostrar en la UI.
  String get estadoLegible {
    if (vencido) return 'Vencida';
    if (vencePronto) return 'Vence pronto';
    if (diasParaVencer != null && diasParaVencer! <= 30 && diasParaVencer! >= 0) {
      return 'Activa';
    }
    return 'Activa';
  }

  factory Membresia.fromJson(Map<String, dynamic> json) {
    return Membresia(
      idPlanCobro:      _toInt(json['id_plan_cobro']),
      tipoPlan:         json['tipo_plan']      as String?,
      fechaInicio:      _toDate(json['fecha_inicio']),
      fechaFin:         _toDate(json['fecha_fin']),
      estadoPago:       json['estado_pago']    as String?,
      valorTotal:       _toDouble(json['valor_total']),
      valorPagado:      _toDouble(json['valor_pagado']),
      metodoPago:       json['metodo_pago']    as String?,
      proximaFechaCobro: _toDate(json['proxima_fecha_cobro']),
      activo:           json['activo']         as bool? ?? true,
      vencido:          json['vencido']        as bool? ?? false,
      vencePronto:      json['vencepronto']    as bool? ?? false,
      diasParaVencer:   _toInt(json['dias_para_vencer']),
    );
  }

  static int? _toInt(dynamic v) {
    if (v == null) return null;
    if (v is int) return v;
    return int.tryParse(v.toString());
  }

  static double? _toDouble(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString());
  }

  static DateTime? _toDate(dynamic v) {
    if (v == null) return null;
    if (v is DateTime) return v;
    return DateTime.tryParse(v.toString());
  }
}
