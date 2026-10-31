"""Servicio del importador de movimientos bancarios.

Reglas de seguridad que este servicio garantiza:

1. `preview` NUNCA escribe. Solo analiza y devuelve qué habría que crear.
2. `commit` solo crea las filas marcadas como `selected` y con estado `new`.
3. Ninguna operación borra movimientos existentes. Si un movimiento de la app no
   aparece en el archivo del banco, se reporta en `missing_in_bank` para que el
   usuario lo revise a mano.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from app.models.bank_import import (
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewResponse,
    ImportRow,
)
from app.repositories.import_repository import ImportRepository
from app.services.import_parsers import (
    compute_import_hash,
    detect_columns,
    infer_type,
    normalize_merchant,
    parse_amount,
    parse_csv_content,
    parse_date,
    parse_ofx_content,
)

logger = logging.getLogger(__name__)

# Margen de días antes de la fecha más antigua del archivo para buscar duplicados.
DUPLICATE_LOOKBACK_DAYS = 3


class ImportService:

    def __init__(self, repository: ImportRepository):
        self.repository = repository

    # ------------------------------------------------------------------
    # Preview
    # ------------------------------------------------------------------

    async def preview(
        self,
        user_id: str,
        content: bytes,
        filename: str = "",
    ) -> ImportPreviewResponse:
        profile_res = await self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0].get('family_id') if profile_res.data else None
        if not family_id:
            return ImportPreviewResponse(errors=["El usuario no pertenece a ninguna familia."])

        # Detecta el formato
        detected_format = "ofx" if _looks_like_ofx(content) else "csv"
        if detected_format == "ofx":
            raw_rows, errors = parse_ofx_content(content)
        else:
            raw_rows, errors = parse_csv_content(content)

        if errors and not raw_rows:
            return ImportPreviewResponse(
                detected_format=detected_format,
                errors=errors,
            )

        accounts = await self.repository.get_accounts_by_family(family_id)
        categories = await self.repository.get_categories_by_family(family_id)
        category_by_name = {c['name'].lower(): c for c in categories}

        rows = [self._build_row(raw, category_by_name) for raw in raw_rows]
        rows = [r for r in rows if r is not None]

        # Marca duplicados contra lo que ya está registrado
        await self._mark_duplicates(rows, family_id)

        new_count = sum(1 for r in rows if r.status == 'new')
        duplicate_count = sum(1 for r in rows if r.status == 'duplicate')
        conflict_count = sum(1 for r in rows if r.status == 'conflict')
        invalid_count = sum(1 for r in rows if r.status == 'invalid')

        return ImportPreviewResponse(
            rows=rows,
            total=len(rows),
            new_count=new_count,
            duplicate_count=duplicate_count,
            conflict_count=conflict_count,
            invalid_count=invalid_count,
            detected_format=detected_format,
            accounts=accounts,
            categories=categories,
            errors=errors,
        )

    # ------------------------------------------------------------------
    # Commit
    # ------------------------------------------------------------------

    async def commit(
        self,
        user_id: str,
        request: ImportCommitRequest,
    ) -> ImportCommitResponse:
        profile_res = await self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0].get('family_id') if profile_res.data else None
        if not family_id:
            return ImportCommitResponse(errors=["El usuario no pertenece a ninguna familia."])

        accounts = await self.repository.get_accounts_by_family(family_id)
        valid_account_ids = {a['id'] for a in accounts}

        created_ids: List[str] = []
        skipped = 0
        errors: List[str] = []

        for row in request.rows:
            if not row.selected or row.status in {'duplicate', 'invalid'}:
                skipped += 1
                continue

            account_id = row.account_id or request.default_account_id
            if not account_id:
                errors.append(f"Fila {row.row_number}: no tiene cuenta asignada.")
                skipped += 1
                continue
            if account_id not in valid_account_ids:
                errors.append(f"Fila {row.row_number}: la cuenta indicada no pertenece a tu familia.")
                skipped += 1
                continue

            if not row.date or row.amount is None:
                errors.append(f"Fila {row.row_number}: falta la fecha o el importe.")
                skipped += 1
                continue

            data = {
                "description": row.description or row.merchant or "Importado del banco",
                "amount": abs(float(row.amount)),
                "type": row.type,
                "date": row.date,
                "category_id": row.category_id or request.default_category_id,
                "account_id": str(account_id),
                "user_id": str(user_id),
                "family_id": str(family_id),
                "merchant": row.merchant,
                "import_hash": row.import_hash,
                "source": "import",
            }
            # Los campos opcionales solo se envían si tienen valor, para no
            # romper en bases de datos donde la columna aún no existe.
            data = {k: v for k, v in data.items() if v is not None}

            try:
                created = await self.repository.insert_transaction(data)
                if created:
                    created_ids.append(str(created.get('id')))
                else:
                    skipped += 1
            except Exception as exc:
                logger.error(f"Error importando la fila {row.row_number}: {exc}")
                errors.append(f"Fila {row.row_number}: {exc}")
                skipped += 1

        # Lo que está en la app pero no llegó en el archivo del banco NO se borra:
        # solo se informa para revisión manual.
        missing = await self._find_missing_in_bank(created_ids, family_id)

        return ImportCommitResponse(
            created=len(created_ids),
            skipped=skipped,
            transaction_ids=created_ids,
            errors=errors,
            missing_in_bank=missing,
        )

    # ------------------------------------------------------------------
    # Auxiliares
    # ------------------------------------------------------------------

    def _build_row(self, raw: Dict, category_by_name: Dict[str, dict]) -> Optional[ImportRow]:
        row_number = raw.get('_row_number', 0)

        date_iso = parse_date(raw.get('date'))
        amount = parse_amount(raw.get('amount'))
        description = (raw.get('description') or '').strip() or None
        merchant, description = normalize_merchant(description, raw.get('merchant'))

        row_type = infer_type(amount, raw.get('type'), description or merchant)

        category_id = None
        category_name = None
        raw_category = (raw.get('category') or '').strip()
        if raw_category:
            found = category_by_name.get(raw_category.lower())
            if found:
                category_id = found['id']
                category_name = found['name']

        warnings: List[str] = []
        if not date_iso:
            warnings.append("No se pudo interpretar la fecha.")
        if amount is None:
            warnings.append("No se pudo interpretar el importe.")
        if not description and not merchant:
            warnings.append("La fila no tiene descripción.")

        status = 'invalid' if (not date_iso or amount is None) else 'new'
        if status == 'invalid':
            warnings.append("Fila inválida: se omite.")

        return ImportRow(
            row_number=row_number,
            date=date_iso,
            description=description,
            merchant=merchant,
            amount=amount,
            type=row_type,
            category_id=category_id,
            category_name=category_name,
            import_hash=compute_import_hash(date_iso, amount, merchant),
            status=status,
            selected=(status == 'new'),
            warnings=warnings,
        )

    async def _mark_duplicates(self, rows: List[ImportRow], family_id: str):
        """Compara las filas del archivo contra los movimientos ya registrados."""
        valid_rows = [r for r in rows if r.date and r.amount is not None]
        if not valid_rows:
            return

        oldest = min(r.date for r in valid_rows)
        since = (datetime.fromisoformat(oldest) - timedelta(days=DUPLICATE_LOOKBACK_DAYS)).isoformat()

        try:
            existing = await self.repository.get_existing_movements(family_id, since)
        except Exception as exc:
            logger.warning(f"No se pudo consultar los movimientos existentes: {exc}")
            return

        by_hash: Dict[str, dict] = {}
        by_key: Dict[Tuple, dict] = {}
        for tx in existing:
            if tx.get('import_hash'):
                by_hash[tx['import_hash']] = tx
            key = (
                str(tx.get('date'))[:10],
                round(float(tx.get('amount') or 0), 2),
                (tx.get('merchant') or '').lower().strip(),
            )
            by_key.setdefault(key, tx)

        for row in valid_rows:
            if row.import_hash and row.import_hash in by_hash:
                row.status = 'duplicate'
                row.duplicate_of = str(by_hash[row.import_hash].get('id'))
                row.duplicate_reason = 'Coincide con un movimiento ya importado.'
                row.selected = False
                continue

            key = (row.date, round(float(row.amount), 2), (row.merchant or '').lower().strip())
            match = by_key.get(key)
            if match:
                row.status = 'duplicate'
                row.duplicate_of = str(match.get('id'))
                row.duplicate_reason = 'Ya existe un movimiento con la misma fecha, importe y comercio.'
                row.selected = False
                continue

            # Mismo importe y fecha, pero comercio distinto: posible conflicto.
            same_day = [
                tx for tx in existing
                if str(tx.get('date'))[:10] == row.date
                and round(float(tx.get('amount') or 0), 2) == round(float(row.amount), 2)
            ]
            if same_day:
                row.status = 'conflict'
                row.duplicate_reason = (
                    'Hay otro movimiento el mismo día con el mismo importe pero distinto comercio. '
                    'Revísalo antes de importar.'
                )
                row.selected = False

    async def _find_missing_in_bank(self, created_ids: List[str], family_id: str) -> List[dict]:
        """Movimientos registrados en la app que no vinieron en el archivo.

        NO se borran: se listan para que el usuario decida.
        """
        try:
            existing = await self.repository.get_existing_movements(family_id, None)
        except Exception:
            return []

        missing = []
        for tx in existing:
            if str(tx.get('id')) in created_ids:
                continue
            # Solo se reportan los que son suspectos: los que ya estaban
            # marcados como 'import' y no volvieron a aparecer en el archivo.
            if tx.get('source') == 'import' and tx.get('import_hash'):
                missing.append({
                    "id": str(tx.get('id')),
                    "date": str(tx.get('date'))[:10],
                    "description": tx.get('description'),
                    "amount": tx.get('amount'),
                    "note": "Estaba en la app pero no en el archivo del banco. No se ha borrado.",
                })
        return missing[:200]


def _looks_like_ofx(content: bytes) -> bool:
    head = content[:2048].upper()
    return b'<OFX' in head or b'OFXHEADER' in head
