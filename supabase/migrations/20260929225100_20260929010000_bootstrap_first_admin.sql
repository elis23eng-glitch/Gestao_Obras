-- ============================================================
-- BOOTSTRAP DO PRIMEIRO ADMINISTRADOR
-- Permite que o primeiro usuário autenticado se auto-vincule
-- como admin APENAS se não existir nenhum admin ainda.
-- Após o primeiro admin, a função não permite autoelevação.
-- ============================================================
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_count int;
  v_auth_uid uuid;
  v_existing uuid;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  -- Conta admins existentes (vinculados ou não)
  SELECT count(*) INTO v_admin_count FROM usuarios WHERE cargo = 'admin';
  IF v_admin_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Já existe um administrador. Solicite ao admin atual que cadastre seu perfil.');
  END IF;

  -- Verifica se já existe um usuario com este auth_user_id
  SELECT id INTO v_existing FROM usuarios WHERE auth_user_id = v_auth_uid;
  IF v_existing IS NOT NULL THEN
    -- Promove a admin
    UPDATE usuarios SET cargo = 'admin' WHERE id = v_existing;
    RETURN jsonb_build_object('success', true, 'action', 'promoted', 'usuario_id', v_existing);
  END IF;

  -- Busca por email (vindo do auth.users)
  SELECT u.id INTO v_existing
  FROM usuarios u
  JOIN auth.users au ON au.email = u.email
  WHERE au.id = v_auth_uid;
  IF v_existing IS NOT NULL THEN
    UPDATE usuarios SET cargo = 'admin', auth_user_id = v_auth_uid WHERE id = v_existing;
    RETURN jsonb_build_object('success', true, 'action', 'linked_and_promoted', 'usuario_id', v_existing);
  END IF;

  -- Cria novo usuario admin vinculado
  INSERT INTO usuarios (nome, email, cargo, auth_user_id)
  SELECT
    COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
    email,
    'admin',
    v_auth_uid
  FROM auth.users WHERE id = v_auth_uid
  RETURNING id INTO v_existing;

  RETURN jsonb_build_object('success', true, 'action', 'created', 'usuario_id', v_existing);
END;
$$;

-- Permite que qualquer autenticado chame (a função valida internamente)
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin() TO authenticated;
