# Corrigir o erro 401 ao aceitar entregas

## Diagnóstico confirmado

O erro acontece antes de qualquer consulta ou alteração em `deliveries`: a Server Function protegida responde `401 Unauthorized` durante a validação da sessão.

O app usa a autenticação do banco externo, mas o cliente está configurado com renovação automática de token desativada. O middleware global apenas lê a sessão armazenada e encaminha o token atual; quando ele está expirado ou ausente, a função de aceitar entrega é bloqueada antes de executar a operação.

**Não é necessário executar SQL para esta correção.** A chave administrativa externa já está configurada no ambiente do projeto.

## Implementação

1. Criar um middleware cliente específico para o banco externo que:
   - obtenha a sessão atual antes de cada Server Function protegida;
   - renove a sessão quando o token estiver expirado ou próximo de expirar;
   - anexe o token externo válido no cabeçalho `Authorization`;
   - encerre a sessão e encaminhe o usuário ao login somente quando a renovação realmente falhar.

2. Registrar esse middleware em `src/start.ts` no lugar do anexador gerado, sem alterar os arquivos de integração gerados automaticamente.

3. Fortalecer o middleware servidor externo para:
   - validar o token do mesmo backend usado pelo app;
   - distinguir ausência de cabeçalho, token expirado e token inválido em logs internos seguros;
   - nunca registrar o token nem expor detalhes técnicos ao usuário.

4. Manter a operação administrativa de aceite já existente, incluindo validação do entregador, transição de status e proteção contra dois entregadores aceitarem a mesma entrega.

5. Melhorar o tratamento do aceite no app para não repetir automaticamente uma chamada que já retornou 401 e mostrar uma orientação clara para entrar novamente apenas se a sessão não puder ser renovada.

## Validação

- Entrar com um entregador do banco externo e aceitar uma entrega disponível.
- Confirmar que a chamada `/_serverFn/...` inclui o bearer externo e retorna sucesso, não 401.
- Confirmar que entrega, motorista e status são atualizados no banco externo.
- Simular token expirado e confirmar renovação antes da chamada.
- Confirmar que cliques repetidos continuam bloqueados e que uma entrega já aceita por outro motorista mantém a mensagem correta.
- Publicar a correção, pois os erros apresentados são do domínio de produção.