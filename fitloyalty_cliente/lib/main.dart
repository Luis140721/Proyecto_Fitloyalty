// lib/main.dart
//
// Punto de entrada de FitLoyalty Cliente.
//
// Patron:
//
//   1) Cargar dotenv ANTES de cualquier servicio (para tener API_URL)
//   2) Cargar locale data para intl (es_CO) — si no, DateFormat('es_CO') crashea
//      con LocaleDataException.
//   3) Montar MultiProvider con AuthProvider (chequea token al construirse)
//   4) MaterialApp con SplashGate como home: si hay sesion va a HomeScreen,
//      si no, a LoginScreen.
//
// Es el mismo patron que la profe usa en Store_Pro_Ss, solo que el modulo es
// 'cliente/' en vez de 'storepro/'.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'cliente/config/environment.dart';
import 'cliente/providers/auth_provider.dart';
import 'cliente/providers/perfil_provider.dart';
import 'cliente/screens/home_screen.dart';
import 'cliente/screens/login_screen.dart';
import 'cliente/screens/splash_screen.dart';
import 'cliente/theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Forzamos barra de estado clara porque el tema es dark.
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));
  await dotenv.load(fileName: 'assets/.env');

  // Cargar las tablas de localizacion para que DateFormat('EEEE d MMM', 'es_CO')
  // no lance LocaleDataException. Tambien forzamos es_CO como locale global
  // para que los widgets que usen locale (DatePicker, NumberFormat, etc.)
  // salgan en espanol colombiano.
  await initializeDateFormatting('es_CO', null);
  Intl.defaultLocale = 'es_CO';

  runApp(const FitLoyaltyClienteApp());
}

class FitLoyaltyClienteApp extends StatelessWidget {
  const FitLoyaltyClienteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => PerfilProvider()),
      ],
      child: MaterialApp(
        title: Environment.appName,
        debugShowCheckedModeBanner: false,
        theme: AppTheme.dark,
        themeMode: ThemeMode.dark,
        home: const _SplashGate(),
      ),
    );
  }
}

/// SplashGate: mientras AuthProvider esta en 'checking' muestra un splash,
/// y cuando resuelve redirige a Login o a Home.
///
/// Patron identico al _SplashGate de Store_Pro_Ss.
class _SplashGate extends StatelessWidget {
  const _SplashGate();

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthProvider>(
      builder: (context, auth, _) {
        switch (auth.status) {
          case AuthStatus.checking:
            return const SplashScreen();
          case AuthStatus.authenticated:
            return const HomeScreen();
          case AuthStatus.unauthenticated:
            return const LoginScreen();
        }
      },
    );
  }
}
