# Auditoria do 401 no aceite de entrega

## Diagnóstico confirmado

### 1. Origem do clique e cadeia chamada

- O callback passado ao card está em `src/routes/driver.index.tsx:408-414`: `onAccept={() => handleAccept(d.id)}`.
- O card apenas executa esse callback em `src/components/driver/DeliveryCard.tsx:151-158`.
- A implementação real do aceite é `handleAccept` em `src/routes/driver.index.tsx:162-179`.
- A cadeia completa é:

```text
DeliveryCard.onAccept
  → handleAccept(deliveryId)
  → getEffectiveDriverId()
  → acceptDelivery(deliveryId, driverId)
  → updateDriverDelivery({ data: ... })
  → requireExternalSupabaseAuth
  → updateDriverDeliveryAdmin(authenticatedUserId, ...)
```

- `acceptDelivery` está em `src/services/deliveries.ts:600-613`.
- A Server Function `updateDriverDelivery` está em `src/lib/driver-deliveries.functions.ts:5-19`.
- O handler administrativo só é alcançado depois da autenticação e está em `src/lib/driver-deliveries.server.ts:45-120`.

### 2. Origem do endpoint `/_serverFn/b3fcd041...`

Esse endpoint não foi escrito manualmente. Ele é o RPC interno gerado pelo TanStack Start para a declaração `createServerFn({ method: "POST" })` de `updateDriverDelivery`. O sufixo é um identificador de build da função e pode mudar entre builds/deploys; não é uma URL do banco e não deve ser chamada manualmente.

### 3. Payload do aceite

O payload lógico enviado pelo app é:

```json
{
  "deliveryId": "<UUID da entrega>",
  "status": "accepted",
  "driverId": "8bc8f810-cc03-4934-ada9-06b59378b825"
}
```

TanStack encapsula esse objeto no protocolo serializado próprio da Server Function. O validador em `src/lib/driver-deliveries.functions.ts:7-15` exige `deliveryId` UUID, `status` dentro do enum permitido e `driverId` UUID opcional. O 401 ocorre antes desse payload chegar à operação administrativa.

### 4. Headers e sessão enviados

- `src/start.ts:21-24` registra `attachExternalSupabaseAuth` globalmente para Server Functions.
- `src/lib/external-auth-attacher.ts:10-36` lê a sessão do cliente externo, tenta renová-la se estiver a até 60 segundos da expiração e adiciona `Authorization: Bearer <access_token>`.
- A captura de produção mostra várias chamadas `POST /_serverFn/... → 401`.
- Os logs correspondentes mostram `[external-auth] Token rejeitado: usuário ausente.` e **não** mostram “Cabeçalho de autorização ausente”, “Formato inválido” ou “Bearer token vazio”.

Portanto, está confirmado que um Bearer não vazio chega ao servidor. Os headers comuns do protocolo HTTP/RPC são gerados pelo navegador/TanStack; não houve uma captura HAR dessa sessão para enumerar valores individuais, mas nenhum outro header participa da decisão de autenticação encontrada no código.

### 5. Autenticação esperada

`requireExternalSupabaseAuth`, em `src/lib/external-auth-middleware.ts:8-54`, espera:

1. `Authorization: Bearer <JWT>`;
2. JWT emitido e aceito pelo backend externo configurado;
3. `auth.getUser(token)` retornando um usuário válido.

Somente depois disso o middleware injeta `context.userId` e permite que o handler consulte o motorista e altere a entrega.

### 6. Comparação dos UUIDs solicitados

Consulta administrativa somente leitura no backend externo confirmou:

| Dado | UUID |
|---|---|
| `auth.users.id` de `anthony_pva@hotmail.com` | `2aa1bf59-fead-4789-8f4e-c52942ae4976` |
| `delivery_drivers.user_id` | `2aa1bf59-fead-4789-8f4e-c52942ae4976` |
| `delivery_drivers.id` | `8bc8f810-cc03-4934-ada9-06b59378b825` |

O vínculo está correto: `auth.uid()` deve corresponder a `delivery_drivers.user_id`, não a `delivery_drivers.id`. O payload usa corretamente o ID da linha do motorista, enquanto o servidor autentica pelo `user_id`.

## Causa do 401

A causa imediata está confirmada: `supabase.auth.getUser(token)` retorna sem usuário em `requireExternalSupabaseAuth`, e o middleware responde 401 **antes de qualquer consulta à entrega ou ao motorista**. Logo:

- não é conflito entre `delivery_drivers.id` e `delivery_drivers.user_id`;
- não é RLS de `deliveries`;
- não é payload inválido;
- não é entrega já aceita;
- não é ausência completa do cabeçalho Authorization.

A causa raiz mais específica é um token armazenado/enviado que o Auth externo não considera uma sessão válida. As possibilidades compatíveis com a evidência são token expirado, revogado, corrompido ou emitido por outro projeto. O log atual não preserva o código detalhado retornado pelo Auth e, sem capturar a sessão do navegador que reproduziu o erro, não é possível distinguir honestamente essas quatro condições. O fato de o usuário existir no backend externo e ter vínculo correto elimina “usuário não cadastrado” como causa.

Há ainda uma fragilidade objetiva: o cliente em `src/integrations/supabase/client.ts:21-27` usa `autoRefreshToken: false`. O middleware novo só força refresh quando `expires_at` indica expiração próxima; um token já revogado/inválido cujo metadado local ainda pareça vigente é reenviado e rejeitado.

## Server Function ou chamada direta ao banco?

A Server Function é a fronteira correta para esse aceite. A operação usa credencial administrativa no servidor para contornar a política recursiva existente, mas antes valida a identidade do usuário, o vínculo com o motorista, a transição de status e a disputa entre dois entregadores. Fazer a mesma atualização diretamente pelo navegador voltaria a depender da RLS problemática e reduziria a segurança. Portanto, o problema é a sessão apresentada ao RPC, não o uso de `/_serverFn`.

## Hospedagem e deploy

- A produção usa TanStack Start com Nitro/Cloudflare (`vite.config.ts:15-26`, `wrangler.jsonc:3-6`, `src/server.ts:69-79`).
- Não há evidência no histórico recente de troca do preset de hospedagem, entrada do servidor ou configuração do Worker.
- Houve uma mudança recente no app Android (`capacitor.config.ts`) para carregar `https://entregador.mt24horasexpress.com`, mas isso não altera o mecanismo das Server Functions no domínio.
- A mudança diretamente relacionada ao 401 foi de autenticação: `requireExternalSupabaseAuth` entrou no commit de 18:58 UTC, e `attachExternalSupabaseAuth` substituiu o anexador anterior no commit de 19:06 UTC. Os 401 continuaram depois, entre 19:10 e 19:13 UTC, já acompanhados pelo novo log “Token rejeitado”.
- Assim, não foi identificada mudança de hospedagem que explique o erro. A evidência aponta para a sessão/token do cliente e para a validação adicionada ao fluxo.

## Próxima verificação, ainda sem alterar código

Para fechar entre “expirado”, “revogado”, “corrompido” e “projeto emissor incorreto”, é necessário reproduzir logado como `anthony_pva@hotmail.com` e inspecionar, sem expor o token:

1. `iss`, `sub`, `exp` e projeto emissor do JWT no navegador;
2. `sub === 2aa1bf59-fead-4789-8f4e-c52942ae4976`;
3. resultado de `getSession()` e de uma renovação explícita;
4. request final confirmando o mesmo Bearer após a renovação.

Nenhuma alteração de código ou banco foi feita nesta auditoria.
