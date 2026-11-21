// lib/cliente/screens/home_screen.dart
//
// Shell con BottomNavigationBar: 5 pestañas (Inicio, QR, Plan, Mensajes, Mas).
// Mismo patron que el home con drawer de Store_Pro_Ss, pero mas adecuado
// para el alcance reducido de esta app cliente.
//
// La pestaña Mensajes lleva la campana con el numero de mensajes sin leer del
// gimnasio (issue #46). Se refresca al entrar a Home, al volver a la app desde
// segundo plano y al abrir la pestaña.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../providers/mensajes_provider.dart';
import 'dashboard_tab.dart';
import 'qr_tab.dart';
import 'plan_tab.dart';
import 'mensajes_screen.dart';
import 'more_tab.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  int _idx = 0;

  static const _tabMensajes = 3;

  static const _pages = <Widget>[
    DashboardTab(),
    QrTab(),
    PlanTab(),
    MensajesScreen(),
    MoreTab(),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Refresca el perfil al volver a Home (por si se edito) y trae los mensajes
    // para pintar el contador.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<AuthProvider>().refresh();
      context.read<MensajesProvider>().cargar(silencioso: true);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Al volver a la app (estaba en segundo plano) se actualiza el contador.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      context.read<MensajesProvider>().cargar(silencioso: true);
    }
  }

  void _cambiarPestana(int i) {
    setState(() => _idx = i);
    if (i == _tabMensajes) context.read<MensajesProvider>().cargar(silencioso: true);
  }

  @override
  Widget build(BuildContext context) {
    final noLeidos = context.watch<MensajesProvider>().noLeidos;
    final etiqueta = noLeidos > 99 ? '99+' : '$noLeidos';

    return Scaffold(
      body: IndexedStack(index: _idx, children: _pages),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _idx,
        onTap: _cambiarPestana,
        items: [
          const BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            activeIcon: Icon(Icons.home),
            label: 'Inicio',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.qr_code_2_outlined),
            activeIcon: Icon(Icons.qr_code_2),
            label: 'Mi QR',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.card_membership_outlined),
            activeIcon: Icon(Icons.card_membership),
            label: 'Mi plan',
          ),
          BottomNavigationBarItem(
            icon: Badge(
              isLabelVisible: noLeidos > 0,
              label: Text(etiqueta),
              child: const Icon(Icons.notifications_outlined),
            ),
            activeIcon: Badge(
              isLabelVisible: noLeidos > 0,
              label: Text(etiqueta),
              child: const Icon(Icons.notifications),
            ),
            label: 'Mensajes',
            tooltip: noLeidos > 0 ? 'Mensajes ($noLeidos sin leer)' : 'Mensajes',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.menu_outlined),
            activeIcon: Icon(Icons.menu),
            label: 'Mas',
          ),
        ],
      ),
    );
  }
}
