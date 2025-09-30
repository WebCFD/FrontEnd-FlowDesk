#!/usr/bin/env python3
"""
Script que se ejecuta en Inductiva para calcular (a + b)²
Este script será ejecutado en la infraestructura de Inductiva
"""
import sys
import json

def main():
    if len(sys.argv) != 3:
        print("Error: Se requieren exactamente 2 argumentos (numberA y numberB)")
        sys.exit(1)
    
    try:
        number_a = float(sys.argv[1])
        number_b = float(sys.argv[2])
    except ValueError:
        print("Error: Los argumentos deben ser números válidos")
        sys.exit(1)
    
    # Calcular resultado
    result = (number_a + number_b) ** 2
    
    # Crear resultado en formato JSON
    output = {
        "calculatedValue": result,
        "formula": f"({number_a} + {number_b})²",
        "numberA": number_a,
        "numberB": number_b,
        "processedWith": "inductiva_cloud"
    }
    
    # Escribir resultado a archivo
    with open("result.json", "w") as f:
        json.dump(output, f, indent=2)
    
    # También imprimir a stdout para logs
    print(f"Calculation completed: ({number_a} + {number_b})² = {result}")
    print(f"Result written to result.json")

if __name__ == "__main__":
    main()
