"""Pruebas del contrato de OCR (`OCRExtractionResult`).

No llaman a Gemini ni a la base de datos: solo se ejercitan funciones puras
del servicio (`_build_result_from_gemini_data`, `_pdf_page_images`,
`_parse_installments`, `_normalize_merchant`) y el paralelismo del bulk.
"""

import asyncio
import inspect
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(BACKEND_DIR, ".env"))
except Exception:  # pragma: no cover - dotenv es opcional en tests
    pass

import fitz  # noqa: E402
from fastapi import params  # noqa: E402

from app.services.ocr_service import (  # noqa: E402
    MAX_PDF_PAGES,
    OCRConfidence,
    OCRInstallments,
    OCRItemResult,
    OCRExtractionResult,
    _build_result_from_gemini_data,
    _normalize_merchant,
    _parse_installments,
    _pdf_page_images,
    _prepare_image,
)


CATEGORIES = [
    {"id": "11111111-1111-1111-1111-111111111111", "name": "Alimentación", "type": "expense"},
    {"id": "22222222-2222-2222-2222-222222222222", "name": "Servicios", "type": "expense"},
    {"id": "33333333-3333-3333-3333-333333333333", "name": "Transporte", "type": "expense"},
]


def _make_pdf(pages: int) -> bytes:
    """Genera un PDF de `pages` páginas con PyMuPDF."""
    doc = fitz.open()
    for index in range(pages):
        page = doc.new_page()
        page.insert_text((72, 120), f"Pagina {index + 1} - TOTAL 100000")
    data = doc.tobytes()
    doc.close()
    return data


class TestCamposDelContrato:
    def test_todos_los_campos_nuevos_existen(self):
        result = OCRExtractionResult()
        for field in (
            "amount", "date", "description", "category", "nature", "merchant",
            "merchant_raw", "confidence", "installments", "items", "category_raw",
            "subtotal", "tax", "discount", "tip", "duplicate", "duplicate_of",
            "image_hash",
        ):
            assert field in OCRExtractionResult.model_fields, f"falta el campo {field}"

        # Los campos nuevos son opcionales: no rompen a los clientes actuales
        assert result.amount is None
        assert result.nature == "Gasto"
        assert result.items == []
        assert result.merchant is None
        assert result.merchant_raw is None
        assert result.confidence is None
        assert result.installments is None
        assert result.category_raw is None
        assert result.subtotal is None
        assert result.tax is None
        assert result.discount is None
        assert result.tip is None
        assert result.duplicate is False
        assert result.duplicate_of is None
        assert result.image_hash is None

    def test_campos_del_item(self):
        item = OCRItemResult(item_name="Leche 1L")
        assert item.category is None
        assert item.category_id is None
        assert item.confidence is None
        assert item.category_raw is None
        assert item.quantity == 1.0

    def test_cliente_antiguo_sigue_funcionando(self):
        # Respuesta con la forma mínima que enviaba el backend antes
        result = OCRExtractionResult(
            amount=190400.0,
            date="2026-10-28T12:00",
            description="Alquería La Esmeralda",
            category="Alimentación",
            nature="Gasto",
            items=[OCRItemResult(item_name="Leche", quantity=2, unit_price=4200, total_price=8400)],
        )
        assert result.amount == 190400.0
        assert result.items[0].item_name == "Leche"


class TestConfianza:
    def test_confianza_en_rango(self):
        confidence = OCRConfidence(amount=0.95, date=0.88, merchant=0.91, total=0.95)
        for value in (confidence.amount, confidence.date, confidence.merchant, confidence.total):
            assert 0.0 <= value <= 1.0

    def test_confianza_se_acota(self):
        confidence = OCRConfidence(amount=1.7, date=-0.4, merchant=None, total=95)
        assert confidence.amount == 1.0
        assert confidence.date == 0.0
        assert confidence.merchant == 0.0
        # Un porcentaje (95) también se acota al máximo permitido
        assert confidence.total == 1.0

    def test_confianza_de_item_se_acota(self):
        item = OCRItemResult(item_name="Leche", confidence=2.5)
        assert item.confidence == 1.0


class TestValidacionDeCategorias:
    def test_categoria_valida_se_normaliza_y_resuelve_id(self):
        data = {"amount": 190400.0, "category": "alimentacion"}
        result = asyncio.run(_build_result_from_gemini_data(data, CATEGORIES))
        assert result.category == "Alimentación"
        assert result.category_raw is None

    def test_categoria_inventada_queda_null_y_se_conserva_el_texto_crudo(self):
        data = {"amount": 190400.0, "category": "Categoría Inventada"}
        result = asyncio.run(_build_result_from_gemini_data(data, CATEGORIES))
        assert result.category is None
        assert result.category_raw == "Categoría Inventada"

    def test_item_con_categoria_inventada(self):
        data = {
            "amount": 100.0,
            "items": [
                {
                    "item_name": "Zapatos",
                    "quantity": 1,
                    "unit_price": 100,
                    "total_price": 100,
                    "category": "Calzado",
                }
            ],
        }
        result = asyncio.run(_build_result_from_gemini_data(data, CATEGORIES))
        assert len(result.items) == 1
        assert result.items[0].category is None
        assert result.items[0].category_id is None
        assert result.items[0].category_raw == "Calzado"

    def test_sin_categorias_no_se_inventa_ninguna(self):
        data = {"amount": 100.0, "category": "Alimentación"}
        result = asyncio.run(_build_result_from_gemini_data(data, []))
        assert result.category is None
        assert result.category_raw == "Alimentación"


