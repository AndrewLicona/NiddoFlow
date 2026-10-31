const fs = require('fs');
const path = require('path');

const lucide = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'lucide-react'));
const raw = Object.keys(lucide).filter((k) => /^[A-Z][A-Za-z0-9]*$/.test(k));

// La libreria exporta cada icono dos veces: "House" y "HouseIcon".
// Conservamos solo el nombre canonico.
const base = new Set();
for (const n of raw) {
  if (n.endsWith('Icon') && raw.includes(n.slice(0, -4))) continue;
  base.add(n);
}
const names = [...base].sort();

// Alias historicos que ya estan en la base de datos (categorias por defecto).
const legacy = ['Flash'];

const q = (n) => `    "${n}",`;

const header = [
  '# -*- coding: utf-8 -*-',
  '"""Lista cerrada de iconos validos de ``lucide-react``.',
  '',
  'El backend es Python y no puede importar ``lucide-react`` (paquete de Node),',
  'pero el frontend solo renderiza iconos de esa libreria. Este modulo actua como',
  'lista cerrada: si el nombre no esta aqui, la categoria se guarda con',
  '``icon = None`` (no es un error). Ver CONTRATOS_IMPLEMENTACION.md 3.2.',
  '',
  'Generado desde la version instalada en ``frontend/`` (lucide-react v0.562).',
  'Tambien se aceptan los nombres con sufijo ``Icon`` (alias oficial de la',
  'libreria, p. ej. ``HouseIcon``) y algunos alias historicos que ya estan',
  'sembrados en la base de datos.',
  '"""',
  '',
  'from typing import Optional, Set',
  '',
  'LUCIDE_ICONS: Set[str] = {',
  ...names.map(q),
  '}',
  '',
  '# Alias con sufijo "Icon" que la libreria exporta oficialmente.',
  'LUCIDE_ICON_ALIASES: Set[str] = {name + "Icon" for name in LUCIDE_ICONS}',
  '',
  '# Nombres antiguos que ya existen en la base de datos (categorias por defecto).',
  'LEGACY_ICONS: Set[str] = {',
  ...legacy.map(q),
  '}',
  '',
  '',
  'def is_valid_icon(name: Optional[str]) -> bool:',
  '    """True si ``name`` corresponde a un icono existente de lucide-react."""',
  '    if not name:',
  '        return False',
  '    candidate = name.strip()',
  '    return (',
  '        candidate in LUCIDE_ICONS',
  '        or candidate in LUCIDE_ICON_ALIASES',
  '        or candidate in LEGACY_ICONS',
  '    )',
  '',
  '',
  'def normalize_icon(name: Optional[str]) -> Optional[str]:',
  '    """Devuelve el nombre del icono si es valido; ``None`` si no existe.',
  '',
  '    Nunca lanza error: un icono desconocido se trata como "sin icono".',
  '    """',
  '    if not name:',
  '        return None',
  '    candidate = name.strip()',
  '    if is_valid_icon(candidate):',
  '        return candidate',
  '    return None',
  '',
].join('\n');

const out = path.join(__dirname, '..', 'backend', 'app', 'services', 'category_icons.py');
fs.writeFileSync(out, header);
console.log('wrote', out, names.length, 'icons');
