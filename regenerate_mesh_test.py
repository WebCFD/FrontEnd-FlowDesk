#!/usr/bin/env python3
"""
REGENERAR MESH FORZOSAMENTE
Borra malla vieja y regenera desde cero con nuevo snappyHexMeshDict
"""

import os
import sys
import shutil
import subprocess

print("="*80)
print("FORZANDO REGENERACIÓN DE MESH")
print("="*80)
print()

case_dir = "test_mesh_gen"

# 1. Borrar malla vieja
print("🗑️  PASO 1: Borrando malla vieja...")
print("-" * 80)

paths_to_delete = [
    f"{case_dir}/constant/polyMesh",
    f"{case_dir}/constant/triSurface",
    f"{case_dir}/0",
    f"{case_dir}/1",
    f"{case_dir}/2",
    f"{case_dir}/3",
]

for path in paths_to_delete:
    if os.path.exists(path):
        print(f"  • Borrando: {path}")
        shutil.rmtree(path)
    else:
        print(f"  • Ya borrado: {path}")

# Borrar logs
for file in os.listdir(case_dir):
    if file.startswith("log."):
        log_path = os.path.join(case_dir, file)
        print(f"  • Borrando log: {log_path}")
        os.remove(log_path)

print()
print("✅ Malla vieja borrada completamente")
print()

# 2. Copiar 0.orig a 0
print("📋 PASO 2: Copiando 0.orig → 0...")
print("-" * 80)
if os.path.exists(f"{case_dir}/0.orig"):
    shutil.copytree(f"{case_dir}/0.orig", f"{case_dir}/0")
    print("✅ Initial conditions copiados")
else:
    print("⚠️  0.orig no existe, continuando...")
print()

# 3. Regenerar mesh
print("🔧 PASO 3: Regenerando mesh...")
print("-" * 80)
print()

os.chdir(case_dir)

commands = [
    ("surfaceFeatureExtract", "Extrayendo features..."),
    ("blockMesh", "Generando background mesh..."),
    ("snappyHexMesh -overwrite", "Ejecutando snappyHexMesh..."),
    ("checkMesh -allGeometry -allTopology", "Validando calidad...")
]

for cmd, desc in commands:
    print(f"▶️  {desc}")
    result = subprocess.run(
        cmd.split(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    
    # Guardar log
    log_name = f"log.{cmd.split()[0]}"
    with open(log_name, "w") as f:
        f.write(result.stdout)
    
    if result.returncode != 0:
        print(f"❌ ERROR en {cmd}")
        print(f"   Ver detalles en: {log_name}")
        sys.exit(1)
    
    print(f"✅ {cmd.split()[0]} completado")
    print()

print("="*80)
print("✅ MESH REGENERADA EXITOSAMENTE")
print("="*80)
print()
print("📊 Próximos pasos:")
print("   1. Revisar log.checkMesh para ver estadísticas de la nueva mesh")
print("   2. Comparar cell count con mesh anterior")
print("   3. Verificar que maxNonOrtho < 65°")
print()

