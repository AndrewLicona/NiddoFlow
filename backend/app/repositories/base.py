from app.db.supabase import supabase
from app.db.prisma_db import prisma

class BaseRepository:
    def __init__(self):
        self.db = supabase
        self.prisma = prisma
