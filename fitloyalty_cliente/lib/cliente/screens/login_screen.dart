// lib/cliente/screens/login_screen.dart
//
// Pantalla de inicio de sesion para el miembro del gimnasio.
// Campos: codigo de gimnasio + telefono + contrasena.
// Look: dark con acentos fucsia, manteniendo la coherencia con la paleta
// oficial del frontend web (#E879F9 primario, fondo #25272D).

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'home_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey    = GlobalKey<FormState>();
  final _gymCtrl    = TextEditingController();
  final _telCtrl    = TextEditingController();
  final _passCtrl   = TextEditingController();
  bool _obscurePass = true;
  bool _isLoading   = false;
  bool _showHelp    = false;

  @override
  void dispose() {
    _gymCtrl.dispose();
    _telCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);

    final auth = context.read<AuthProvider>();
    final ok = await auth.login(
      gimnasio: _gymCtrl.text.trim(),
      telefono: _telCtrl.text.trim(),
      password: _passCtrl.text,
    );

    if (!mounted) return;
    setState(() => _isLoading = false);

    if (ok) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(auth.lastError ?? 'No pudimos iniciar sesion.'),
          backgroundColor: AppColors.surfaceHigh,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(child: InitialsAvatar(name: 'FL', size: 76, color: AppColors.primary)),
                    const SizedBox(height: 18),
                    const Center(
                      child: Text(
                        'FitLoyalty',
                        style: TextStyle(
                          fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: -1,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Center(
                      child: Text(
                        'Tu gimnasio en el celular',
                        style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
                      ),
                    ),
                    const SizedBox(height: 32),

                    TextFormField(
                      controller: _gymCtrl,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'Codigo o NIT del gimnasio',
                        hintText: 'Ej. 901234567 o "Iron House"',
                        prefixIcon: Icon(Icons.fitness_center_outlined),
                      ),
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'Ingresa el codigo o NIT de tu gimnasio' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _telCtrl,
                      keyboardType: TextInputType.phone,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
                      decoration: const InputDecoration(
                        labelText: 'Tu numero de celular',
                        hintText: '3001234567',
                        prefixIcon: Icon(Icons.phone_iphone),
                      ),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) return 'Ingresa tu numero de celular';
                        if (!RegExp(r'^3\d{9}$').hasMatch(v.trim())) return 'Debe ser 10 digitos y empezar por 3';
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _passCtrl,
                      keyboardType: TextInputType.visiblePassword,
                      obscureText: _obscurePass,
                      decoration: InputDecoration(
                        labelText: 'Contrasena',
                        hintText: 'La que te dio tu gimnasio',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          icon: Icon(_obscurePass ? Icons.visibility_off : Icons.visibility),
                          onPressed: () => setState(() => _obscurePass = !_obscurePass),
                        ),
                      ),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Ingresa tu contrasena';
                        if (v.length < 6) return 'La contrasena debe tener minimo 6 caracteres';
                        return null;
                      },
                    ),
                    const SizedBox(height: 22),

                    FilledButton(
                      onPressed: _isLoading ? null : _submit,
                      child: _isLoading
                          ? const SizedBox(
                              width: 22, height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                            )
                          : const Text('Entrar'),
                    ),

                    const SizedBox(height: 16),
                    Center(
                      child: TextButton.icon(
                        icon: Icon(_showHelp ? Icons.expand_less : Icons.help_outline, size: 18),
                        label: Text(_showHelp ? 'Ocultar ayuda' : 'Olvide mi contrasena'),
                        onPressed: () => setState(() => _showHelp = !_showHelp),
                      ),
                    ),
                    if (_showHelp) ...[
                      const SizedBox(height: 8),
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 8),
                        child: Text(
                          'Tu contrasena te la asigna el gimnasio cuando te inscribes. '
                          'Si no la recuerdas, pidele al administrador que te la reestablezca '
                          'desde el panel web (Miembros > Editar > campo Contrasena).',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.45),
                        ),
                      ),
                    ],

                    const SizedBox(height: 24),
                    const Divider(color: AppColors.border),
                    const SizedBox(height: 12),
                    const Center(
                      child: Text(
                        'Solo para miembros del gimnasio',
                        style: TextStyle(color: AppColors.textMuted, fontSize: 11, letterSpacing: 0.5),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
