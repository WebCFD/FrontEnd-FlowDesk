"""
Test script to demonstrate both simulation configurations
"""
import os
from src.components.cfd.hvac import update_controldict_iterations

# Simulate both simulation types
case_path = os.path.join(os.getcwd(), "cases", "test_simple_room")

print("\n" + "="*70)
print("CONFIGURACIÓN DE SIMULACIONES CFD")
print("="*70)

# Configuration map
configs = {
    'comfortTest': {
        'iterations': 3,
        'writeInterval': 1,
        'purgeWrite': 0,
        'description': 'Test rápido - Mantiene todas las iteraciones (0, 1, 2, 3)'
    },
    'comfort30Iter': {
        'iterations': 500,
        'writeInterval': 500,
        'purgeWrite': 1,
        'description': 'Simulación completa - Mantiene solo la última iteración'
    }
}

for sim_type, config in configs.items():
    print(f"\n📋 {sim_type.upper()}:")
    print(f"   Descripción: {config['description']}")
    print(f"   • Iteraciones: {config['iterations']}")
    print(f"   • writeInterval: {config['writeInterval']}")
    print(f"   • purgeWrite: {config['purgeWrite']}")
    
    if config['purgeWrite'] == 0:
        print(f"   → Almacena: TODAS las iteraciones")
        print(f"   → Espacio en disco: ~{config['iterations']} × tamaño_timestep")
    else:
        print(f"   → Almacena: Solo última iteración escrita")
        print(f"   → Espacio en disco: ~1 × tamaño_timestep")
        print(f"   → Protección crash: Última iteración guardada siempre disponible")

print("\n" + "="*70)
print("COEFICIENTES DE RELAJACIÓN (Reducidos para estabilidad)")
print("="*70)
print("   • ρ (densidad):  0.05")
print("   • p_rgh (presión): 0.1")
print("   • U (velocidad):   0.1")
print("   • h (entalpía):    0.2")
print("\n" + "="*70 + "\n")
