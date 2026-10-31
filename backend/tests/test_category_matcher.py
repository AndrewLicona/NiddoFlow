"""Pruebas del `CategoryMatcher` (contrato CONTRATOS_IMPLEMENTACION.md 3.4).

Son pruebas puras: no tocan la base de datos. Se instancia el servicio con
un repositorio nulo porque `match_category` no usa el repositorio.
"""

import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(BACKEND_DIR, ".env"))
except Exception:  # pragma: no cover - dotenv es opcional en tests
    pass

from app.services.categories_service import (  # noqa: E402
    CategoriesService,
    fold,
    normalize_phrase,
    singularize,
    strip_accents,
    tokens_match,
)

ALIMENTACION_ID = "11111111-1111-1111-1111-111111111111"
TRANSPORTE_ID = "22222222-2222-2222-2222-222222222222"
VIVIENDA_ID = "33333333-3333-3333-3333-333333333333"
SALUD_ID = "44444444-4444-4444-4444-444444444444"
FAMILIAR_ID = "55555555-5555-5555-5555-555555555555"

CATEGORIES = [
    {"id": ALIMENTACION_ID, "name": "Alimentación", "type": "expense", "family_id": None},
    {"id": TRANSPORTE_ID, "name": "Transporte", "type": "expense", "family_id": None},
    {"id": VIVIENDA_ID, "name": "Vivienda", "type": "expense", "family_id": None},
    {"id": SALUD_ID, "name": "Salud", "type": "expense", "family_id": None},
    {"id": FAMILIAR_ID, "name": "Comida", "type": "expense", "family_id": "familia-1"},
]


def _matcher():
    return CategoriesService(repository=None)


class TestNormalizacion:
    def test_quita_tildes(self):
        assert strip_accents("Préstamos Otorgados") == "Prestamos Otorgados"
        assert strip_accents("Añejo") == "Anejo"

    def test_fold_minusculas_y_espacios(self):
        assert fold("  COMIDA  ") == "comida"
        assert fold("Préstamos  Recibidos") == "prestamos recibidos"

    def test_singulariza(self):
        assert singularize("comidas") == "comida"
        assert singularize("servicios") == "servicio"
        assert singularize("intereses") == "interes"
        # Palabras cortas no se tocan.
        assert singularize("gas") == "gas"

    def test_tokens_match_es_simetric(self):
        # La comparacion de singular/plural funciona en los dos sentidos.
        assert tokens_match("comida", "comidas")
        assert tokens_match("comidas", "comida")
        assert tokens_match("alquiler", "alquileres")
        assert tokens_match("alquileres", "alquiler")
        assert tokens_match("interes", "intereses")
        assert tokens_match("carne", "carnes")
        assert not tokens_match("comida", "carne")

    def test_normalize_phrase_quita_preposiciones_iniciales(self):
        assert normalize_phrase("de la comida") == "comida"
        assert normalize_phrase("El Transporte") == "transporte"
        assert normalize_phrase("Comida") == "comida"


class TestMatchExacto:
    def test_match_exacto_case_insensitive(self):
        cat_id, name = _matcher().match_category("alimentación", CATEGORIES)
        assert cat_id == ALIMENTACION_ID
        assert name == "Alimentación"

    def test_match_exacto_devuelve_el_id_correcto(self):
        cat_id, _ = _matcher().match_category("Transporte", CATEGORIES)
        assert cat_id == TRANSPORTE_ID

    def test_no_hay_match_no_inventa_categoria(self):
        cat_id, name = _matcher().match_category("Criptomoneda", CATEGORIES)
        assert cat_id is None
        assert name is None


class TestMatchConTilde:
    def test_texto_con_tilde_y_nombre_sin_tilde(self):
        # "Préstamos" vs "Prestamos": el paso (4) normaliza sin tildes.
        categories = [{"id": FAMILIAR_ID, "name": "Prestamos", "type": "expense"}]
        cat_id, name = _matcher().match_category("Préstamos", categories)
        assert cat_id == FAMILIAR_ID
        assert name == "Prestamos"

    def test_texto_sin_tilde_y_nombre_con_tilde(self):
        cat_id, name = _matcher().match_category("alimentacion", CATEGORIES)
        assert cat_id == ALIMENTACION_ID
        assert name == "Alimentación"


class TestMatchSingularPlural:
    def test_singular_contra_plural(self):
        cat_id, name = _matcher().match_category("comidas", CATEGORIES)
        assert cat_id == FAMILIAR_ID
        assert name == "Comida"

    def test_plural_contra_singular(self):
        categories = [{"id": VIVIENDA_ID, "name": "alquiler", "type": "expense"}]
        cat_id, name = _matcher().match_category("alquileres", categories)
        assert cat_id == VIVIENDA_ID
        assert name == "alquiler"

    def test_preposicion_inicial(self):
        cat_id, _ = _matcher().match_category("de la comida", CATEGORIES)
        assert cat_id == FAMILIAR_ID


class TestMatchAlias:
    def test_alias_resuelve_a_categoria_existente(self):
        # "taxi" es alias de Transporte.
        cat_id, name = _matcher().match_category("taxi", CATEGORIES)
        assert cat_id == TRANSPORTE_ID
        assert name == "Transporte"

    def test_alias_prefers_categoria_de_familia(self):
        # "comida" es alias de Comida/Alimentacion; la de la familia gana.
        cat_id, name = _matcher().match_category("comida", CATEGORIES)
        assert cat_id == FAMILIAR_ID
        assert name == "Comida"

    def test_alias_sin_categoria_disponible_no_inventa(self):
        categories = [{"id": VIVIENDA_ID, "name": "Vivienda", "type": "expense"}]
        cat_id, name = _matcher().match_category("taxi", categories)
        assert cat_id is None
        assert name is None


class TestMatchKeywords:
    def test_keyword_resuelve(self):
        # "panaderia" es keyword de Comida.
        cat_id, name = _matcher().match_category("Panadería Donde Pedro", CATEGORIES)
        assert cat_id == FAMILIAR_ID
        assert name == "Comida"

    def test_keyword_parcial_no_dispara(self):
        # "bar" es keyword de Comida pero "barco" no debe disparar.
        cat_id, _ = _matcher().match_category("nautica barco", CATEGORIES)
        assert cat_id is None


class TestMatchSinMatch:
    def test_texto_desconocido(self):
        cat_id, name = _matcher().match_category("Zapatos de cuero", CATEGORIES)
        assert cat_id is None
        assert name is None

    def test_texto_vacio(self):
        assert _matcher().match_category("", CATEGORIES) == (None, None)
        assert _matcher().match_category(None, CATEGORIES) == (None, None)
        assert _matcher().match_category("comida", []) == (None, None)


class TestNoInventaCategorias:
    def test_solo_puede_devolver_categorias_de_la_lista(self):
        matcher = _matcher()
        textos = [
            "Comida", "comidas", "taxi", "Panadería", "alquiler",
            "salud", "Transporte", "de la comida", "cafetería",
        ]
        validos = {c["id"] for c in CATEGORIES}
        for texto in textos:
            cat_id, name = matcher.match_category(texto, CATEGORIES)
            if cat_id is not None:
                assert cat_id in validos, f"{texto} produjo una categoria inventada: {cat_id}"
                assert name is not None
