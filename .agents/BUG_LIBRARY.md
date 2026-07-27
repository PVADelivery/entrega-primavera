# 📚 BIBLIOTECA DE BUGS E CORREÇÕES

Este documento registra os bugs encontrados no sistema, suas causas raízes e as soluções definitivas testadas para consulta contínua do agente AI.

---

### 1. Divergência de Cadastro de Entregadores (`delivery_drivers` vs `profiles` / `user_roles`)
* **Sintoma**: Entregadores reais cadastrados sumiam do Painel Admin, ou apareciam perfis fictícios de teste (`Driver Four`, `Driver Five`).
* **Causa Raiz**: Usuários cadastrados via convite ou auth geram linhas em `profiles` e `user_roles`, mas podem não ter registro imediato na tabela `delivery_drivers`.
  - Se a busca for restrita apenas a `delivery_drivers`, entregadores sem linha nessa tabela somem.
  - Se a busca for genérica por `profiles`/`user_roles`, perfis demo/teste antigos aparecem na frota.
* **Solução Padrão**:
  1. Fazer busca combinada em `delivery_drivers`, `profiles` e `user_roles`.
  2. Filtrar perfis demo fictícios usando a regex `^driver\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)`.
  3. Mapear tanto `user_id` quanto `id` para evitar inconsistência nos dados de perfil.

---

### 2. Ocultação de Entregadores por Filtro de Abas no Frontend (`drivers.tsx`)
* **Sintoma**: Ao trocar de aba no painel (ex: Moto, Carro, Táxi), entregadores reais sumiam da tabela.
* **Causa Raiz**: O filtro de abas em `drivers.tsx` fazia verificação rígida do array `service_types` (`services.length === 0`), impedindo a correspondência quando um veículo era moto mas possuía outro tipo de serviço registrado.
* **Solução Padrão**:
  Flexibilizar as expressões condicionais no filtro para checar `services.includes(...) || d.vehicle_type === ... || !d.vehicle_type`.

---

### 3. Falha de Execução de Comandos Git Encadeados (`&&` no PowerShell)
* **Sintoma**: Erro `O token '&&' não é um separador de instruções válido nesta versão`.
* **Causa Raiz**: O terminal do ambiente (Windows PowerShell) não aceita o operador `&&`.
* **Solução Padrão**:
  Sempre utilizar o caractere de ponto e vírgula `;` para encadear comandos no PowerShell: `git add .; git commit -m "..."; git push`.

---

### 4. Desincronização de Serviços entre Repositórios
* **Sintoma**: Ajuste feito em um app (ex: `painel-primavera`) não refletia nos demais apps (`lojista-primavera-1` e `entrega-primavera`).
* **Causa Raiz**: As funções de serviço como `fetchDrivers()` existem duplicadas em cada repositório da suíte.
* **Solução Padrão**:
  Sempre replicar correções de serviços e modelos em todos os 3 repositórios ativos do workspace (`painel-primavera`, `lojista-primavera-1` e `entrega-primavera`) e executar o `git commit` e `git push` em todos eles.
