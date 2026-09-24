// lib/cliente/screens/editar_perfil_screen.dart
//
// Pantalla de edicion del perfil. El miembro solo puede cambiar campos
// personales (telefono, email, direccion, contacto de emergencia, salud y
// objetivo). NO puede cambiar documento ni QR ni nada de gestion interna.
//
// Al guardar: PUT /api/cliente/me -> actualiza el AuthProvider.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../providers/perfil_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class EditarPerfilScreen extends StatefulWidget {
  const EditarPerfilScreen({super.key});

  @override
  State<EditarPerfilScreen> createState() => _EditarPerfilScreenState();
}

class _EditarPerfilScreenState extends State<EditarPerfilScreen> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _telefonoCtrl;
  late final TextEditingController _emailCtrl;
  late final TextEditingController _direccionCtrl;
  late final TextEditingController _contactoCtrl;
  late final TextEditingController _telEmerCtrl;
  late final TextEditingController _condicionesCtrl;
  late final TextEditingController _alergiasCtrl;
  late final TextEditingController _objetivoCtrl;

  String? _nivelSeleccionado;
  bool _guardando = false;

  static const _niveles = ['PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO'];

  @override
  void initState() {
    super.initState();
    final m = context.read<AuthProvider>().miembro!;
    _telefonoCtrl    = TextEditingController(text: m.telefono ?? '');
    _emailCtrl       = TextEditingController(text: m.email ?? '');
    _direccionCtrl   = TextEditingController();
    _contactoCtrl    = TextEditingController();
    _telEmerCtrl     = TextEditingController();
    _condicionesCtrl = TextEditingController();
    _alergiasCtrl    = TextEditingController();
    _objetivoCtrl    = TextEditingController();
    _nivelSeleccionado = null;
  }

  @override
  void dispose() {
    _telefonoCtrl.dispose();
    _emailCtrl.dispose();
    _direccionCtrl.dispose();
    _contactoCtrl.dispose();
    _telEmerCtrl.dispose();
    _condicionesCtrl.dispose();
    _alergiasCtrl.dispose();
    _objetivoCtrl.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _guardando = true);

    final p = context.read<PerfilProvider>();
    final m = await p.actualizarPerfil(
      telefono:            _telefonoCtrl.text.trim(),
      email:               _emailCtrl.text.trim().isEmpty ? '' : _emailCtrl.text.trim(),
      direccion:           _direccionCtrl.text.trim(),
      contactoEmergencia:  _contactoCtrl.text.trim(),
      telefonoEmergencia:  _telEmerCtrl.text.trim(),
      condicionesMedicas:  _condicionesCtrl.text.trim(),
      alergias:            _alergiasCtrl.text.trim(),
      objetivo:            _objetivoCtrl.text.trim(),
      nivelExperiencia:    _nivelSeleccionado,
    );

    if (!mounted) return;
    setState(() => _guardando = false);

    if (m != null) {
      // Reflejar en el AuthProvider para que el resto de pantallas vean el cambio.
      context.read<AuthProvider>().setMiembro(m);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Perfil actualizado'),
          backgroundColor: AppColors.surfaceHigh,
          behavior: SnackBarBehavior.floating,
        ),
      );
      Navigator.pop(context);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(p.editError ?? 'No pudimos guardar los cambios.'),
          backgroundColor: AppColors.danger.withValues(alpha: 0.85),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PerfilProvider>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Editar perfil'),
        actions: [
          TextButton(
            onPressed: _guardando ? null : _guardar,
            child: const Text('Guardar', style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            _seccion('CONTACTO'),
            TextFormField(
              controller: _telefonoCtrl,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
              decoration: const InputDecoration(
                labelText: 'Telefono',
                prefixIcon: Icon(Icons.phone_outlined),
                hintText: '3001234567',
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return 'Ingresa tu telefono';
                if (!RegExp(r'^[3]\d{9}$').hasMatch(v)) return 'Debe ser 10 digitos y empezar por 3';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _emailCtrl,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: 'Correo (opcional)',
                prefixIcon: Icon(Icons.alternate_email),
                hintText: 'tucorreo@ejemplo.com',
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return null;
                if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v)) return 'Correo invalido';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _direccionCtrl,
              decoration: const InputDecoration(
                labelText: 'Direccion',
                prefixIcon: Icon(Icons.location_on_outlined),
              ),
              maxLines: 2,
            ),

            const SizedBox(height: 22),
            _seccion('CONTACTO DE EMERGENCIA'),
            TextFormField(
              controller: _contactoCtrl,
              decoration: const InputDecoration(
                labelText: 'Nombre del contacto',
                prefixIcon: Icon(Icons.contact_phone_outlined),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _telEmerCtrl,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(15)],
              decoration: const InputDecoration(
                labelText: 'Telefono de emergencia',
                prefixIcon: Icon(Icons.phone_callback_outlined),
              ),
            ),

            const SizedBox(height: 22),
            _seccion('SALUD'),
            TextFormField(
              controller: _condicionesCtrl,
              decoration: const InputDecoration(
                labelText: 'Condiciones medicas',
                helperText: 'Lesiones, alergias medicamentosas, enfermedades',
                prefixIcon: Icon(Icons.medical_information_outlined),
              ),
              maxLines: 3,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _alergiasCtrl,
              decoration: const InputDecoration(
                labelText: 'Alergias',
                prefixIcon: Icon(Icons.sick_outlined),
              ),
              maxLines: 2,
            ),

            const SizedBox(height: 22),
            _seccion('ENTRENAMIENTO'),
            TextFormField(
              controller: _objetivoCtrl,
              decoration: const InputDecoration(
                labelText: 'Objetivo',
                helperText: 'Bajar de peso, hipertrofia, resistencia, etc.',
                prefixIcon: Icon(Icons.flag_outlined),
              ),
              maxLines: 2,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _nivelSeleccionado,
              decoration: const InputDecoration(
                labelText: 'Nivel de experiencia',
                prefixIcon: Icon(Icons.bar_chart_outlined),
              ),
              items: _niveles
                  .map((n) => DropdownMenuItem(value: n, child: Text(n[0] + n.substring(1).toLowerCase())))
                  .toList(),
              onChanged: (v) => setState(() => _nivelSeleccionado = v),
            ),

            const SizedBox(height: 30),
            FilledButton(
              onPressed: _guardando ? null : _guardar,
              child: _guardando
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                  : const Text('Guardar cambios'),
            ),
            if (p.editError != null) ...[
              const SizedBox(height: 16),
              ErrorBanner(mensaje: p.editError!),
            ],
          ],
        ),
      ),
    );
  }

  Widget _seccion(String titulo) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 4, 0, 10),
      child: Text(titulo,
          style: const TextStyle(
            fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6,
            color: AppColors.textMuted,
          )),
    );
  }
}
