// lib/cliente/config/environment.dart
//
// Lee API_URL desde assets/.env. Si no existe o no se cargo dotenv, devuelve
// un fallback seguro. Mismo patron que usa la profe en Store_Pro_Ss.
//
// IMPORTANTE: en main.dart hay que llamar ANTES de runApp:
//   await dotenv.load(fileName: 'assets/.env');

import 'package:flutter_dotenv/flutter_dotenv.dart';

class Environment {
  static String get apiUrl {
    return dotenv.env['API_URL'] ?? 'http://localhost:3001/api';
  }

  static String get appName {
    return dotenv.env['APP_NAME'] ?? 'FitLoyalty';
  }
}
