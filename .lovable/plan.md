# Corrigir o nome da loja no App Entregador

## Objetivo
Garantir que todo card de entrega mostre o nome real da loja vinculada, sem substituir silenciosamente por “Loja”.

## Plano
1. **Confirmar o vínculo da entrega afetada**
   - Inspecionar, no backend externo usado pelo app, a entrega da cliente exibida e conferir `company_id`, o pedido relacionado e a empresa correspondente.
   - Verificar a resposta autenticada da consulta de entregas disponíveis para distinguir entre dado ausente e bloqueio de leitura.

2. **Centralizar a resolução do nome**
   - Ajustar `fetchAvailableDeliveries` para devolver um campo normalizado `company_name` a partir da empresa vinculada.
   - Se a relação embutida falhar, buscar as empresas pelos `company_id` presentes no lote, em uma única consulta, em vez de descartar o erro e devolver entregas sem nome.
   - Preservar o erro real quando o vínculo não puder ser lido, evitando que uma falha de banco pareça apenas o texto genérico “Loja”.

3. **Corrigir a permissão somente se necessário**
   - Caso a leitura autenticada confirme bloqueio de acesso, ajustar a política de leitura de `companies` para entregadores visualizarem somente empresas ligadas a entregas disponíveis ou atribuídas a eles.
   - Não ampliar acesso a empresas sem relação com o entregador.

4. **Simplificar o card**
   - Fazer o `DeliveryCard` consumir o nome já normalizado pelo serviço, removendo consultas individuais por card e condições concorrentes que podem sobrescrever o nome correto.
   - Exibir um estado explícito de vínculo inválido apenas quando a entrega realmente não possuir empresa associada.

5. **Validar de ponta a ponta**
   - Entrar como entregador, abrir Início e Entregas, e confirmar que a entrega citada mostra o nome real da loja.
   - Verificar também entregas pendentes, aceitas e histórico para garantir comportamento consistente.

## Detalhes técnicos
- Arquivos principais: serviço de entregas e card de entrega.
- Banco: inspeção da relação `deliveries.company_id -> companies.id`; migração de RLS apenas se o teste autenticado provar que ela é a causa.
- Critério de aceite: nenhum card com `company_id` válido pode renderizar apenas “Loja”.