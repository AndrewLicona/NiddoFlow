import { createClient } from '@/utils/supabase/server';

export async function getAuthHeader() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
    };
}
