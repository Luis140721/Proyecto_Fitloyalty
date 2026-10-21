// lib/cliente/screens/home_screen.dart
//
// Shell con BottomNavigationBar: 4 pestañas (Inicio, QR, Plan, Mas).
// Mismo patron que el home con drawer de Store_Pro_Ss, pero mas adecuado
// para el alcance reducido de esta app cliente.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import 'dashboard_tab.dart';
import 'qr_tab.dart';
import 'plan_tab.dart';
import 'more_tab.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _idx = 0;

  static const _pages = <Widget>[
    DashboardTab(),
    QrTab(),
    PlanTab(),
    MoreTab(),
  ];

  @override
  void initState() {
    super.initState();
    // Refresca el perfil al volver a Home (por si se edito).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<AuthProvider>().refresh();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _idx, children: _pages),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _idx,
        onTap: (i) => setState(() => _idx = i),
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            activeIcon: Icon(Icons.home),
            label: 'Inicio',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.qr_code_2_outlined),
            activeIcon: Icon(Icons.qr_code_2),
            label: 'Mi QR',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.card_membership_outlined),
            activeIcon: Icon(Icons.card_membership),
            label: 'Mi plan',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.menu_outlined),
            activeIcon: Icon(Icons.menu),
            label: 'Mas',
          ),
        ],
      ),
    );
  }
}
