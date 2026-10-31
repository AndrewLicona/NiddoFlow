from datetime import datetime
from typing import List, Optional, Dict
from app.services.base import BaseService
from app.repositories.transactions_repository import TransactionsRepository
from app.services.categories_service import persist_item_categories

class TransactionsService(BaseService):
    def __init__(self, repository: TransactionsRepository):
        super().__init__(repository)

    # Campos opcionales de la transacción que se propagan desde el OCR
    # o el importador. Solo se persisten si vienen informados, de modo que
    # el comportamiento no cambia en bases de datos sin esas columnas.
    OPTIONAL_FIELDS = [
        'merchant', 'source', 'installment_current', 'installment_total',
        'purchase_total_amount', 'image_hash', 'import_hash'
    ]

    def _build_item_payload(self, item, transaction_id: str) -> dict:
        """Normaliza una línea de producto al formato de `transaction_items`.

        Incluye `category_id` y `confidence` solo si vienen presentes: así el
        guardado sigue funcionando aunque la migración correspondiente aún no
        se haya aplicado en la base de datos.
        """
        item_dict = item if isinstance(item, dict) else item.model_dump()
        payload = {
            "transaction_id": str(transaction_id),
            "item_name": item_dict.get('item_name') or item_dict.get('itemName'),
            "quantity": item_dict.get('quantity', 1.0),
            "unit_price": item_dict.get('unit_price') or item_dict.get('unitPrice', 0),
            "total_price": item_dict.get('total_price') or item_dict.get('totalPrice', 0),
            "category": item_dict.get('category'),
        }
        category_id = item_dict.get('category_id') or item_dict.get('categoryId')
        if category_id:
            payload["category_id"] = str(category_id)
        confidence = item_dict.get('confidence')
        if confidence is not None:
            payload["confidence"] = confidence
        return payload

    def _normalize_optional_fields(self, data: dict) -> dict:
        """Expande los campos opcionales que llegan desde el OCR.

        Acepta `installments` como dict anidado (`{current, total,
        purchase_total_amount}`) y lo aplana a columnas planas, que es como
        se guardan en la base de datos.
        """
        installments = data.get('installments')
        if isinstance(installments, dict):
            data['installment_current'] = installments.get('current')
            data['installment_total'] = installments.get('total')
            data['purchase_total_amount'] = installments.get('purchase_total_amount')
            data.pop('installments', None)
        return data

    async def create_transaction(self, user_id: str, tx_data: dict):
        profile_res = await self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
             raise Exception("User does not belong to a family")

        family_id = profile_res.data[0]['family_id']

        data = {**tx_data}
        items = data.pop('items', [])
        data = self._normalize_optional_fields(data)
        data['user_id'] = str(user_id)
        data['family_id'] = str(family_id)

        # Si no se indica el origen, se asume registro manual.
        data.setdefault('source', 'manual')

        # Convert all UUID fields to string for Supabase serialization
        for key in ['account_id', 'category_id', 'target_account_id']:
            if data.get(key):
                data[key] = str(data[key])

        if isinstance(data.get('date'), datetime):
            data['date'] = data['date'].isoformat()

        res = await self.repository.insert_transaction(data)
        if not res.data:
            raise Exception("Failed to create transaction")

        created_tx = res.data[0]
        tx_id = created_tx.get('id')

        # Save items if any
        saved_items = []
        if items and tx_id:
            for item in items:
                item_res = await self.repository.insert_transaction_item(
                    self._build_item_payload(item, str(tx_id))
                )
                if item_res:
                    if hasattr(item_res, 'dict'):
                        saved_items.append(item_res.dict())
                    elif isinstance(item_res, dict):
                        saved_items.append(item_res)

            # El OCR suele devolver solo el TEXTO de la categoría; este paso lo
            # convierte en el `category_id` real usando el matcher. Nunca revienta.
            await persist_item_categories(str(tx_id), items)

        if isinstance(created_tx.get('date'), datetime):
            created_tx['date'] = created_tx['date'].isoformat()

        created_tx['items'] = saved_items
        return created_tx

    async def get_transactions(self, user_id: str, scope: str = "family", start_date: str = None, end_date: str = None, limit: int = None):
        profile_res = await self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
             return []

        family_id = profile_res.data[0]['family_id']

        if scope == "personal":
            accounts = await self.repository.prisma.account.find_many(where={"user_id": user_id})
            valid_account_ids = [a.id for a in accounts]
        else:
            all_accounts_res = await self.repository.get_accounts_by_family(family_id)
            all_accounts = all_accounts_res.data or []
            valid_account_ids = [acc['id'] for acc in all_accounts if not acc.get('user_id') or str(acc.get('user_id')) == str(user_id)]

        if not valid_account_ids:
            return []

        tx_data = await self.repository.get_transactions_prisma(family_id, valid_account_ids, start_date, end_date, limit)

        if scope != "personal":
            transfers = await self.repository.get_transfers_prisma(family_id, start_date, end_date)
            combined = {str(t.id): t for t in tx_data}
            for t in transfers:
                combined[str(t.id)] = t

            transactions_data = list(combined.values())
            transactions_data.sort(key=lambda x: x.date, reverse=True)
            if limit:
                transactions_data = transactions_data[:limit]
        else:
            transactions_data = tx_data

        user_ids = list(set([str(t.user_id) for t in transactions_data if t.user_id]))
        prof_res = await self.repository.get_profiles_by_ids(user_ids) if user_ids else None
        profile_map = {str(p['id']): p['full_name'] for p in (prof_res.data if prof_res else [])}

        enriched = []
        for t in transactions_data:
            tx_dict = t.model_dump() if hasattr(t, 'model_dump') else dict(t)
            tx_dict['category_name'] = t.category.name if getattr(t, 'category', None) else None
            tx_dict['account_name'] = t.account.name if getattr(t, 'account', None) else None
            tx_dict['user_name'] = profile_map.get(str(t.user_id))
            if getattr(t, 'items', None):
                tx_dict['items'] = [item.model_dump() if hasattr(item, 'model_dump') else dict(item) for item in t.items]
            else:
                tx_dict['items'] = []

            if isinstance(tx_dict['date'], datetime):
                tx_dict['date'] = tx_dict['date'].isoformat()
            enriched.append(tx_dict)

        return enriched

    async def update_items_categories(self, user_id: str, transaction_id: str, items: list):
        """Corrige la categoría de los productos de una factura ya registrada.

        Es el paso que faltaba: el OCR propone, el usuario corrige, y la
        corrección queda guardada (además de poder aprenderse como regla).

        Devuelve la lista de productos con el resultado de cada corrección.
        """
        profile_res = await self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
            raise Exception("User does not belong to a family")
        family_id = profile_res.data[0]['family_id']

        # La transacción debe pertenecer a la familia del usuario.
        tx_res = await self.repository.get_transaction_by_id(transaction_id)
        tx = tx_res.data[0] if tx_res.data else None
        if not tx or str(tx.get('family_id')) != str(family_id):
            raise Exception("Transacción no encontrada")

        # Categorías visibles de la familia: para validar los `category_id`.
        # `get_categories` es síncrono en el repositorio.
        cats_res = self.repository.get_categories(family_id)
        valid_ids = {str(c.get('id')) for c in (cats_res.data or [])}

        # Productos actuales de la factura.
        current_items = await self.repository.get_transaction_items(transaction_id)
        by_id = {str(i.get('id')): i for i in current_items}

        results = []
        for correction in items:
            item_id = str(correction.get('item_id'))
            item = by_id.get(item_id)
            if not item:
                results.append({
                    "id": item_id,
                    "item_name": "",
                    "category_id": None,
                    "category": None,
                    "updated": False,
                })
                continue

            category_id = correction.get('category_id')
            # Una categoría que no es de la familia no se acepta.
            if category_id and str(category_id) not in valid_ids:
                category_id = None

            payload = {
                "category_id": str(category_id) if category_id else None,
                "category": correction.get('category'),
            }
            # Solo se escribe lo que cambió.
            if str(item.get('category_id') or '') != str(category_id or ''):
                try:
                    await self.repository.update_transaction_item(item_id, payload)
                    updated = True
                except Exception:
                    updated = False
            else:
                updated = False

            results.append({
                "id": item_id,
                "item_name": item.get('item_name'),
                "category_id": str(category_id) if category_id else None,
                "category": correction.get('category'),
                "updated": updated,
            })

        return results

    async def update_transaction(self, user_id: str, transaction_id: str, updates: dict):
        profile_res = await self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0]['family_id']

        old_tx_res = await self.repository.get_transaction_by_id(transaction_id)
        if not old_tx_res.data:
            raise Exception("Transaction not found")

        old_tx = old_tx_res.data[0]
        if str(old_tx['family_id']) != str(family_id):
            raise Exception("Not authorized")

        data = {**updates}
        items = data.pop('items', None)
        data = self._normalize_optional_fields(data)

        for key in ['account_id', 'category_id', 'target_account_id']:
            if data.get(key):
                data[key] = str(data[key])

        if 'date' in data and isinstance(data['date'], datetime):
            data['date'] = data['date'].isoformat()

        res = await self.repository.update_transaction(transaction_id, data, family_id)
        if not res.data:
            raise Exception("Failed to update transaction")

        updated_tx = res.data[0]

        if items is not None:
            await self.repository.delete_transaction_items(transaction_id, family_id)
            saved_items = []
            for item in items:
                item_res = await self.repository.insert_transaction_item(
                    self._build_item_payload(item, transaction_id)
                )
                if item_res:
                    if hasattr(item_res, 'dict'):
                        saved_items.append(item_res.dict())
                    elif isinstance(item_res, dict):
                        saved_items.append(item_res)

            # Igual que en la creación: el texto de la categoría se resuelve a id real.
            await persist_item_categories(str(transaction_id), items)
            updated_tx['items'] = saved_items

        if isinstance(updated_tx.get('date'), datetime):
            updated_tx['date'] = updated_tx['date'].isoformat()
        return updated_tx

    async def delete_transaction(self, user_id: str, transaction_id: str):
        profile_res = await self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0]['family_id']

        tx_res = await self.repository.get_transaction_by_id(transaction_id)
        if not tx_res.data:
            raise Exception("Transaction not found")

        transaction = tx_res.data[0]
        if str(transaction['family_id']) != str(family_id):
            raise Exception("Not authorized")

        await self.repository.delete_transaction(transaction_id, family_id)
        return True
