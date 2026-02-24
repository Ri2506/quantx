"""
Database client and connection management
"""
from supabase import create_client, Client
from functools import lru_cache
from .config import settings


@lru_cache()
def get_supabase_client() -> Client:
    """Get Supabase client (anon key)"""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)


@lru_cache()
def get_supabase_admin() -> Client:
    """Get Supabase admin client (service role key)"""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


# Singleton instances
supabase = get_supabase_client()
supabase_admin = get_supabase_admin()
