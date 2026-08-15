# Configuração manual do Firebase

## Bloqueio atual

As capturas mostram o projeto no plano Spark e o Realtime Database com regras temporárias abertas por data. Não publique dados reais nesse estado. Cloud Functions e o fluxo seguro de links exigem upgrade para Blaze.

## Sequência exata

1. Firebase Console -> Configurações do projeto -> Geral -> Seus apps -> ícone Web -> registrar `Oficlaro Web` e marcar Hosting.
2. Authentication -> Sign-in method -> E-mail/senha -> Ativar -> Salvar.
3. Plano e faturamento -> Fazer upgrade -> Blaze. Crie também um orçamento/alerta de cobrança no Google Cloud.
4. Storage -> Começar -> modo de produção -> região compatível.
5. App Check -> Apps -> `Oficlaro Web` -> reCAPTCHA Enterprise -> registrar domínio.
6. Copie somente a site key pública para `public/js/config/runtime-config.js` em `appCheckSiteKey`.
7. Durante o primeiro teste, App Check -> métricas -> monitorar. Como as Functions já exigem token, configure a chave antes de testá-las.
8. Realtime Database -> Regras: não edite manualmente. Publique `database.rules.json` pelo CLI.
9. Storage -> Regras: publique `storage.rules` pelo CLI.
10. Hosting -> Domínios autorizados no Authentication: confirme `oficlaro-a632c.web.app`, `oficlaro-a632c.firebaseapp.com` e o domínio próprio futuro.

## Deploy

```bash
npm install
cd functions && npm install && cd ..
firebase login
firebase use oficlaro-a632c
npm test
npm run test:rules
firebase deploy --only database,storage
firebase deploy --only functions,hosting
```

O Hosting disponibiliza automaticamente `/__/firebase/init.json`; por isso o SDK público não precisa ser copiado para o repositório. Para desenvolvimento local, copie `firebase-config.local.example.js` para `firebase-config.local.js` e preencha a configuração pública do app Web.
