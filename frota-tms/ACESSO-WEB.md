# Acesso de teste — FrotaTMS

> Sistema **separado** do FilaDock. Só use links desta pasta.

## URL pública (túnel — pode expirar)

Reinicie o túnel se o link abaixo não abrir. Enquanto o agente Cloud estiver ativo:

Verifique o terminal Cloudflare atual ou rode:

```bash
cd frota-tms/api && CORS_ORIGIN='*' npm run dev
# em outro terminal:
cloudflared tunnel --url http://127.0.0.1:4000
```

## Login demo (somente teste)

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Admin | admin@frotatms.com | admin123 |
| Operação | operacao@frotatms.com | operacao123 |
| Consulta | consulta@frotatms.com | consulta123 |

Em produção, troque as senhas pelo menu do usuário.

## Produção permanente

Ver [DEPLOY-PRODUCAO.md](./DEPLOY-PRODUCAO.md) (Docker/Render — sem afetar o FilaDock).