class TestPdfMultipagina:
    def test_renderiza_todas_las_paginas(self):
        pdf_bytes = _make_pdf(3)
        images = _pdf_page_images(pdf_bytes)
        assert len(images) == 3

    def test_limita_el_numero_de_paginas(self):
        pdf_bytes = _make_pdf(MAX_PDF_PAGES + 2)
        images = _pdf_page_images(pdf_bytes)
        assert len(images) == MAX_PDF_PAGES

    def test_prepare_image_concatena_las_paginas(self):
        pdf_bytes = _make_pdf(3)
        pages = _pdf_page_images(pdf_bytes)
        data, mime = _prepare_image(pdf_bytes, "application/pdf")
        assert mime == "image/jpeg"
        assert data[:2] == b"\xff\xd8"  # cabecera JPEG

        from PIL import Image
        import io as _io

        combined = Image.open(_io.BytesIO(data))
        expected_height = sum(page.size[1] for page in pages)
        assert abs(combined.size[1] - expected_height) <= 2
        assert combined.size[1] > pages[0].size[1]  # grew vertically


class TestCuotas:
    def test_cuota_2_de_3(self):
        installments = _parse_installments("PAGO CON TARJETA CUOTA 2 DE 3 TOTAL DE LA COMPRA 540000")
        assert installments is not None
        assert installments.current == 2
        assert installments.total == 3
        assert installments.purchase_total_amount == 540000.0

    def test_numero_de_cuotas(self):
        installments = _parse_installments("COMPRA EN 3 CUOTAS MENSUALES")
        assert installments is not None
        assert installments.total == 3

    def test_sin_cuotas(self):
        assert _parse_installments("COMPRA DE PAN") is None


class TestComercioNormalizado:
    def test_quita_sufijos_corporativos(self):
        assert _normalize_merchant("ALQUERIA LA ESMERALDA S.A.S.") == "Alqueria La Esmeralda"
        assert _normalize_merchant("CLARO S.A.") == "Claro"
        assert _normalize_merchant("TIENDA LTDA") == "Tienda"
        assert _normalize_merchant("SERVICIOS E.U.") == "Servicios"

    def test_colapsa_espacios_y_vacio(self):
        assert _normalize_merchant("  EPM   Colombia  ") == "Epm Colombia"
        assert _normalize_merchant(None) is None
        assert _normalize_merchant("   ") is None


class TestBulkParalelo:
    def test_procesa_en_paralelo_y_conserva_el_orden(self):
        try:
            from app.routers import ocr as ocr_router
        except Exception:  # pragma: no cover - depende de la config de Supabase
            import pytest
            pytest.skip("El router no se puede importar en este entorno")

        state = {"active": 0, "max": 0}

        async def fake_extract(file_bytes, mime_type, categories=None, family_id=None):
            state["active"] += 1
            state["max"] = max(state["max"], state["active"])
            await asyncio.sleep(0.05)
            state["active"] -= 1
            return OCRExtractionResult(amount=float(file_bytes))

        original = ocr_router.extract_receipt_data
        ocr_router.extract_receipt_data = fake_extract
        try:
            tasks = [(str(i).encode(), "image/jpeg", f"f{i}", False) for i in range(6)]
            results = asyncio.run(ocr_router._run_extractions(tasks, CATEGORIES, None))
        finally:
            ocr_router.extract_receipt_data = original

        assert len(results) == 6
        assert [r.amount for r in results] == [float(i) for i in range(6)]
        assert state["max"] > 1, "no hubo paralelismo"
        assert state["max"] <= 3, "se excedió el límite de concurrencia"

    def test_un_archivo_fallido_no_tumba_el_lote(self):
        try:
            from app.routers import ocr as ocr_router
        except Exception:  # pragma: no cover - depende de la config de Supabase
            import pytest
            pytest.skip("El router no se puede importar en este entorno")

        async def fake_extract(file_bytes, mime_type, categories=None, family_id=None):
            if file_bytes == b"bad":
                raise RuntimeError("fallo simulado")
            return OCRExtractionResult(amount=1.0)

        original = ocr_router.extract_receipt_data
        ocr_router.extract_receipt_data = fake_extract
        try:
            tasks = [
                (b"ok", "image/jpeg", "ok", False),
                (b"bad", "image/jpeg", "bad", False),
                (b"ok2", "image/jpeg", "ok2", False),
            ]
            results = asyncio.run(ocr_router._run_extractions(tasks, CATEGORIES, None))
        finally:
            ocr_router.extract_receipt_data = original

        assert len(results) == 2


class TestAutenticacion:
    def test_endpoints_exigen_usuario(self):
        try:
            from app.dependencies import get_current_user
            from app.routers import ocr as ocr_router
        except Exception:  # pragma: no cover - depende de la config de Supabase
            import pytest
            pytest.skip("El router no se puede importar en este entorno")

        for endpoint in (ocr_router.extract_receipt, ocr_router.extract_bulk):
            signature = inspect.signature(endpoint)
            dependencies = [
                param.default for param in signature.parameters.values()
                if isinstance(param.default, params.Depends)
            ]
            assert any(
                getattr(dependency, "dependency", None) is get_current_user
                for dependency in dependencies
            ), f"{endpoint.__name__} no requiere autenticación"
