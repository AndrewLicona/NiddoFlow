"""Pruebas del parser de archivos bancarios (CSV / OFX).

Son funciones puras: no requieren base de datos ni red.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.import_parsers import (  # noqa: E402
    parse_amount,
    parse_date,
    detect_columns,
    infer_type,
    normalize_merchant,
    compute_import_hash,
    parse_csv_content,
    parse_ofx_content,
)


class TestParseAmount:
    def test_formato_colombiano(self):
        assert parse_amount("1.234.567,89") == 1234567.89

    def test_formato_anglosajon(self):
        assert parse_amount("1,234,567.89") == 1234567.89

    def test_entero_simple(self):
        assert parse_amount("45000") == 45000.0

    def test_con_simbolo(self):
        assert parse_amount("$45.000") == 45000.0

    def test_parentesis_es_negativo(self):
        assert parse_amount("(45.000)") == -45000.0

    def test_europeo(self):
        assert parse_amount("1.234,56") == 1234.56

    def test_vacios(self):
        assert parse_amount("") is None
        assert parse_amount("-") is None
        assert parse_amount(None) is None

    def test_float(self):
        assert parse_amount(12.5) == 12.5


class TestParseDate:
    def test_iso(self):
        assert parse_date("2026-01-15") == "2026-01-15"

    def test_slash_dia_mes_anio(self):
        assert parse_date("15/01/2026") == "2026-01-15"

    def test_guiones(self):
        assert parse_date("15-01-2026") == "2026-01-15"

    def test_formato_ofx_compacto(self):
        assert parse_date("20260115") == "2026-01-15"

    def test_detecta_dia_mes_cuando_el_segundo_supera_12(self):
        assert parse_date("01/15/2026") == "2026-01-15"

    def test_vacios(self):
        assert parse_date("") is None
        assert parse_date(None) is None


class TestDetectColumns:
    def test_detecta_cabeceras_en_espanol(self):
        mapping = detect_columns(
            ["Fecha", "Descripcion", "Valor", "Tipo", "Categoria", "Comercio"]
        )
        assert mapping.get("date") == 0
        assert mapping.get("amount") == 2
        assert mapping.get("type") == 3
        assert mapping.get("category") == 4
        assert mapping.get("merchant") == 5

    def test_detecta_cabeceras_en_ingles(self):
        mapping = detect_columns(["Date", "Description", "Amount", "Type", "Category"])
        assert mapping.get("date") == 0
        assert mapping.get("amount") == 2

    def test_preferencia_por_alias_mas_largo(self):
        mapping = detect_columns(["Fecha", "Fecha Transaccion", "Monto"])
        assert mapping.get("date") == 1


class TestInferType:
    def test_negativo_es_gasto(self):
        assert infer_type(-45000.0, None, "COMPRA TARJ") == "expense"

    def test_nomina_es_ingreso(self):
        assert infer_type(2500000.0, None, "PAGO NOMINA") == "income"

    def test_tipo_explicito_gana(self):
        assert infer_type(50000.0, "Credito", None) == "income"
        assert infer_type(-50000.0, "Debito", None) == "expense"


class TestNormalizeMerchant:
    def test_quita_sufijos_corporativos(self):
        merchant, _ = normalize_merchant(None, "ALQUERIA LA ESMERALDA S.A.S.")
        assert merchant == "Alqueria La Esmeralda"

    def test_usa_comercio_por_sobre_descripcion(self):
        merchant, desc = normalize_merchant("COMPRA EN MOSTRADOR", "CAFE AROMATICO")
        assert merchant == "Cafe Aromatico"
        assert desc == "COMPRA EN MOSTRADOR"

    def test_vacio(self):
        assert normalize_merchant("", "") == (None, "")


class TestImportHash:
    def test_estable_entre_mayusculas(self):
        assert compute_import_hash("2026-01-15", 45000.0, "Cafe") == \
               compute_import_hash("2026-01-15", 45000.0, "cafe")

    def test_difiere_con_fecha(self):
        assert compute_import_hash("2026-01-15", 45000.0, "Cafe") != \
               compute_import_hash("2026-01-16", 45000.0, "Cafe")

    def test_difiere_con_importe(self):
        assert compute_import_hash("2026-01-15", 45000.0, "Cafe") != \
               compute_import_hash("2026-01-15", 46000.0, "Cafe")


class TestParseCsv:
    def test_lectura_con_punto_y_coma(self):
        content = (
            b"Fecha;Descripcion;Valor;Comercio\n"
            b"15/01/2026;COMPRA TARJ;45.000;CAFE AROMATICO\n"
            b"2026-01-16;PAGO NOMINA;2500000;EMPRESA XYZ\n"
        )
        rows, errors = parse_csv_content(content)
        assert len(rows) == 2
        assert errors == []
        assert parse_amount(rows[0]["amount"]) == 45000.0
        assert parse_date(rows[0]["date"]) == "2026-01-15"
        assert parse_date(rows[1]["date"]) == "2026-01-16"

    def test_ignora_filas_vacias(self):
        content = b"Fecha,Descripcion,Monto\n2026-01-01,algo,100\n,,\n"
        rows, _ = parse_csv_content(content)
        assert len(rows) == 1

    def test_sin_cabecera_reporta_error(self):
        _, errors = parse_csv_content(b"")
        assert errors


class TestParseOfx:
    def test_lectura_de_trn(self):
        ofx = (
            b"<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN>"
            b"<TRNTYPE>DEBIT<DTPOSTED>20260115120000<TRNAMT>-45000.00"
            b"<FITID>001<NAME>CAFE AROMATICO"
            b"</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"
        )
        rows, errors = parse_ofx_content(ofx)
        assert len(rows) == 1
        assert errors == []
        assert parse_amount(rows[0]["amount"]) == -45000.0
        assert parse_date(rows[0]["date"]) == "2026-01-15"

    def test_archivo_sin_transacciones(self):
        _, errors = parse_ofx_content(b"<OFX></OFX>")
        assert errors
