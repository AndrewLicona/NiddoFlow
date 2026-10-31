# -*- coding: utf-8 -*-
"""Mapa de keywords y alias para clasificar texto libre en categorias.

Este modulo es una COPIA del mapa de keywords que vive hoy en
``backend/app/services/ocr_service.py`` (agente C) mas un mapa de alias por
categoria. El objetivo es que el ``CategoryMatcher`` (contrato
CONTRATOS_IMPLEMENTACION.md 3.4) tenga su propia fuente de verdad sin depender
de que el agente C modifique el suyo.

Reglas:
- El mapa de keywords se conserva tal cual para no cambiar el comportamiento
  actual del OCR: cada clave es el NOMBRE EXACTO de una categoria y la lista
  son las palabras que la activan.
- El matcher NUNCA inventa categorias: una keyword solo puede resolver a una
  categoria que este presente en la lista que se le entrega.
- Los alias son nombres alternativos ("como lo llamaria el usuario") que
  apuntan al nombre canonico de una categoria.
"""

from typing import Dict, List

# ---------------------------------------------------------------------------
# Mapa de keywords heredado de ocr_service.py (agente C).
# NO editarlo aqui para "mejorarlo": el OCR actual depende de este mapa.
# ---------------------------------------------------------------------------
CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "Comida": [
        "restaurante", "cafe", "burger", "pizza", "food", "bar", "grill",
        "sushi", "steak", "cena", "almuerzo", "desayuno", "mcdonald",
        "burger king", "starbucks", "rest", "deli", "bakery", "panaderia",
        "cafeteria",
    ],
    "Transporte": [
        "uber", "cabify", "bus", "metro", "tren", "gasoline", "gasolina",
        "combustible", "peaje", "parking", "estacionamiento", "taxi", "didi",
        "terpel", "pumac", "texaco", "shell",
    ],
    "Servicios": [
        "agua", "luz", "electricidad", "gas", "internet", "red", "plan de",
        "mantenimiento", "wifi", "celular", "movil", "mobile", "phone",
        "utility", "tigo", "claro", "movistar", "une", "epm", "enel",
        "servicios", "servcios", "capacitacion", "capacitación",
    ],
    "Vivienda": [
        "alquiler", "renta", "rent", "hipoteca", "mortgage", "apartamento",
        "unidad",
    ],
    "Entretenimiento": [
        "cine", "netflix", "spotify", "concierto", "teatro", "juego", "steam",
        "epic", "disney", "prime video", "hbo", "club", "boletas", "ticket",
    ],
    "Salud": [
        "farmacia", "hospital", "medico", "doctor", "salud", "medicina",
        "dental", "odontologo", "optica", "lentes", "drogueria",
    ],
    "Salario": [
        "nomina", "sueldo", "paycheck", "salario", "pago nomina",
    ],
    "Ventas": [
        "venta", "sale", "vendido", "factura de venta",
    ],
    "Préstamos Recibidos": [
        "prestamo", "received", "recibido",
    ],
    "Deudas": [
        "pago deuda", "cuota", "intereses",
    ],
}

# ---------------------------------------------------------------------------
# Alias: nombres alternativos que el usuario puede escribir y que deben
# resolver a la categoria canonica. La clave es el alias ya normalizado
# (minusculas, sin tildes, sin espacios extra).
#
# Un alias solo sirve si la categoria destino existe en la lista entregada al
# matcher; si no existe, se ignora (no se inventa).
# ---------------------------------------------------------------------------
CATEGORY_ALIASES: Dict[str, List[str]] = {
    # Comida / Alimentacion
    "comida": ["Comida", "Alimentación"],
    "alimento": ["Comida", "Alimentación"],
    "alimentos": ["Comida", "Alimentación"],
    "alimentacion": ["Comida", "Alimentación"],
    "comidas": ["Comida", "Alimentación"],
    "restaurante": ["Comida", "Alimentación"],
    "restaurantes": ["Comida", "Alimentación"],
    "super": ["Comida", "Alimentación"],
    "supermercado": ["Comida", "Alimentación"],
    "mercado": ["Comida", "Alimentación"],
    "tienda": ["Comida", "Alimentación"],
    "tiendas": ["Comida", "Alimentación"],
    "fastfood": ["Comida", "Alimentación"],
    "pizza": ["Comida", "Alimentación"],
    "hamburgues": ["Comida", "Alimentación"],
    "cafeteria": ["Comida", "Alimentación"],
    "panaderia": ["Comida", "Alimentación"],
    # Transporte
    "transporte": ["Transporte"],
    "taxi": ["Transporte"],
    "uber": ["Transporte"],
    "didi": ["Transporte"],
    "cabify": ["Transporte"],
    "bus": ["Transporte"],
    "metro": ["Transporte"],
    "parqueo": ["Transporte"],
    "parking": ["Transporte"],
    "gasolina": ["Transporte"],
    "combustible": ["Transporte"],
    "peaje": ["Transporte"],
    "viajes": ["Transporte"],
    # Servicios
    "servicios": ["Servicios"],
    "servicio": ["Servicios"],
    "servicios publicos": ["Servicios"],
    "luz": ["Servicios"],
    "agua": ["Servicios"],
    "electricidad": ["Servicios"],
    "internet": ["Servicios"],
    "wifi": ["Servicios"],
    "celular": ["Servicios"],
    "telefono": ["Servicios"],
    "gas": ["Servicios"],
    # Vivienda
    "vivienda": ["Vivienda"],
    "casa": ["Vivienda"],
    "hogar": ["Vivienda"],
    "apartamento": ["Vivienda"],
    "alquiler": ["Vivienda"],
    "arriendo": ["Vivienda"],
    "renta": ["Vivienda"],
    "hipoteca": ["Vivienda"],
    # Entretenimiento
    "entretenimiento": ["Entretenimiento"],
    "ocio": ["Entretenimiento"],
    "diversion": ["Entretenimiento"],
    "cine": ["Entretenimiento"],
    "netflix": ["Entretenimiento"],
    "spotify": ["Entretenimiento"],
    "videojuegos": ["Entretenimiento"],
    "juegos": ["Entretenimiento"],
    "conciertos": ["Entretenimiento"],
    # Salud
    "salud": ["Salud"],
    "medico": ["Salud"],
    "medicina": ["Salud"],
    "farmacia": ["Salud"],
    "hospital": ["Salud"],
    "doctor": ["Salud"],
    "dental": ["Salud"],
    "odontologia": ["Salud"],
    "optica": ["Salud"],
    "drogueria": ["Salud"],
    # Ingresos
    "salario": ["Salario"],
    "nomina": ["Salario"],
    "sueldo": ["Salario"],
    "pago de nomina": ["Salario"],
    "ventas": ["Ventas"],
    "venta": ["Ventas"],
    "ingresos": ["Salario", "Ventas"],
    # Deudas y prestamos
    "deudas": ["Deudas"],
    "deuda": ["Deudas"],
    "cuotas": ["Deudas"],
    "prestamos": ["Préstamos Otorgados", "Préstamos Recibidos"],
    "prestamo": ["Préstamos Otorgados", "Préstamos Recibidos"],
    "credito": ["Préstamos Otorgados", "Préstamos Recibidos"],
    # Otros
    "otros": ["Otros"],
    "varios": ["Otros"],
    "misc": ["Otros"],
}
