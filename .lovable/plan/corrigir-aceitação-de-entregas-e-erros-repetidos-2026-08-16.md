# Corrigir aceitação de entregas e erros repetidos

## Objetivo
Restabelecer o fluxo de aceitar entrega no banco externo, eliminar as requisições 400 do carregamento e solicitar localização somente após uma ação do entregador.

## Alterações
1. **Alinhar a autenticação da função de aceitar entrega**
   - Criar um middleware de servidor específico para validar o token da mesma sessão do banco externo usada pelo aplicativo.
   - Trocar a função `updateDriverDelivery` para usar esse middleware, mantendo a validação de identidade e de vínculo com o cadastro do entregador.
   - Preservar a operação atômica que impede dois entregadores de aceitar a mesma entrega.

2. **Corrigir o carregamento das entregas ativas**
   - Remover do JOIN de `orders` as colunas inexistentes `customer_name` e `customer_phone`.
   - Buscar somente campos confirmados no schema ou usar os dados já presentes em `deliveries`, evitando o primeiro request 400 e os fallbacks repetidos.
   - Manter a resolução do nome da loja pelo fluxo existente.

3. **Evitar falso estado de entrega aceita**
   - Marcar a entrega como aceita localmente somente depois da confirmação do servidor.
   - Quando houver disputa real, atualizar imediatamente as listas e mostrar “já aceita por outro entregador” apenas se o banco confirmar que a entrega deixou de estar disponível.
   - Bloquear cliques repetidos enquanto a aceitação estiver em andamento.

4. **Adequar a geolocalização ao gesto do usuário**
   - Iniciar o monitoramento GPS quando o entregador ativar o botão Online, em vez de disparar a solicitação automaticamente durante a renderização.
   - Manter o acompanhamento contínuo enquanto estiver online e encerrá-lo ao ficar offline.

## Validação
- Entrar com uma sessão do banco externo e confirmar que a chamada da função protegida deixa de retornar 401.
- Aceitar uma entrega disponível e conferir a atribuição ao motorista e a remoção da lista pública.
- Simular uma disputa entre dois entregadores e verificar que apenas um aceita.
- Confirmar ausência do erro `orders_1.customer_phone does not exist` e dos requests 400 repetidos.
- Confirmar que a permissão de localização só aparece após ativar Online.

## Detalhes técnicos
- Não será necessário alterar tabelas nem executar SQL para estes erros.
- O middleware novo ficará fora dos arquivos gerados automaticamente e usará as credenciais públicas do banco externo; a chave privilegiada continuará restrita ao servidor.
