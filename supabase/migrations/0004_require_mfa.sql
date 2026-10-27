-- Double authentification obligatoire
-- À exécuter dans Supabase > SQL Editor APRÈS avoir déployé l'app qui gère la 2FA
-- et activé la 2FA sur le compte (sinon l'app n'affiche plus aucune donnée).
--
-- Une session n'atteint le niveau aal2 qu'après le code mail ET le code de
-- l'app d'authentification (TOTP). Ces règles « restrictive » s'ajoutent à
-- owner_all : une ligne n'est accessible que si les deux sont vraies.
-- Les fonctions save_appointment et ensure_defaults sont en security invoker :
-- elles passent par ces mêmes règles.

do $$
declare t text;
begin
  foreach t in array array['services','statuses','payment_methods','days_off','clients','appointments','appointment_services']
  loop
    execute format(
      'create policy "require_mfa" on public.%I as restrictive for all to authenticated
         using ((select auth.jwt()->>''aal'') = ''aal2'')
         with check ((select auth.jwt()->>''aal'') = ''aal2'')', t);
  end loop;
end $$;

-- Retour arrière (perte de l'app d'authentification, etc.) :
--   do $$ declare t text; begin
--     foreach t in array array['services','statuses','payment_methods','days_off','clients','appointments','appointment_services']
--     loop execute format('drop policy "require_mfa" on public.%I', t); end loop;
--   end $$;
-- Ou plus simplement : Authentication > Users > le compte > supprimer le facteur MFA,
-- puis se reconnecter et en enregistrer un nouveau.
