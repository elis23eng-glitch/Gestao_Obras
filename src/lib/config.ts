export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

export function configurationError(): string | null {
  try {
    const url = new URL(supabaseUrl);
    if (!['https:', 'http:'].includes(url.protocol)) return 'Endereço do Supabase inválido.';
  } catch {
    return 'Configure o endereço do Supabase para iniciar a aplicação.';
  }
  if (!supabaseAnonKey || supabaseAnonKey === 'sua-anon-key') {
    return 'Configure a chave pública do Supabase para iniciar a aplicação.';
  }
  return null;
}
