export async function fetchWithAuth(url: string, options: RequestInit = {}) {
    // This is for client-side fetching. 
    // For Server Components, we might need a different approach or pass the header.
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // We'll rely on the caller to provide auth headers if this is a server component,
    // or we'll fetch them here if we're in the browser.
    let headers = (options.headers as Record<string, string>) || {};

    if (typeof window !== 'undefined') {
        const { createClient } = await import('@/utils/supabase/client');
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
        }
    }

    const response = await fetch(`${baseUrl}${url}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
        throw new Error(error.detail || response.statusText);
    }

    return response.json();
}
