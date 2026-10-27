# Studio de Louna

Agenda de rendez-vous pour prothésiste ongulaire : PWA pour iPhone et iPad, utilisable aussi sur desktop.

**Stack** : Vite, React, TypeScript, Tailwind 4, FullCalendar, TanStack Query, Supabase, vite-plugin-pwa.

## Développement

```bash
npm install
cp .env.example .env   # puis renseigner l'URL et la clé anon Supabase
npm run dev
```

## Mise en place de Supabase (une seule fois)

1. **Créer le projet** en région `eu-west-3` (Paris).
2. **Schéma** : SQL Editor → coller et exécuter, dans l'ordre, les fichiers de [`supabase/migrations/`](supabase/migrations) (`0001_init.sql`, `0002_supplements.sql`, puis `0003_reschedule_status.sql`).
3. **Bloquer les inscriptions** : Authentication → Sign In / Providers → décocher *Allow new users to sign up*.
4. **Créer le compte unique** : Authentication → Users → *Add user* → *Create new user* avec l'adresse de la cliente. Le mot de passe est inutile, mais Supabase en exige un : en générer un long et aléatoire. Cocher *Auto Confirm User*.
5. **Recevoir un code au lieu d'un lien** : Authentication → Emails → modèle *Magic Link*, remplacer le contenu par exemple par :
   ```html
   <h2>Votre code de connexion</h2>
   <p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
   <p>Il expire dans 1 heure.</p>
   ```
6. **Envoi des mails** : le service d'envoi intégré à Supabase est limité. Brancher [Resend](https://resend.com) :
   - Resend → Domains → ajouter `studiodelouna.fr` et créer chez le registrar les enregistrements DNS indiqués (SPF/DKIM, et MX si demandé).
   - Supabase → Authentication → Emails → SMTP Settings : hôte `smtp.resend.com`, port `465`, utilisateur `resend`, mot de passe = clé API Resend, expéditeur `agenda@studiodelouna.fr`.
7. **URL du site** : Authentication → URL Configuration → *Site URL* = `https://cal.studiodelouna.fr`. Ajouter aussi l'URL `*.vercel.app` du projet dans *Redirect URLs* pour les tests.

Les statuts (Prévu, Réalisé, Annulé, Absente) et les modes de paiement (CB, Espèces, Virement) sont créés automatiquement à la première connexion, puis modifiables dans Paramètres.

## Sécurité

- Les inscriptions sont désactivées dans Supabase, et l'app appelle `signInWithOtp` avec `shouldCreateUser: false`.
- RLS sur toutes les tables : une ligne n'est visible et modifiable que par son `user_id`.
- Le rôle `anon` n'a accès qu'à la fonction `ping()`.

## Éviter la mise en pause (offre gratuite)

Le workflow [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) appelle `ping()` chaque jour. Il faut ajouter les secrets `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans GitHub → Settings → Secrets and variables → Actions. On peut le tester avec *Run workflow*.

## Déploiement Vercel

Importer le dépôt GitHub (le preset Vite est détecté), puis ajouter les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. Le fichier [`vercel.json`](vercel.json) renvoie toutes les routes vers `index.html`.

**Domaine** : l'app sera servie sur `https://cal.studiodelouna.fr`.
1. Vercel → Project → Settings → Domains → ajouter `cal.studiodelouna.fr`.
2. Chez le registrar, créer l'enregistrement DNS indiqué par Vercel, en général `CNAME cal → cname.vercel-dns.com`.
3. Le certificat HTTPS est généré automatiquement par Vercel.

Une fois le domaine en place, l'app installée sur l'écran d'accueil doit l'être depuis `cal.studiodelouna.fr` et pas depuis l'URL `vercel.app`. Chaque domaine a son propre stockage, donc il faut se reconnecter.

## Installer sur iPhone / iPad

Ouvrir l'URL dans **Safari** → bouton Partager → *Sur l'écran d'accueil*.

## Icônes

`node scripts/gen-icons.mjs` régénère les PNG dans `public/`.
