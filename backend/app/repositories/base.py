from app.db.supabase import supabase

class BaseRepository:
    def __init__(self):
        self.db = supabase
