// lib/cliente/screens/perfil_screen.dart
//
// Pantalla "Mi perfil": muestra todos los datos del miembro y permite entrar
// a editar. Solo lectura aca; la edicion va a EditarPerfilScreen.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'editar_perfil_screen.dart';

class PerfilScreen extends StatelessWidget {
  const PerfilScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final m = context.watch<AuthProvider>().miembro;

    return Scaffold(
      appBar: AppBar(title: const Text('Mi perfil')),
      body: m == null
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              children: [
                // Header con avatar grande
                Center(
                  child: Column(
                    children: [
                      InitialsAvatar(name: m.nombre, size: 90),
                      const SizedBox(height: 14),
                      Text(m.nombre,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.4)),
                      const SizedBox(height: 4),
                      Text('CC ${m.documento}',
                          style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                      if (m.gimnasio?.nombre != null) ...[
                        const SizedBox(height: 6),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.fitness_center, size: 14, color: AppColors.textMuted),
                            const SizedBox(width: 4),
                            Text(m.gimnasio!.nombre,
                                style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 22),

                // Boton editar
                FilledButton.icon(
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Editar mi informacion'),
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const EditarPerfilScreen()),
                  ),
                ),
                const SizedBox(height: 22),

                _seccion('CONTACTO', [
                  _item(Icons.phone_outlined,       'Telefono', m.telefono  ?? '—'),
                  _item(Icons.alternate_email,      'Correo',   m.email     ?? '—'),
                  _item(Icons.location_on_outlined, 'Direccion', '—', valorVacio: true),
                ]),

                const SizedBox(height: 14),
                _seccion('EMERGENCIA', [
                  _item(Icons.contact_phone_outlined, 'Contacto',  '—', valorVacio: true),
                  _item(Icons.phone_callback_outlined, 'Telefono', '—', valorVacio: true),
                ]),

                const SizedBox(height: 14),
                _seccion('SALUD', [
                  _item(Icons.medical_information_outlined, 'Condiciones medicas', '—', valorVacio: true),
                  _item(Icons.sick_outlined,                'Alergias',             '—', valorVacio: true),
                ]),

                const SizedBox(height: 14),
                _seccion('ENTRENAMIENTO', [
                  _item(Icons.flag_outlined, 'Objetivo',          '—', valorVacio: true),
                  _item(Icons.bar_chart_outlined, 'Nivel',        '—', valorVacio: true),
                ]),
              ],
            ),
    );
  }

  Widget _seccion(String titulo, List<Widget> hijos) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
            child: Text(titulo,
                style: const TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w800,
                  letterSpacing: 0.6, color: AppColors.textMuted,
                )),
          ),
          ...hijos,
          const SizedBox(height: 6),
        ],
      ),
    );
  }

  Widget _item(IconData icon, String label, String value, {bool valorVacio = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.border, width: 0.6)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: valorVacio ? AppColors.textMuted : AppColors.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(fontSize: 12, color: AppColors.textMuted, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(value,
                    style: TextStyle(
                      fontSize: 14,
                      color: valorVacio ? AppColors.textMuted : AppColors.textPrimary,
                      fontStyle: valorVacio ? FontStyle.italic : FontStyle.normal,
                    )),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
