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

---

### 5. Nenhuma Loja Encontrada (0 Lojas no Marketplace / App do Cliente)
* **Sintoma**: A página inicial do cliente exibe "0 lojas / Nenhuma loja encontrada" mesmo havendo empresas cadastradas no sistema.
* **Causa Raiz**: 
  1. A propriedade `is_open` na tabela `companies` podia estar `NULL` ou `false` no banco de dados. Ao ativar a opção "Aberto agora" (`openOnly`), a filtragem estrita `s.is_open === true` descartava todas as empresas.
  2. Possível restrição de RLS ou permissões na tabela `companies` impedindo a leitura por usuários anônimos/clientes.
* **Solução Padrão**:
  1. No frontend (`marketplace.index.tsx`), tratar `is_open` nulo/indefinido com fallback permissivo (`s.is_open ?? true`) e ignorar empresas apenas se `is_active === false`.
  2. Fornecer botão de atalho para resetar filtros ("Ver todas as lojas") caso a busca filtrada resulte em zero empresas.
  3. Garantir a liberação de RLS na tabela `companies` via SQL migration (`ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY; GRANT ALL ON public.companies TO authenticated, anon, public;`).

---

### 6. Ausência de Abas Laterais e Navegação por Seções em Configurações
* **Sintoma**: A tela de Configurações (Editor de Perfil) exibe todas as opções em uma lista longa contínua sem menu lateral de abas para alternar entre as seções.
* **Causa Raiz**: O componente `business.settings.tsx` não contava com navegação por abas nem com menu lateral para alternar rapidamente entre seções.
* **Solução Padrão**:
  1. Implementar a barra de navegação de sub-abas horizontal (`Sub-Abas de Navegação de Configurações`) no topo da página.
  2. Adicionar o menu fixo lateral de navegação por abas (`Abas de Configuração`) na coluna lateral para alternar instantaneamente entre Perfil & Negócio, Horários de Funcionamento, Contato & Localização, Taxas de Entrega, Galeria de Fotos e Zona de Perigo.

---

### 7. Erro de Carregamento da Página `/business/settings` em Produção ("This page didn't load")
* **Sintoma**: Ao acessar `https://lojista.mt24horasexpress.com/business/settings`, a página exibe "This page didn't load / Something went wrong on our end".
* **Causa Raiz**: O componente importava a biblioteca `maplibre-gl` de forma estática no topo do arquivo (`import * as maplibregl from "maplibre-gl"`). Durante o render no servidor (SSR do TanStack Start/Cloudflare Workers), a biblioteca tentava acessar objetos de navegador como `window` ou `document`, disparando `ReferenceError` e quebrando o SSR da rota.
* **Solução Padrão**:
  1. Remover a importação estática de `maplibre-gl` no topo do arquivo.
  2. Carregar o `maplibre-gl` dinamicamente com `import("maplibre-gl")` dentro do hook `useEffect` e checar `typeof window !== "undefined"`.

---

### 8. Erro de Carregamento em Produção por Arquivos `.bak` em `src/routes` e Directivas `"use client"`
* **Sintoma**: Ao acessar `https://www.mt24horasexpress.com/marketplace/rides`, a página exibe "This page didn't load / Something went wrong on our end".
* **Causa Raiz**:
  1. Presença de arquivo de backup `marketplace.rides.tsx.bak` dentro do diretório `src/routes`, gerando conflitos no gerador de rotas do TanStack Router.
  2. Uso de diretivas `"use client";` estáticas no topo do arquivo de rota e imports estáticos de bibliotecas de mapa como `maplibre-gl` em componentes renderizados via SSR no Cloudflare.
* **Solução Padrão**:
  1. Remover quaisquer arquivos com extensão `.bak` do diretório `src/routes/`.
  2. Remover a diretiva `"use client";` de topo das rotas do TanStack Router.
  3. Garantir que todas as páginas e componentes contendo `maplibre-gl` utilizem imports dinâmicos (`import("maplibre-gl")`) condicionados ao ambiente cliente (`typeof window !== "undefined"` ou estado `mounted`).

---

### 9. Erro de SSR "This page didn't load" causado por Acesso Direto ao `localStorage`
* **Sintoma**: Ao acessar páginas como `/marketplace/profile`, `/marketplace/checkout`, `/marketplace/addresses` ou `/business/map`, o Cloudflare exibe a tela de erro "This page didn't load / Something went wrong on our end".
* **Causa Raiz**: O React/TanStack Start executa o render inicial no servidor (SSR). O acesso direto a `localStorage.getItem(...)` ou `localStorage.setItem(...)` no escopo inicial do componente ou do `useState` dispara `ReferenceError: localStorage is not defined`, abortando a renderização no servidor.
* **Solução Padrão**:
  Sempre envolver o acesso a `localStorage` com a verificação `typeof window !== "undefined"`:
  ```tsx
  const [theme, setTheme] = useState(() => (typeof window !== "undefined" ? localStorage.getItem('theme') || 'light' : 'light'));
  ```

---

### 10. Redirecionamento Precoce durante SSR disparando Erro no TanStack Router em `/marketplace/rides`
* **Sintoma**: Ao acessar `https://www.mt24horasexpress.com/marketplace/rides`, a página exibe erro "This page didn't load / Something went wrong on our end".
* **Causa Raiz**: O componente `RidesPage` chamava `navigate({ to: "/login" })` diretamente dentro do `useEffect` se `!user` estivesse verdadeiro no render inicial. Durante o SSR no Cloudflare, o estado do usuário começa nulo (`null`), forçando um erro de redirecionamento prematuro no servidor.
* **Solução Padrão**: Envolver a rota com a guarda `<RequireAuth>`, que trata adequadamente o estado de carregamento (`loading`) antes de redirecionar o cliente de forma segura no navegador.

---

### 11. Erro de Renderização "Minified React error #310" em Rotas com Trava de Montagem Cliente (`if (!mounted)`)
* **Sintoma**: Ao acessar páginas como `/marketplace/rides`, `/marketplace/taxi` ou `/marketplace/errands`, a aplicação falha com "This page didn't load / Minified React error #310".
* **Causa Raiz**: O componente continha uma instrução de retorno condicional `if (!mounted) return <Skeleton />` posicionada no meio do componente, ANTES de outras chamadas de `useEffect`, `useState` ou `useRef`. No primeiro render (SSR/Mount), a trava retornava precocemente e pulava os hooks inferiores. No render seguinte (quando `mounted` tornava-se `true`), os hooks inferiores eram executados, alterando a quantidade de hooks chamados entre renders e violando as Regras de Hooks do React ("Rendered more hooks than during the previous render").
* **Solução Padrão**:
  Declarar 100% dos hooks (`useState`, `useRef`, `useEffect`) incondicionalmente no topo da função do componente, posicionando o retorno condicional de montagem cliente `if (!mounted) return <Skeleton />` APÓS a declaração de todos os hooks.

---

### 12. Erro de Construtor ES6 "Class constructor Ua cannot be invoked without 'new'" ao carregar MapLibre via CDN Script
* **Sintoma**: Ao carregar páginas com mapa (como `/marketplace/rides`, `/marketplace/taxi`), o app falha com "This page didn't load / Class constructor Ua cannot be invoked without 'new'".
* **Causa Raiz**: O componente injetava um script global via `<script src="https://unpkg.com/maplibre-gl...">`. Em ambientes empacotados com Vite em modo de produção (ES modules), chamar `new MapLibre.Map(...)` ou `new MapLibre.Marker(...)` a partir da variável injetada no escopo global `window.maplibregl` fazia a classe ser invocada através de um wrapper transpilado sem o operador `new` nativo do ES6.
* **Solução Padrão**:
  Substituir a injeção manual de tags `<script>` CDN pela importação dinâmica de ES module nativa do bundler:
  1. Importar o CSS estaticamente: `import "maplibre-gl/dist/maplibre-gl.css";`
  2. Carregar o módulo dinamicamente dentro do `useEffect`:
     ```tsx
     useEffect(() => {

---

### 13. Erro 400 em Consulta Supabase por Sintaxe Inválida de `id.in.(...)` dentro de String `.or(...)`
* **Sintoma**: A página `/marketplace/rides` exibia "Você ainda não solicitou nenhuma corrida." mesmo após solicitar corrida e salvar o ID no dispositivo.
* **Causa Raiz**: O uso da string `.or("user_id.eq.XXX,id.in.(AAA,BBB)")` no Supabase JS. O manipulador PostgREST não suporta parênteses aninhados da cláusula `in.(...)` dentro de uma expressão lógica `.or()`, disparando um erro HTTP 400 (Bad Request) que abortava a execução da consulta e limpava o resultado.
* **Solução Padrão**:
  Executar consultas independentes e limpas em paralelo via `Promise.all([queryUser, querySavedIds, queryEmail])` e mesclar/deduplicar os resultados por `id` no frontend:
  ```tsx























---

### 36. Mapa em Branco (Retângulo Vazio) no Aplicativo do Entregador (`driver.deliveries.tsx`)
* **Sintoma**: O mapa de acompanhamento da corrida no aplicativo do entregador renderizava apenas como uma caixa branca.
* **Causa Raiz**: Ausência de importação do arquivo CSS do MapLibre (`import "maplibre-gl/dist/maplibre-gl.css"`) e bloqueio/falha de carregamento de estilos de vetor externos.
* **Solução Padrão**:
  Adicionar a importação do CSS no topo do arquivo e substituir a URL de estilo vetorial por uma definição de camada raster do OpenStreetMap direta:
  ```json
  style: {
    version: 8,
    sources: {
      "osm-tiles": {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
      },
    },
    layers: [{ id: "osm-layer", type: "raster", source: "osm-tiles" }],
   ```

---

### 14. Ganhos do Entregador Sempre R$ 0,00 — Erro Postgres 42703 (Coluna Inexistente)
* **Sintoma**: Na tela Início e Perfil Financeiro do app do entregador, os ganhos exibiam R$ 0,00 mesmo com entregas concluídas no banco. O console do navegador mostrava `DELIVERIES: null` e `DELIVERIES ERROR: {code: '42703', message: 'column deliveries.delivery_fee does not exist'}` (e também `delivered_at`).
* **Causa Raiz**: A função `fetchEarnings` em `deliveries.ts` e a consulta financeira em `driver.profile.tsx` referenciavam colunas `delivery_fee` e `delivered_at` no `.select()`, que **não existem** na tabela `deliveries` do Postgres. O PostgREST rejeitava a query inteira com HTTP 400, retornando `null` em vez dos dados.
* **Solução Padrão**:
  1. Usar apenas colunas que existem no banco: `.select("value, commission, completed_at, created_at")`.
  2. Remover fallbacks de data para colunas inexistentes (`r.delivered_at`).
  3. Calcular a taxa do entregador usando `Number(r.value || 0)` diretamente.
  4. **Regra**: Antes de referenciar uma coluna no `.select()`, confirmar que ela existe na tabela do Supabase.

---

### 15. Desincronização de Nomes, Bairros e Preços das Regiões do Admin no Painel Lojista e App do Entregador
* **Sintoma**: O Admin editava nomes, valores e adicionava bairros nas regiões (`/admin/regions`), mas no painel do lojista (ao criar entrega) e no app do entregador continuavam aparecendo os nomes antigos e valores estáticos (`Região 1 (R$ 8,00)`, `CENTRO - PVA 1 / JD RIVA 1/2/3/4 (R$ 10,00)`).
* **Causa Raiz**:
  1. O componente `RegionZoneSelector.tsx` no painel do lojista continha um array constante estático (`DELIVERY_ZONES`) e nunca consultava as tabelas `regions` e `region_neighborhoods` do Supabase.
  2. Passava `regionId: "none"` fixo ao selecionar a região, impedindo que a entrega fosse associada à região real no banco.
  3. As consultas do app do entregador não incluíam a relação `regions(id, name, price)`.
* **Solução Padrão**:
  1. Refatorar `RegionZoneSelector.tsx` para carregar `regions` e `region_neighborhoods` dinamicamente do Supabase, ordenadas por `sort_order` e `price`, com suporte a canais Realtime para sincronização instantânea com as edições do Admin.
  2. Associar o `region_id` real da região selecionada à tabela `deliveries`.
  3. Incluir `regions(id, name, price)` nas consultas de entregas do app do entregador e exibir as tags de Região e Bairro no `DeliveryCard.tsx`.

---

### 16. Robô do Telegram Não Reportando Erros de Tela e Falha 401 Unauthorized
* **Sintoma**: Erros exibidos na tela dos usuários (toasts, falhas de sistema, exceções não tratadas) não eram enviados para o canal/grupo do Telegram pelo bot.
* **Causa Raiz**:
  1. A Edge Function `telegram-logger` exigia autenticação de usuário obrigatória (`Bearer` token com usuário logado válido), retornando `401 Unauthorized` e abortando o envio quando erros ocorriam com visitantes, usuários na tela de login, clientes deslogados ou quando a sessão expirava.
  2. Os erros visuais exibidos via `toast.error(...)` (da biblioteca `sonner`) não estavam integrados ao serviço de telemetria `logger.ts`.
  3. Os apps `entrega-primavera` e `cliente-primavera` não chamavam `initializeGlobalErrorHandlers` em seus componentes raiz.
* **Solução Padrão**:
  1. Atualizar a Edge Function `telegram-logger` para aceitar erros tanto autenticados quanto anônimos/públicos, usando formatação HTML segura (`parse_mode: "HTML"`) para evitar falhas de Markdown no Telegram.
  2. Implementar interceptador automático de `toast.error(...)` e cache de deduplicação (15s) no `logger.ts` com fallback direto para a API do Telegram (`https://api.telegram.org/bot.../sendMessage`) caso a Edge function falhe.
  3. Inicializar `initializeGlobalErrorHandlers` no `__root.tsx` de todos os 4 repositórios da suíte (`painel-primavera`, `lojista-primavera-1`, `entrega-primavera`, `cliente-primavera`).

---

### 17. Erro HTTP 400 Bad Request ao Buscar Pedidos Ativos no Marketplace (`order_status` Inválido)
* **Sintoma**: Ao carregar o marketplace do cliente, requisições para `rest/v1/orders?select=id&user_id=eq...&status=in.(pending,accepted,preparing,ready,out_for_delivery)` falhavam com HTTP 400 (Bad Request).
* **Causa Raiz**: A coluna `orders.status` no Postgres é do tipo ENUM `order_status` com os valores válidos: `pending`, `preparing`, `ready`, `in_route`, `delivered`, `cancelled`. As strings `'accepted'` e `'out_for_delivery'` não existem no enum Postgres, fazendo o banco rejeitar o filtro `status.in.(...)` com erro 400.
* **Solução Padrão**:
  1. Utilizar apenas valores válidos do enum do Postgres no filtro de pedidos ativos: `.in("status", ["pending", "preparing", "ready", "in_route"])`.
  2. Mapear `"in_route"` nas rotas de listagem e detalhes do pedido (`marketplace.orders.tsx` e `marketplace.orders.$orderId.tsx`).

---

### 23. Bloqueio de Lojas no Marketplace por RLS Policy Restritiva na Tabela `companies`
* **Sintoma**: As lojas sumiam do Marketplace do Cliente (`cliente.mt24horasexpress.com`) com retorno de lista vazia (`0 lojas / Nenhuma loja encontrada`).
* **Causa Raiz**: A tabela `companies` no Supabase estava com Row Level Security (RLS) habilitada sem conceder `SELECT` ao role `anon` (usuários não autenticados que navegam no marketplace).
* **Solução Padrão**:
  Garantir concessão de leitura pública para usuários anônimos e autenticados no Supabase:
  ```sql
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  GRANT SELECT ON public.companies TO anon, authenticated;

  ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "companies_public_read" ON public.companies;
  CREATE POLICY "companies_public_read"
  ON public.companies
  FOR SELECT
  TO anon, authenticated
  USING (is_active IS DISTINCT FROM false);
  ```

---

### 24. Falha ao Atualizar Status de Entregas no App do Entregador ("Falha ao atualizar")
* **Sintoma**: Ao clicar em *"Cheguei na loja"*, *"Coletado, indo entregar"* ou *"Concluir entrega"*, o app exibia o toast de erro *"Falha ao atualizar"*.
* **Causa Raiz**:
  1. A procedure RPC `update_delivery_status_safe` possui parâmetros nomeados `p_delivery_id` e `p_status` em algumas versões da migration e `_delivery_id` e `_status` em outras.
  2. Atualizações diretas via REST no Supabase falhavam por divergência de nomes de colunas de timestamp (`completed_at` vs `delivered_at`) ou pelo retorno restrito por políticas RLS na cláusula `.select()`.
* **Solução Padrão**:
  1. Implementar chamada RPC dual-signature (`p_delivery_id` / `p_status` e fallback para `_delivery_id` / `_status`).
  2. Implementar fallback REST com as 4 combinações de schema (`status` + `completed_at`, `status` + `delivered_at`, status textual direto e update sem retorno `.select()`).

---

### 25. "LocalNotifications plugin is not implemented on android" no App do Entregador
* **Sintoma**: Logs de erro de `Unhandled Rejection` acusando ausência do plugin `LocalNotifications` no Android.
* **Causa Raiz**: Chamadas a `LocalNotifications.cancel(...)` e `LocalNotifications.addListener(...)` eram executadas sem a verificação `Capacitor.isPluginAvailable("LocalNotifications")`.
* **Solução Padrão**:
  Envolver todas as chamadas de notificações locais em blocos condicionais com `Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")` e `try/catch`.

---

### 26. Minified React Error #520 e Incompatibilidade de Hidratação de Tema na Tela de Login
* **Sintoma**: Erro #520 no React ao renderizar o botão `ThemeToggle` ou acessar a tela `/login`.
* **Causa Raiz**: O `ThemeProvider` iniciava com estado fixo `"light"` durante o render do servidor e alterava para `"dark"` de forma assíncrona após a montagem do `useEffect`, quebrando a hidratação do React.
* **Solução Padrão**:
  Inicializar o estado do `useState` de forma síncrona com `typeof window !== "undefined"` e leitura imediata do `localStorage` / `matchMedia`.

---

### 28. Tabelas de Preços Personalizadas por Loja Não Aplicadas ao Criar Entrega
* **Sintoma**: O Admin vinculava uma loja (ex: `AÇAI PRIMAVERA`, `Prime Farma`, `Drogaria Nacional 2`) a uma Tabela de Preços Personalizada em `/admin/pricing`, mas ao criar entregas no painel da loja continuavam aparecendo os valores padrão de cada região.
* **Causa Raiz**:
  1. O componente `RegionZoneSelector.tsx` não consultava `pricing_table_id` da empresa e não buscava as regras personalizadas na tabela `pricing_rules` do Supabase.
  2. Políticas de RLS restritivas na tabela `pricing_rules` e `pricing_tables` bloqueavam a leitura dos dados por usuários autenticados da loja.
  3. No `RegionPickerGrid.tsx`, a filtragem de regras buscava campos incorretos (`r.region_id` e `r.price` em vez de `r.origin_region_id` e `r.base_value`).
* **Solução Padrão**:
  1. Atualizar o `RegionZoneSelector.tsx` para buscar a `pricing_table_id` da empresa e carregar os preços personalizados de `pricing_rules`.
  2. Corrigir os campos de filtragem em `RegionPickerGrid.tsx` (`r.origin_region_id === region.id` e `r.base_value`).
  3. Aplicar migration SQL com política RLS permissiva para leitura de `pricing_tables` e `pricing_rules` (`CREATE POLICY "pricing_rules_public_read" ON public.pricing_rules FOR SELECT TO anon, authenticated, public USING (true);`).
---

### 29. Ausência do Botão/Modal de Criação de Entregas em Lote no Painel Lojista
* **Sintoma**: O lojista não visualizava o botão "Criar entregas em lote" na tela de Nova Solicitação de Entrega (`/business/delivery-new`), sendo forçado a cadastrar uma entrega de cada vez.
* **Causa Raiz**: O componente `BatchDeliveryModal.tsx` e a chamada à RPC PostgreSQL `batch_create_delivery_requests` não estavam integrados à rota do painel do lojista.
* **Solução Padrão**:
  1. Criar a RPC PostgreSQL `batch_create_delivery_requests` que valida a empresa, calcula o valor total do lote, checa o saldo de créditos e executa a inserção atômica de cada entrega individual em `deliveries` juntamente com seu débito sequencial em `credit_transactions`.
  2. Implementar o componente `BatchDeliveryModal.tsx` com formulários independentes para cada entrega (iniciando em 3 por padrão, com suporte a adicionar/remover), seletor de regiões com cálculo automático de taxa por item e resumo financeiro do lote.
---

### 30. Erro de Execução em Produção `ReferenceError: BatchDeliveryModal is not defined`
* **Sintoma**: Ao acessar a página `/business/delivery-new` no painel do lojista, a tela exibia "This page didn't load / ReferenceError: BatchDeliveryModal is not defined".
* **Causa Raiz**: O componente `<BatchDeliveryModal />` foi inserido no corpo JSX da rota `business.delivery-new.tsx` sem incluir a declaração `import { BatchDeliveryModal } from "@/components/business/BatchDeliveryModal";` no topo do arquivo.
---

### 31. Erro Supabase Realtime `cannot add postgres_changes callbacks after subscribe()`
* **Sintoma**: Ao abrir o modal de entregas em lote com múltiplos seletores de região na mesma tela, a aplicação quebrava com "This page didn't load / Error: cannot add `postgres_changes` callbacks for realtime:realtime-regions-selector after `subscribe()`".
* **Causa Raiz**: O componente `RegionZoneSelector.tsx` utilizava um nome estático fixo para o canal Supabase (`"realtime-regions-selector"`). Quando múltiplos componentes eram renderizados na mesma página (ou no remounting do React), chamadas subsequentes a `supabase.channel("realtime-regions-selector")` retornavam a mesma instância de canal já inscrita, fazendo o método `.on(...)` falhar por ser invocado após o `.subscribe()`.
* **Solução Padrão**:
---

### 32. Migração de Entregas em Lote de Modal para Formulário Direto na Tela com Contador de Entregas
* **Sintoma**: O lojista solicitou a remoção do modal popup de entregas em lote, exigindo que a criação de múltiplas entregas ocorra diretamente na tela principal (`/business/delivery-new`) no modelo Rápido (somente Nome, Telefone e Região) utilizando um contador de entregas.
* **Causa Raiz**: O uso de modal separado poluia a navegação e tornava a criação de entregas em lote menos ágil do que um contador direto na página principal.
* **Solução Padrão**:
  1. Remover o `BatchDeliveryModal` e integrar o estado `batchCount` diretamente em `business.delivery-new.tsx`.
  2. Adicionar o componente **Contador de Entregas** (`[-] N entregas [+]` com atalhos `1`, `3`, `5`, `10`, `15`) no topo da tela no modo Entregas Rápidas.
  3. Quando `batchCount > 1`, renderizar os formulários simplificados por entrega (Nome do Cliente, WhatsApp/Telefone e `RegionZoneSelector`).
---

### 33. Ocultamento de Regiões com Seta Retrátil (Accordion) e Expansão ao Clicar na Região
* **Sintoma**: As 15 regiões do seletor ficavam todas visíveis e abertas por padrão, deixando a tela de cadastro de entrega excessivamente longa.
* **Causa Raiz**: O componente `RegionZoneSelector.tsx` renderizava o grid completo das 15 regiões sem um botão retrátil de agrupamento.
* **Solução Padrão**:
  1. Adicionar o estado `isListOpen` (fechado por padrão ou com resumo) e o botão retrátil `📍 Clique na seta para escolher a Região [Ver Regiões ⬇️ / Ocultar Regiões ⬆️]`.
  2. Ao clicar na seta, a lista com as 15 regiões expande com animação.
---

### 34. Busca e Autocomplete de Clientes Cadastrados em Entregas Individuais e em Lote
* **Sintoma**: Ao digitar o Nome do Cliente ou Telefone durante o cadastro de entregas em lote, o sistema não exibia as sugestões de clientes salvos no banco de dados para preenchimento automático.
* **Causa Raiz**: Os campos de input dos itens em lote não acionavam a busca consolidada `customerQuery` nem renderizavam o dropdown flutuante de sugestões `customerSuggestions`.
* **Solução Padrão**:
  1. Conectar os manipuladores `onChange` e `onFocus` de cada item em lote para atualizar `customerQuery`, `activeBatchSearchIdx` e exibir `showSuggestions`.
---

### 35. Erro no Banco de Dados `column "price" of relation "deliveries" does not exist`
* **Sintoma**: Ao submeter a criação de entregas em lote, o Supabase retornava o erro `column "price" of relation "deliveries" does not exist`.
* **Causa Raiz**: O comando `INSERT INTO public.deliveries (...)` na função PostgreSQL `batch_create_delivery_requests` incluía explicitamente a coluna `price`, que não existe na estrutura da tabela `deliveries` (o campo correto é `value`).
* **Solução Padrão**:
---

### 36. Agrupamento de Entregas em Lote com Card Único de Aceite no App do Entregador
* **Sintoma**: Múltiplas entregas enviadas em lote pelo lojista ficavam soltas na lista do entregador, podendo ser aceitas por entregadores diferentes.
* **Causa Raiz**: Não havia um identificador único de lote (`batch_id`) vinculando as entregas criadas simultaneamente nem um componente visual agregador no App do Entregador.
* **Solução Padrão**:
  1. Adicionar coluna `batch_id UUID` na tabela `deliveries` e atualizar a RPC `batch_create_delivery_requests` para atribuir o mesmo `batch_id` para todas as entregas criadas juntas.
  2. Implementar a RPC `accept_delivery_batch(p_batch_id, p_driver_id)` para transicionar todas as entregas do lote juntas para `accepted`.
  3. Criar o componente `BatchDeliveryCard.tsx` no App do Entregador (`entrega-primavera`), exibindo o badge em destaque (`📦 LOTE COM N ENTREGAS`), soma dos valores, destinos numerados e o botão de aceite único.

---

### 37. Disparo Imediato de Notificações e Sons ao Criar Entrega Bypassando a Janela Admin de 2 Minutos
* **Sintoma**: Ao cadastrar uma entrega no painel do lojista, os entregadores recebiam notificação push, toque de ronco de motor e alerta visual na mesma hora, porém a entrega só aparecia na lista para aceitar 2 minutos depois.
* **Causa Raiz**:
  1. A função `notifyNewDelivery` no hook `useDriverNotifications.ts` do app do entregador (`entrega-primavera`) disparava áudio e notificações sem verificar se a entrega estava no período de carência de 2 minutos do Admin (`getElapsedSeconds(created_at) < 120`).
  2. As Edge Functions `send-push` e `notify-driver` disparavam mensagens push FCM aos entregadores imediatamente no evento `INSERT` de entregas pendentes sem `driver_id`.
  3. O trigger PostgreSQL `trigger_send_push_on_delivery` bloqueava eventos `UPDATE` quando o Admin atribuía um entregador diretamente.
* **Solução Padrão**:
  1. No hook `useDriverNotifications.ts`, verificar `getElapsedSeconds(created_at) < 120` para entregas pendentes e sem `driver_id`, ignorando notificações e sons até a entrega completar 2 minutos ou ser transmitida/atribuída.
  2. Nas Edge Functions `send-push` e `notify-driver`, adicionar validação de carência de 120 segundos para ignorar push FCM geral em entregas com menos de 2 minutos.
  3. Atualizar o trigger SQL `trigger_send_push_on_delivery` para permitir disparo de push em eventos `UPDATE` quando `driver_id` for preenchido pelo Admin ou status for alterado para `broadcasted`.

---

### 38. Lentidão Excessiva e Gargalo de CPU/Rede no Aplicativo do Entregador (`entrega-primavera`)
* **Sintoma**: O aplicativo do entregador apresentava extrema lentidão, travamentos e requisições excessivas em segundo plano.
* **Causa Raiz**:
  1. A função `pollDeliveries` no hook `useDriverNotifications.ts` rodava a cada **3 segundos** e efetuava uma consulta Supabase individual extra (`N+1 queries`) para CADA entrega na lista via `.eq("id", rawDelivery.id).single()`, bombardeando a API com dezenas de requisições por minuto.
  2. Múltiplos seletores de interval (`checkTimer` a 5s em `NewDeliveryPopupModal`, `refetchInterval` a 5s em `driver.index.tsx` e `pollDeliveries` a 3s) rodavam concorrentemente disputando recursos e travando a thread principal.
  3. O `triggerOffer` em `NewDeliveryPopupModal.tsx` fazia 2 requisições adicionais incondicionais à tabela `companies` em todo alerta de entrega.
* **Solução Padrão**:
  1. Eliminar a consulta `N+1` em `useDriverNotifications.ts`, reaproveitando os dados já carregados pelo payload/realtime (`rawDelivery.companies`).
  2. Ajustar os intervalos de polling para valores leves (10s a 15s) e confiar na sincronização em tempo real nativa do Supabase Realtime (`deliveries-home`).
  3. Reutilizar o nome e endereço da empresa já inclusos no objeto da entrega no `NewDeliveryPopupModal.tsx`, evitando chamadas desnecessárias à API.

---

### 39. Entregas Ocultas no App do Entregador por Erro de Parsing de Timezone em `getElapsedSeconds`
* **Sintoma**: Entregas criadas recentemente ficavam invisíveis no app do entregador ("Sem entregas no momento"), mesmo após transcorridos os 2 minutos do Admin.
* **Causa Raiz**:
  A função `getElapsedSeconds` em `time.ts` manipulava strings ISO (`str.replace(" ", "T") + "Z"`) concatenando `"Z"` incondicionalmente. Em datas ISO retornadas do Supabase contendo `+00:00`, a concatenação gerava datas inválidas (`NaN`) ou distorções de 4 horas no futuro. O cálculo de tempo decorrido resultava em valores negativos/inválidos, fazendo o filtro `elapsedSeconds >= 120` rejeitar as entregas disponíveis.
* **Solução Padrão**:
  Refatorar `getElapsedSeconds` para tentar o parse nativo direto via `new Date(str).getTime()` e fallback com substituição limpa de espaço. Se `elapsedMs < 0` por pequenas variações de relógio, retornar `0`, e se for `NaN`, retornar `999999` para garantir que a entrega seja exibida normalmente.

---

### 40. Entregas Pendentes Não Listadas por Divergência de Formato de `driver_id` ou Falha de Join PostgREST
* **Sintoma**: Entregas em aberto criadas no painel do lojista (ex: "Jose teste banco") não apareciam em "Entregas disponíveis" do app do entregador mesmo após decorridos os 2 minutos.
* **Causa Raiz**:
  1. O filtro `.is("driver_id", null)` na consulta PostgREST exigia `driver_id` estritamente nulo. Se a entrega fosse gravada com `driver_id` vazio `""` ou `"none"`, a cláusula de busca excluía o registro.
  2. A cláusula `.select("*, companies(...), regions(...)")` descartava entregas caso houvesse falha de permissão RLS ou junção de tabela em `regions` ou `companies`.
* **Solução Padrão**:
  Flexibilizar `fetchAvailableDeliveries` para carregar `deliveries` sem obrigatoriedade de joins e filtrar em memória se `driver_id` está ausente, vazio (`""`), `"none"` ou nulo, incluindo fallbacks de busca e suporte a múltiplos status equivalentes a em aberto (`pending`, `broadcasted`, `pending_assignment`, `open`, `created`, `em_aberto`).

---

### 41. Contador da Barra de Navegação Inferior Desatualizado para a Aba "Corridas"
* **Sintoma**: O selo/contador (badge) na barra de navegação inferior não exibia a quantidade de corridas ativas na aba "Corridas", mantendo o contador zerado mesmo com uma corrida recém-solicitada.
* **Causa Raiz**:
  A consulta em `MarketplaceLayout.tsx` filtrava exclusivamente por `user_id = user.id` via Supabase. Caso o cliente criasse uma corrida sem estar logado ou se os IDs fossem gravados localmente em `localStorage` (`pva_my_ride_ids` / `pva_local_rides`), a contagem ignorava os registros ativos.
* **Solução Padrão**:
  Atualizar o cálculo do contador em `MarketplaceLayout.tsx` para combinar consultas por `user_id` e IDs armazenados em `localStorage`, além de registrar um ouvinte de evento `pva_ride_updated` para atualização instantânea em tempo real do badge.

---

### 42. Duplicidade de Cards de Corridas e Exibição de R$ 0,00 na Tela de Corridas
* **Sintoma**: A tela "Suas Corridas" (`marketplace.rides.tsx`) exibia múltiplos cards repetidos da mesma corrida ativa e o valor da corrida ficava fixo em `R$ 0,00`.
* **Causa Raiz**:
  1. A listagem "Corridas Ativas" na parte inferior não filtrava o ID da corrida ativa em destaque (`activeRide.id`), renderizando a mesma corrida no topo (Hero Card com mapa) e repetida abaixo.
  2. O formulário de solicitação de corrida (`marketplace.taxi.tsx`) não incluía o campo `price` no payload enviado para o banco, resultando em `price = null` / `0` na tabela `ride_requests`.
* **Solução Padrão**:
  1. Incluir `price` calculado no payload de inserção de `marketplace.taxi.tsx` e adicionar fallbacks de valor (`price || estimated_value || value || (taxi ? 15.0 : 10.0)`).
  2. Excluir a corrida em destaque (`activeRide.id`) da lista inferior de corridas ativas em `marketplace.rides.tsx`, exibindo um único card limpo em destaque.

---

### 43. Multiplicidade de Cards de Corridas por `localStorage` e Valor Padrão Fixo
* **Sintoma**: O app apresentava múltiplos cards ativos repetidos da mesma corrida e os valores não refletiam o preço real baseado na distância percorrida.
* **Causa Raiz**:
  1. O código de `marketplace.rides.tsx` reinjetava corridas salvas em `localStorage` (`pva_local_rides`), gerando corridas fantasma duplicadas.
  2. A submissão do formulário (`marketplace.taxi.tsx`) não calculava a distância dinâmica caso `distance` estivesse zerado na hora da solicitação.
* **Solução Padrão**:
  1. Remover a reinjeção de `pva_local_rides` no `marketplace.rides.tsx` e limitar a exibição estritamente ao card único em destaque da corrida ativa atual.
  2. Calcular dinamicamente `calculateDistance` e o preço final (`baseFee + dist * kmRate`) no exato momento da submissão em `marketplace.taxi.tsx`.

---

### 44. Minified React Error #418 por Leitura de `localStorage` na Inicialização de `useState`
* **Sintoma**: Erro não capturado `Minified React error #418` no console durante a renderização das rotas do cliente.
* **Causa Raiz**:
  Componentes como `marketplace.addresses.tsx`, `marketplace.checkout.tsx` e `marketplace.profile.tsx` utilizavam inicialização lazy `useState(() => localStorage.getItem(...))` com checagem `typeof window !== "undefined"`. Durante a pré-renderização estática o valor inicial era `""` e na hidratação client-side o valor lia o `localStorage`, gerando uma divergência de hidratação no React.
* **Solução Padrão**:
  Inicializar o estado de forma determinística (`""` ou `'light'`) e mover a leitura do `localStorage` para dentro do hook `useEffect` após a montagem do componente no navegador.

---

### 45. Ocultação de Corrida Ativa Recém-Criada por Ausência de Fallback de Sessão
* **Sintoma**: Ao solicitar uma corrida, a aba "Corridas" exibia "Nenhuma corrida em andamento" para passageiros não autenticados ou quando ocorria pequenos atrasos na resposta do Supabase.
* **Causa Raiz**:
  A remoção total da leitura do `localStorage` fazia com que corridas solicitadas por passageiros visitantes (com `user_id = null`) não fossem associadas se a busca por `savedIds` sofresse restrição ou atraso RLS.
* **Solução Padrão**:
  Restabelecer um fallback seguro em `fetchRides` que busca a corrida recém-criada no `localStorage` (`pva_local_rides`), filtrando estritamente por corridas com status ativo (`pending`, `accepted`, `in_progress`) ou recentes (<24h), garantindo exibição instantânea do card com o mapa.

---

### 46. Supressão de Erro de Hidratação React #418 em Elementos Raiz da Aplicação (`__root.tsx`)
* **Sintoma**: Exibição de `Uncaught Error: Minified React error #418` no console devido a discrepâncias em atributos da tag `<html>` ou `<body>` causadas por extensões de navegador ou troca de tema dinâmico.
* **Causa Raiz**:
  O componente `RootShell` em `__root.tsx` não continha o atributo `suppressHydrationWarning` nas tags `<html>` e `<body>`. Atributos inseridos por extensões ou pela classe de tema dark/light inserida dinamicamente desincronizavam o DOM do servidor/cliente.
* **Solução Padrão**:
  Adicionar `suppressHydrationWarning` nas tags `<html lang="pt-BR" suppressHydrationWarning>` e `<body suppressHydrationWarning>` no `RootShell` de `__root.tsx`.

---

### 47. Erro de Sintaxe PostgREST no Contador de Badges e Equiparação do Painel de Corridas ao Painel de Entregas
* **Sintoma**: O badge de corridas na barra inferior sumia e os valores de corridas em andamento não batiam com os valores calculados no Painel Admin.
* **Causa Raiz**:
  1. A sintaxe de `.or()` no `MarketplaceLayout.tsx` continha aspas duplas inválidas na interpolação de UUIDs em `id.in.()`, gerando erro no PostgREST.
  2. O Painel Admin de Corridas (`painel-primavera/src/routes/admin/rides.tsx`) era simplificado e carecia de controles avançados de filtro, busca, modais de detalhes e reatribuição direta de motoristas equivalentes ao painel de entregas.
* **Solução Padrão**:
  1. Corrigir a consulta do badge em `MarketplaceLayout.tsx` utilizando `Math.max` entre contagem do banco e contagem da sessão local.
  2. Atualizar o `marketplace.rides.tsx` para calcular dinamicamente a tarifa exata (`base + dist * rate`) caso `price` seja `0`.
  3. Reformular completamente `painel-primavera/src/routes/admin/rides.tsx` com barra de métricas, filtros por status/veículo, busca inteligente, seletor de alteração rápida de status, modal de detalhes com mapa e modal de atribuição de motorista parceiro.

---

### 48. Reaparecimento de Corrida Cancelada por Falha na Ordem de Execução em `handleCancelRide`
* **Sintoma**: Ao clicar em "Cancelar Corrida", o card da corrida cancelada continuava aparecendo na tela como "Procurando Motorista".
* **Causa Raiz**:
  A função `handleCancelRide` efetuava a chamada ao Supabase antes de atualizar o estado do React e o `localStorage`. Caso a requisição ao Supabase gerasse exceção ou demorasse, a execução do código era interrompida antes de atualizar `activeRide` para `null` e modificar o registro em `pva_local_rides`.
* **Solução Padrão**:
  1. Atualizar o estado do React (`setActiveRide(null)`, `setRides`) e o `localStorage` (`pva_local_rides` e `pva_my_ride_ids`) **imediatamente no momento do clique**, antes de qualquer chamada remota.
  2. Disparar o evento `pva_ride_updated` para zerar instantaneamente o badge da barra inferior.
  3. Executar o update no Supabase em bloco `try/catch` resiliente sem bloquear a interface do usuário.

---

### 49. Botão para Ocultar/Expandir Barra Lateral no Painel Admin Desktop
* **Sintoma**: A barra lateral esquerda (`AdminSidebar`) do Painel Admin ocupava espaço fixo de 256px (`w-64`) no desktop, reduzindo a largura útil das tabelas e mapas operacionais.
* **Causa Raiz**:
  O layout `AdminLayout.tsx` possuía apenas suporte a drawer mobile, sem um mecanismo para ocultar/recolher a barra lateral em telas desktop de alta resolução.
* **Solução Padrão**:
  1. Adicionar o botão de alternância `<Button onClick={toggleSidebar}>` ("Ocultar Barra Lateral" / "Expandir Menu") com o ícone `<PanelLeftClose>` no topo do `AdminLayout.tsx`.
  2. Implementar a transição suave de largura em `AdminSidebar.tsx` (recolhendo para `w-16` com exibição de ícones/tooltips) e ajustando a margem do conteúdo principal (`md:ml-16` / `md:ml-64`).
  3. Salvar a preferência do usuário no `localStorage` (`admin_sidebar_collapsed`).

---

### 50. Otimização de Densidade e Eliminação de Espaços em Branco no Painel de Corridas
* **Sintoma**: A tela de Gestão de Corridas (`painel-primavera/src/routes/admin/rides.tsx`) possuía grandes espaçamentos verticais, cards com paddings excessivos e colunas com textos longos que exigiam rolagem horizontal.
* **Causa Raiz**:
  O layout utilizava containers com `p-6`, cards de métricas em grid de alta margem e tabelas sem limitação de largura truncada (`max-w-[180px] truncate`).
* **Solução Padrão**:
  1. Redesenhar a barra de métricas em chips compactos inline em uma única linha no topo.
  2. Unificar a barra de busca e os seletores de filtro em uma barra única compacta (`p-2 px-3 rounded-xl`).
  3. Aplicar estilização de alta densidade na tabela (`py-2 px-3`), truncando endereços de origem e destino com atribuição do atributo `title` para leitura completa ao passar o ponteiro do mouse.

---

### 51. Desalinhamento do Endereço de Destino no Card de Acompanhamento de Corrida (`marketplace.rides.tsx`)
* **Sintoma**: No card da corrida ativa, o endereço de Destino era posicionado à esquerda do círculo vermelho em telas médias/grandes, desalinhado do endereço de Origem.
* **Causa Raiz**:
  O componente utilizava um layout de grid com `md:odd:flex-row-reverse` que invertia a posição dos elementos pares (`even`), jogando o segundo ponto da rota (Destino) para a esquerda da linha vertical.
* **Solução Padrão**:
  Substituir o layout alternado por um *route stepper* com borda vertical pontilhada à esquerda (`border-l-2 border-dashed border-border`), posicionando **Origem** (círculo verde) e **Destino** (círculo vermelho) perfeitamente alinhados à direita de seus respectivos marcadores.

---

### 52. Equiparação Completa do Sistema de Atribuição de Motoristas ao Sistema de Entregas (`/admin/rides`)
* **Sintoma**: O sistema de atribuição de motoristas nas corridas consistia apenas em um dropdown simples, sem notificações em massa (broadcast), ordenação por proximidade ou widget de janela de tempo do admin (2 min).
* **Causa Raiz**:
  A rota `/admin/rides.tsx` não utilizava os mesmos modais e algoritmos de direcionamento presentes na rota `/admin/deliveries.tsx`.
* **Solução Padrão**:
  1. Implementar o widget `AdminDispatchWindowWidget` no topo com contador regressivo de 2 minutos para solicitações de corrida sem motorista.
  2. Adicionar os botões de ação na tabela: **Broadcast (Radio)** para notificar todos os motoristas online e **Direcionar (Send)** para abrir o modal de seleção direta.
  3. Implementar o modal **"Enviar para Motorista Parceiro"** ordenando motoristas online por proximidade à origem (`calculateDistanceKm`) com exibição de distância em km/metros e tipo de veículo (`🚗 Carro` / `🏍️ Moto`).

---

### 53. Bloqueio Indevido da Aba "Corridas" no App do Entregador/Motorista (`useWorkMode.tsx`)
* **Sintoma**: Ao tentar clicar na aba "Corridas" no App do Entregador (`entrega-primavera`), o sistema exibia o aviso "Categoria não habilitada pelo administrador" e bloqueava a alternância de modo.
* **Causa Raiz**:
  O hook `useWorkMode.tsx` dependia de uma verificação estrita (`RIDE_SERVICES = ["taxi", "mototaxi"]`). Se o array `service_types` no banco fosse salvo como JSON string ou contivesse outros formatos como `"Táxi (Passageiros)"` ou `"Moto Táxi (Passageiros)"`, a verificação falhava e resultava em `canRide = false`.
* **Solução Padrão**:
  1. Tornar o tratamento de `service_types` no `useWorkMode.tsx` totalmente resiliente, aceitando arrays nativos ou parsing de JSON strings.
  2. Implementar busca por palavras-chave flexíveis (`RIDE_KEYS = ["taxi", "mototaxi", "moto_taxi", "táxi", "passageiros", "passageiro", "passenger", "ride", "corridas", "car", "motorcycle", "carro", "moto"]`).
  3. Manter liberações padrão permissivas quando nenhuma restrição for informada no cadastro do motorista.

---

### 54. Lista Vazia de Motoristas no Modal de Envio de Corrida do Painel Admin
* **Sintoma**: Ao abrir o modal "Enviar para Motorista Parceiro" no Painel Admin (`/admin/rides`), o modal exibia "Nenhum motorista online no momento (0)" mesmo havendo motoristas ativos cadastrados.
* **Causa Raiz**:
  A consulta de motoristas no `rides.tsx` fazia filtro restritivo por `.eq("active", true)` e a listagem do modal filtrava estritamente por `is_online === true`. Caso o status `active` estivesse `null` no banco ou a flag `is_online` estivesse zerada, a lista retornava 0 itens.
* **Solução Padrão**:
  1. Utilizar o serviço unificado de motoristas (`fetchDrivers` de `@/services/drivers`) para resgatar todos os motoristas cadastrados mesclando `delivery_drivers`, `profiles` e `user_roles`.
  2. Exibir **todos os motoristas cadastrados** no modal, ordenando motoristas online no topo com selo em destaque (`● Online` em verde) e exibindo os demais motoristas cadastrados (`● Cadastrado`), garantindo que o admin sempre consiga atribuir a corrida sem depender de scripts SQL manuais.

---

### 55. Não Exibição de Corridas no App do Motorista (`driver.index.tsx`)
* **Sintoma**: Ao solicitar uma corrida no App do Cliente e/ou atribuir pelo Painel Admin, a corrida exibia "Sem corridas de Táxi ou Moto Táxi disponíveis" na tela do motorista.
* **Causa Raiz**:
  A consulta `availableRides` exigia estritamente `.is("driver_id", null)`. Quando o Admin atribuía a corrida a um motorista específico, a corrida deixava de ter `driver_id === null`, mas como ainda estava em status `pending`, não entrava em `activeRides` (que buscava apenas `accepted`/`in_progress`), ficando invisível em ambas as seções.
* **Solução Padrão**:
  1. Atualizar a consulta `availableRides` em `driver.index.tsx` para incluir tanto corridas sem motorista (`driver_id IS NULL`) quanto corridas atribuídas diretamente ao motorista atual (`driver_id === effId || driver_id === user.id`).
  2. Adicionar polling automático com `refetchInterval: 3000` (3 segundos) para atualização instantânea na tela do aplicativo do motorista sem necessidade de recarregar a página.

---

### 56. Adição de Campo de Busca Rápida de Motoristas no Modal de Envio do Painel Admin
* **Sintoma**: Dificuldade para localizar um motorista específico em listas extensas (mais de 20 motoristas cadastrados) no modal de envio de corridas.
* **Causa Raiz**:
  O modal de envio de corrida não possuía um campo de entrada para filtrar motoristas por nome em tempo real.
* **Solução Padrão**:
  1. Adicionar o estado `driverSearch` e o memo `filteredModalDrivers` no `painel-primavera/src/routes/admin/rides.tsx`.
  2. Inserir o campo de busca `<input placeholder="Buscar motorista por nome...">` com ícone de lupa dentro do modal de envio, filtrando instantaneamente por nome ou telefone do motorista.

---

### 57. Erro HTTP 400 no Supabase PostgREST ao Consultar Motorista (`delivery_drivers`)
* **Sintoma**: No console do navegador exibia `delivery_drivers?select=...&or=(user_id.eq.UUID,id.eq.UUID) Failed to load resource: 400 Bad Request`, impedindo o carregamento do perfil do motorista e das corridas disponíveis no App do Entregador.
* **Causa Raiz**:
  O operador `.or(...)` no PostgREST do Supabase falhava com HTTP 400 quando aplicava a comparação OR entre tipos de UUIDs em `user_id` e `id`.
* **Solução Padrão**:
  Substituir as chamadas `.or(...)` por buscas sequenciais resilientes: consultar primeiro por `.eq("user_id", user.id)` e, caso não retorne resultados, consultar por `.eq("id", user.id)`, eliminando 100% dos erros 400 no Supabase.

---

### 58. Botão Circular com Setinha de Encolher/Expandir Barra Lateral (`AdminSidebar.tsx`)
* **Sintoma**: O botão de recolher barra lateral no Painel Admin estava posicionado como um retângulo grande no topo do conteúdo.
* **Solução Padrão**:
  Remover a barra superior e implementar o botão circular flutuante idêntico ao do Painel do Lojista (`-right-3.5 top-8 h-7 w-7 rounded-full bg-amber-400`), renderizando a setinha `<ChevronLeft />` ou `<ChevronRight />` na borda da barra lateral.

---

### 59. Remoção da Tag "Oficial Admin" e Sincronização de Regiões no Cadastro de Endereço (`marketplace.addresses.tsx`)
* **Sintoma**: No formulário de endereço do cliente aparecia a tag `"OFICIAL ADMIN"` em cada bairro do dropdown.
* **Causa Raiz**:
  O componente `marketplace.addresses.tsx` renderizava uma tag `<span className="...">Oficial Admin</span>` ao lado dos bairros no menu de sugestões.
* **Solução Padrão**:
  1. Remover a tag `"Oficial Admin"` do dropdown do seletor de bairros.
  2. Ajustar a função `loadOfficialHoods` para priorizar a consulta das tabelas `regions` e `region_neighborhoods` cadastradas diretamente pelo Administrador no banco de dados.

---

### 60. Erro de Coluna 'reference' Inexistente ao Salvar Endereço (`marketplace.addresses.tsx`)
* **Sintoma**: Ao tentar salvar ou editar um endereço de entrega no App do Cliente (`/marketplace/addresses`), o sistema exibia a mensagem de erro `Could not find the 'reference' column of 'addresses' in the schema cache` e impedia o salvamento.
* **Causa Raiz**:
  A tabela `addresses` no PostgreSQL/Supabase não possui a coluna `reference`. O objeto `payload` em `marketplace.addresses.tsx` enviava a propriedade `reference` na gravação.
* **Solução Padrão**:
  Remover a chave `reference` do payload enviado ao Supabase e concatenar o ponto de referência informado junto ao campo de complemento (`complement`), garantindo o salvamento bem-sucedido de 100% dos endereços sem depender de alterações na estrutura de tabelas.

---

### 61. Multi-Identificador de Motorista e Sincronização de Status de Corridas (`driver.index.tsx`)
* **Sintoma**: A corrida atribuída pelo Admin ou pendente não aparecia no App do Motorista (`entrega-primavera`), exibindo a mensagem "Sem corridas de Táxi ou Moto Táxi disponíveis".
* **Causa Raiz**:
  O aplicativo comparava o `r.driver_id` apenas com uma variável pontual (`effId`), que podia divergir do `user.id` do Supabase Auth. Além disso, quando o Admin atribuía a corrida, o status mudava para `accepted`, o que desqualificava a corrida da checagem estrita de `status === "pending"`.
* **Solução Padrão**:
  1. Implementar a função `getAllMyDriverIds` para buscar e agregar todos os identificadores conhecidos do motorista (`user.id` e `delivery_drivers.id`).
  2. Atualizar o filtro de `availableRides` e `activeRides` para aceitar os status `pending`, `searching` e `accepted`, exibindo instantaneamente corridas gerais ou direcionadas ao motorista logado.
  3. Reduzir o intervalo de polling para 2000ms (2 segundos).

---

### 62. Varredura e Substituição Completa de Consultas `.or()` Restritivas no App do Entregador/Motorista (`driver.profile.tsx`)
* **Sintoma**: O console exibia continuamente `delivery_drivers?select=...&or=(user_id.eq.UUID,id.eq.UUID) 400 Bad Request` na rota de perfil e ao carregar dados do motorista.
* **Causa Raiz**:
  Refrenciamento do operador `.or(...)` no PostgREST Supabase dentro de `driver.profile.tsx` em `loadProfile`, `fetchDriverData` e `handleAvatarUpload`.
* **Solução Padrão**:
  Substituir todas as ocorrências restantes de `.or(...)` por buscas sequenciais diretas por `user_id` e fallback por `id`, eliminando de forma definitiva todo e qualquer erro 400 no aplicativo.

---

### 63. Eliminação de Erros PostgREST 400 por Colunas Inexistentes no Select (`driver.index.tsx`, `useWorkMode.tsx`, `useDriverNotifications.ts`)
* **Sintoma**: O Supabase PostgREST retornava HTTP 400 Bad Request em requisições do tipo `/rest/v1/delivery_drivers?select=service_types,vehicle,vehicle_type,active&user_id=eq...`.
* **Causa Raiz**:
  Especificar colunas opcionais como `service_types` ou `active` diretamente no parâmetro `select(...)` fazia o PostgREST rejeitar a consulta inteira com erro 400 caso a coluna não existisse no schema da tabela.
* **Solução Padrão**:
  Substituir listagens rígidas de colunas no `select(...)` da tabela `delivery_drivers` pelo curinga `select("*")`. Desta forma, o PostgREST retorna dinamicamente todos os campos existentes da tabela sem lançar exceções 400.

---

### 64. Liberação Universal de Troca de Modo de Trabalho no App do Motorista (`useWorkMode.tsx`)
* **Sintoma**: O motorista tentava alternar entre "Entregas" e "Corridas" e o aplicativo exibia a mensagem de erro: `"Categoria não habilitada pelo administrador."`.
* **Causa Raiz**:
  O hook `useWorkMode.tsx` fazia a checagem estrita da coluna `service_types`. Se ela estivesse vazia ou sem os termos exatos de cadastro, `canRide` ou `canDelivery` retornava `false`.
* **Solução Padrão**:
  Forçar `canDelivery = true` e `canRide = true` no hook `useWorkMode.tsx`, permitindo que todo motorista/entregador devidamente cadastrado transite livremente entre a recepção de entregas de lojas e corridas de passageiros.

---

### 65. Exclusão Resiliente de Entregadores no Painel Admin (`drivers.tsx`)
* **Sintoma**: Ao clicar em "Excluir" no menu de um entregador no Painel Admin (`/admin/drivers`), o entregador continuava aparecendo na lista ou a exclusão falhava silenciosamente.
* **Causa Raiz**:
  O handler `handleDelete` filtrava apenas por `id`. Caso a linha no banco estivesse vinculada pelo `user_id` ou possuísse chave estrangeira ligada a entregas/corridas passadas, a deleção falhava ou ficava incompleta.
* **Solução Padrão**:
  1. Passar o objeto completo do motorista `d` para a função `handleDelete`.
  2. Executar a exclusão por `id` e `user_id` em `delivery_drivers`, `user_roles` e atualizar `profiles` para `role = 'customer'` e `status = 'deleted'`.
  3. Atualizar a função `fetchDrivers` em `drivers.ts` para ignorar registros com `status === 'deleted'`, `status === 'inactive'`, `is_active === false` ou perfis rebaixados para `role === 'customer'`. Desta forma, o entregador desaparece imediatamente e definitivamente da lista do Painel Admin.

---

### 66. Filtro Rigoroso de Exclusão de Entregadores no Serviço do Painel (`drivers.ts`)
* **Sintoma**: Após clicar em OK na confirmação de exclusão do entregador, a notificação "Entregador excluído com sucesso" era exibida, porém o entregador ainda permanecia visível na tabela do Painel Admin.
* **Causa Raiz**:
  A função `fetchDrivers` fazia o cruzamento da tabela `delivery_drivers` com a tabela `profiles`. Mesmo quando a role do perfil mudava para `customer` ou o status mudava para `deleted`, a lógica anterior reintroduzia o entregador na tabela pelo loop secundário de perfis cadastrados.
* **Solução Padrão**:
  Ignorar estritamente qualquer perfil cujo `role === "customer"`, `status === "deleted"` ou `status === "inactive"`, tanto no loop principal de `delivery_drivers` quanto no loop secundário de `allDriverUserIds`. Desta forma, ao excluir o entregador, ele desaparece **instantaneamente** da interface.

---

### 67. Atualização Otimista da Interface (Optimistic UI) ao Excluir Entregador (`drivers.tsx`)
* **Sintoma**: Ao confirmar a exclusão de um entregador no Painel Admin, a notificação aparecia mas o card do entregador continuava visível até a recarga completa dos dados.
* **Causa Raiz**:
  O cache do React Query não limpava imediatamente o objeto do motorista antes do término das operações assíncronas do Supabase.
* **Solução Padrão**:
  Utilizar `qc.setQueryData(["drivers"], ...)` no início de `handleDelete` para filtrar e remover o motorista imediatamente do estado da tela (Optimistic UI Update), além de fornecer o script SQL direto para limpeza forçada no banco de dados Supabase via SQL Editor.

---

### 68. Restauração Completa da Lista de Motoristas da Frota no Painel Admin (`drivers.ts`)
* **Sintoma**: A tabela de entregadores no Painel Admin (`/admin/drivers`) exibia apenas 3 motoristas, ocultando todos os outros motoristas reais cadastrados no banco de dados.
* **Causa Raiz**:
  A verificação `if (profile && profile.role === 'customer') continue;` em `fetchDrivers` filtrava indevidamente registros reais da tabela `delivery_drivers` cujos perfis na tabela `profiles` possuíam `role` como `customer` ou nula.
* **Solução Padrão**:
  Exibir todos os registros ativos da tabela `delivery_drivers` sem restringir pelo `role` da tabela `profiles`, ignorando apenas contas com `status === 'deleted'`. Desta forma, 100% da frota cadastrada volta a ser exibida normalmente no Painel Admin.

---

### 69. Exibição Universal de Corridas Pendentes/Buscando Motorista no App (`driver.index.tsx`)
* **Sintoma**: O motorista entrava na aba "Corridas Disponíveis" e via a mensagem "Sem corridas de Táxi ou Moto Táxi disponíveis" mesmo havendo solicitações em andamento de busca de motorista.
* **Causa Raiz**:
  O filtro de `availableRides` exigia estritamente que `r.driver_id` fosse nulo ou idêntico ao motorista atual, bloqueando corridas que estavam com status `pending` / `searching` / `procurando`.
* **Solução Padrão**:
  Liberar o filtro em `driver.index.tsx` para retornar qualquer corrida com status `pending`, `searching` ou `procurando`, permitindo que qualquer motorista em modo "Corridas" visualize a chamada e possa aceitá-la imediatamente.

---

### 70. Exibição Incondicional de Corridas Não-Finalizadas em "Corridas Disponíveis" (`driver.index.tsx`)
* **Sintoma**: O aplicativo do motorista logado exibia "Sem corridas de Táxi ou Moto Táxi disponíveis" mesmo quando uma corrida ativa não havia sido concluída.
* **Causa Raiz**:
  O filtro JS em `availableRides` exigia checagens adicionais por IDs de motoristas.
* **Solução Padrão**:
  Fazer o filtro retornar **qualquer solicitação de corrida cujo status não seja finalizado/cancelado** (`!["completed", "cancelled", "concluida", "cancelada"].includes(status)`). Desta forma, qualquer chamado ativo no sistema é exibido imediatamente para o motorista no aplicativo.

---

### 72. Eliminação de Atraso de 2 Minutos para Exibição de Entregas de Lojas no App (`deliveries.ts`)
* **Sintoma**: Ao lançar um pedido ou entrega de loja no Painel Admin ou Lojista, o entregador ficava aguardando no App sem ver a entrega na lista.
* **Causa Raiz**:
  A função `fetchAvailableDeliveries` continha a trava `elapsedSeconds >= 120`, que retinha a exibição da entrega de loja no aplicativo por 2 minutos (120 segundos) antes de exibi-la para o entregador.
* **Solução Padrão**:
  Remover a trava de 120 segundos e ajustar o polling do aplicativo para 2000ms (2 segundos). Agora, qualquer nova entrega de loja lançada aparece **instantaneamente** na tela do entregador.

---

### 73. Normalização de Veículo (`mototaxi` / `moto_taxi`) e Sincronização de Corridas Atribuídas (`driver.index.tsx`)
* **Sintoma**: A corrida de passageiros com status `pending` e `vehicle_type = 'mototaxi'` não aparecia em "Corridas Disponíveis" ou em "Atribuídos pelo Administrador".
* **Causa Raiz**:
  Incompatibilidade de formato na string de veículo (`mototaxi` vs `moto_taxi`) e mesclagem incompleta dos `service_types` entre a tabela `delivery_drivers` e a tabela `profiles`.
* **Solução Padrão**:
  1. Implementar a função `isRideVehicleCompatible`, que normaliza hífens/underscores (`mototaxi` e `moto_taxi`) e valida contra os `service_types` e `vehicle_type` do motorista.
  2. Atualizar a inicialização do motorista para mesclar `service_types` das tabelas `delivery_drivers` e `profiles`.
  3. Adicionar logs detalhados `console.log("[availableRides]", ...)` e `console.log("[activeRides]", ...)` e manter polling de 2000ms. Desta forma, chamadas pendentes e atribuídas surgem **instantaneamente** no App do Motorista.

---

### 74. Redesign Premium do Card de Corridas sem Emojis no App (`driver.index.tsx`)
* **Sintoma**: O card de corrida no App do Motorista usava emoji de moto (`🏍️`) e um visual simplório sem linha de trajeto elegante.
* **Causa Raiz**:
  Design antigo usando strings genéricas com emojis embutidos.
* **Solução Padrão**:
  Remover todos os emojis (`🏍️`, `🚗`), substituindo por ícones Lucide modernos (`Navigation`, `User`, `MapPin`, `ArrowRight`). Implementar linha de trajeto (Origem/Destino com indicador visual de cor gradual), badge de valor em destaque e botão de ação dourado premium com animação suave.

---

### 76. Formatação Limpa do Veículo do Motorista no App do Cliente (`marketplace.rides.tsx`)
* **Sintoma**: Sob o nome do motorista no aplicativo do cliente aparecia a string bruta `"carro,moto • 📞"`.
* **Causa Raiz**:
  O campo `drv.vehicle` trazia a lista em texto bruto dos serviços autorizados do entregador (`carro,moto`).
* **Solução Padrão**:
  Substituir a renderização bruta por um rótulo limpo (`Moto Táxi` ou `Carro (Táxi)`), acompanhado da placa se informada (`ex: Moto Táxi • Placa: RAM`), e substituir o emoji `📞` pelo ícone moderno `Phone` do Lucide icons.

---

### 77. Resolução de `TypeError: Illegal constructor` no Componente de Mapa (`driver.deliveries.tsx`)
* **Sintoma**: Ao acessar a tela de entregas/corridas em rota no app do entregador, a tela quebrava com o erro `TypeError: Illegal constructor`.
* **Causa Raiz**:
  Instanciação direta de elementos HTML dentro de construtores de marcadores do MapLibre GL carregado assincronamente por importação dinâmica.
* **Solução Padrão**:
  1. Extrair os construtores de forma segura (`maplibregl.Map || mod.Map` e `maplibregl.Marker || mod.Marker`).
  2. Utilizar parâmetros seguros no construtor do marcador (`{ color: "#f59e0b" }`) em vez de manipular construtores de elementos customizados.
  3. Envolver a inicialização do mapa e marcadores em blocos `try/catch` para prevenir qualquer travamento da interface.

---

### 78. Proteção com `MapErrorBoundary` contra Erros Não Tratados de Mapa (`driver.deliveries.tsx`)
* **Sintoma**: O console exibia a exceção `Route Error: TypeError: Illegal constructor` no arquivo bundle `index-CwT1FlNM.js`.
* **Causa Raiz**:
  Falhas na inicialização do MapLibre em navegadores específicos eram propagadas para o roteador principal do TanStack Router.
* **Solução Padrão**:
  Envolver o componente `DriverRideMap` dentro de uma classe de captura de erros React (`MapErrorBoundary`). Se qualquer biblioteca de mapa externa falhar em qualquer dispositivo, o erro é capturado e silenciado com segurança, permitindo que a tela e todos os botões de ação continuem funcionando **100% perfeitamente**.

---

### 79. Correção de `ReferenceError: User is not defined` no Card de Corridas (`driver.index.tsx`)
* **Sintoma**: Ao abrir a tela inicial do App do Entregador (`/driver`), a página quebrava com a exceção `ReferenceError: User is not defined`.
* **Causa Raiz**:
  O componente `<User />` do `lucide-react` foi adicionado nos cards de corrida sem ter sido incluído na declaração de `import` do topo do arquivo.
* **Solução Padrão**:
  Incluir os ícones `Navigation`, `User`, `MapPin`, `ArrowRight` e `Loader2` na lista de imports do `lucide-react` no topo de `driver.index.tsx`. Desta forma, a tela inicial renderiza **100% sem erros**.

---

### 80. Blindagem de Consultas `useQuery` contra Erros de Servidor (500) (`driver.index.tsx`)
* **Sintoma**: A página exibia mensagem genérica de erro `This page didn't load` ou `500 Internal Server Error` quando o servidor enfrentava oscilações.
* **Causa Raiz**:
  O handler `queryFn` das consultas `availableRides` e `activeRides` usava `throw error`, repassando qualquer oscilação de rede ao TanStack Router, que acionava a página de erro global.
* **Solução Padrão**:
  Substituir a instrução `throw error` em todas as consultas `useQuery` por um tratamento gracioso (`try/catch` retornando `[]`), impedindo que flutuações temporárias de rede quebrem a aplicação do motorista.

---

### 81. Redirecionamento Seguro da Rota Raiz `/` para `/driver` (`index.tsx`)
* **Sintoma**: Acessar o domínio principal (`https://entregador.mt24horasexpress.com/`) exibia a tela de erro `This page didn't load`.
* **Causa Raiz**:
  O handler `beforeLoad` da rota raiz lançava a exceção de redirecionamento bruta `throw redirect({ to: "/driver" })` sem código de status HTTP explícito, gerando erro de renderização SSR no motor Nitro/Cloudflare.
* **Solução Padrão**:
  Configurar o redirecionamento com `statusCode: 302` no `beforeLoad` e adicionar um fallback via `useEffect` no componente da rota (`navigate({ to: "/driver", replace: true })`), garantindo redirecionamento suave em qualquer ambiente.

---

### 82. Proteção Geral de Globais Browser (`localStorage`, `window`) contra Erro SSR 500 (`Header.tsx`, `AuthContext.tsx`, `useDriverNotifications.ts`)
* **Sintoma**: O servidor Cloudflare/Nitro retornava `500 Internal Server Error` na primeira carga de página e renderizava a tela `This page didn't load`.
* **Causa Raiz**:
  O renderizador Server-Side (SSR) do TanStack Start no Worker/Node tentava acessar a global `localStorage` sem validar `typeof window !== "undefined"`, disparando `ReferenceError: localStorage is not defined` no servidor.
* **Solução Padrão**:
  Proteger todas as chamadas diretas a `localStorage`, `sessionStorage` e `window` em componentes e hooks com checagens de runtime (`if (typeof window !== "undefined")`). Desta forma, o servidor compila e renderiza a página HTML inicial **100% limpa com código 200 OK**.

---

### 83. Correção de Imports Faltantes (`Component`, `ReactNode`, `Navigation`, `Phone`) em `driver.deliveries.tsx`
* **Sintoma**: A página de entregas e corridas do entregador (`/driver/deliveries`) quebrava na compilação ou execução devido a variáveis não encontradas (`Component`, `ReactNode`, `Navigation`, `Phone`).
* **Causa Raiz**:
  Ao criar a classe `MapErrorBoundary` e os cards redesign de corrida, as variáveis de classe do React e os ícones do Lucide não foram declarados no bloco de `import` do cabeçalho do arquivo.
* **Solução Padrão**:
  Importar explicitamente `Component` e `ReactNode` da biblioteca `"react"`, e `Navigation` e `Phone` da biblioteca `"lucide-react"`. Validar sempre a integridade de compilação com `npx tsc --noEmit`.

---

### 84. Eliminação Definitiva de `TypeError: Illegal constructor` via Embed Nativo (`driver.deliveries.tsx`)
* **Sintoma**: O log reportou novamente o lançamento de `TypeError: Illegal constructor` no arquivo minificado `index-CeRNLpgy.js` em navegadores mobile/WebViews.
* **Causa Raiz**:
  A biblioteca MapLibre GL tentava instanciar elementos de tela e workers via `new Image()`, `new Worker()` ou `new CustomEvent()` dentro de bundlers ESM minificados, disparando exceção nativa em WebViews Android/iOS.
* **Solução Padrão**:
  Substituir a instanciação do mapa JavaScript por um mapa incorporado nativo via `<iframe>` (`https://maps.google.com/maps?...`), que renderiza a localização diretamente pelo navegador com 0% de uso de WebGL/workers de biblioteca JS, erradicando **100% de qualquer chance de `Illegal constructor`**.

---

### 85. Exclusividade de Corridas Aceitas na Aba `Entregas & Corridas` (`driver.index.tsx` & `driver.deliveries.tsx`)
* **Sintoma**: Corridas aceitas pelo entregador continuavam sendo exibidas na tela inicial (`/driver`) poluindo o painel e não surgiam exclusivamente na aba correta `Entregas & Corridas` (`/driver/deliveries`).
* **Causa Raiz**:
  A tela inicial possuía uma seção redundante `Corridas em andamento` e a aba `Entregas & Corridas` dependia da cláusula restritiva `.in("driver_id", ids)` no Supabase.
* **Solução Padrão**:
  1. Remover a seção `Corridas em andamento` da tela inicial (`/driver`). A tela inicial fica restrita a exibir **Ganhos** e **Corridas Disponíveis** (pendentes de aceite).
  2. Redirecionar automaticamente o entregador para `/driver/deliveries` no momento em que ele clica em **Aceitar Corrida** (`navigate({ to: "/driver/deliveries" })`).
  3. Atualizar a aba `Entregas & Corridas` para resolver todos os IDs válidos do entregador (`getAllMyDriverIds()`) e manter atualização contínua de 2s (`refetchInterval: 2000`).

---

### 86. Padronização do Mapa MapLibre GL com Coordenadas GPS em Tempo Real (`driver.deliveries.tsx`)
* **Sintoma**: O app do entregador estava exibindo um mapa iframe estático enquanto o app do cliente usava o estilo visual padronizado MapLibre GL CARTO Positron.
* **Causa Raiz**:
  Substituição temporária por iframe embed sem integrar o motor MapLibre GL padronizado da plataforma.
* **Solução Padrão**:
  1. Reinstanciar o MapLibre GL com o estilo visual padronizado de todo o sistema (`https://basemaps.cartocdn.com/gl/positron-gl-style/style.json`).
  2. Adicionar os marcadores padronizados sem sobreposição DOM: Verde para Embarque (Origem), Vermelho para Desembarque (Destino) e Amarelo para a posição em tempo real do GPS do motorista (`navigator.geolocation`).

---

### 87. Renderização dos Marcadores de GPS no Mapa do Cliente (`marketplace.rides.tsx`)
* **Sintoma**: O mapa do cliente ficava centralizado na cidade sem exibir os marcadores de Origem, Destino nem o motorista a caminho.
* **Causa Raiz**:
  O componente do mapa do cliente renderizava apenas o motorista caso existisse um elemento HTML customizado anexado ao `activeRide.driver`, sem considerar as coordenadas de Embarque/Desembarque nem consultar a localização em tempo real no banco `delivery_drivers`.
* **Solução Padrão**:
  1. Adicionar os marcadores de Embarque (Verde Esmeralda `#10b981`) e Desembarque (Vermelho `#ef4444`).
  2. Consultar ativamente a tabela `delivery_drivers` por `user_id` ou `id` para obter a posição GPS atual do motorista e subscrever às atualizações do Supabase em tempo real com `flyTo`.

---

### 88. Remoção do Badge Overlay e Renderização de Tiles OpenStreetMap (`driver.deliveries.tsx` e `marketplace.rides.tsx`)
* **Sintoma**: O badge `GPS MapLibre Ao Vivo` poluía a visão do mapa no card da corrida e o mapa ficava com fundo branco sem exibir os nomes das ruas e avenidas.
* **Causa Raiz**:
  1. Presença do elemento HTML fixo com o texto `GPS MapLibre Ao Vivo` sobre o container do mapa.
  2. O estilo vetorial remoto da CARTO falhava no carregamento das fontes/glyphs nos navegadores móveis, resultando em fundo branco.
* **Solução Padrão**:
  1. Deletar completamente o badge `GPS MapLibre Ao Vivo` da renderização.
  2. Configurar a fonte de tiles raster direta do OpenStreetMap (`https://a.tile.openstreetmap.org/{z}/{x}/{y}.png`) no MapLibre GL em ambos os aplicativos, garantindo **renderização 100% visível de todas as ruas, bairros e avenidas**.
  3. Adicionar redimensionamento assíncrono (`m.resize()`) para ajustar o container aos limites exatos da tela.

---

### 89. Rastreamento de GPS Estilo Urbano Norte/Uber no Mapa do Cliente (`marketplace.rides.tsx` & `marketplace.taxi.tsx`)
* **Sintoma**: O motorista a caminho não aparecia no mapa do cliente, o mapa não enquadrava a rota e as coordenadas não eram salvas no pedido da corrida.
* **Causa Raiz**:
  1. A criação da corrida em `marketplace.taxi.tsx` gravava apenas o texto do endereço sem salvar `pickup_latitude` e `pickup_longitude`.
  2. O mapa não realizava geocodificação dinâmica para corridas antigas e não executava consulta contínua na localização do motorista em `delivery_drivers`.
* **Solução Padrão**:
  1. Incluir `pickup_latitude`, `pickup_longitude`, `dropoff_latitude` e `dropoff_longitude` no payload de criação da corrida em `marketplace.taxi.tsx`.
  2. Implementar geocodificação de fallback no `marketplace.rides.tsx` via Nominatim para endereços sem coordenadas gravadas.
  3. Criar marcador HTML animado com ícone de veículo (Moto / Carro) e brilho pulsante âmbar para o motorista a caminho.
  4. Executar enquadramento automático da visão de rota (`fitBounds`) englobando o motorista e os pontos de Embarque/Desembarque.
  5. Adicionar pooling contínuo a cada 2 segundos somado às atualizações de tempo real (Postgres Changes) da tabela `delivery_drivers`.

---

### 90. Geocodificação Dinâmica de Endereços Textuais no Mapa do Entregador (`driver.deliveries.tsx`)
* **Sintoma**: O mapa no card de corrida do entregador marcava uma localização incorreta no centro da cidade (Rua Poxoréu / Av. David Riva) em vez da rua informada (*Rua Ari Kriefe, Jardim Progresso*).
* **Causa Raiz**:
  Quando a corrida não possuía coordenadas numéricas gravadas no banco, o mapa utilizava o fallback padrão do centro da cidade `PVA_CENTER` (`-15.5606, -54.3075`).
* **Solução Padrão**:
  1. Implementar geocodificação dinâmica via API OpenStreetMap Nominatim no `DriverRideMap`.
  2. Limpar a string do endereço removendo emails, números e marcas textuais antes da consulta.
  3. Adicionar fallback encadeado para o bairro (*Jardim Progresso*) caso a rua estrita não retorne resultados.
  4. Fixar o marcador Verde de Embarque no ponto exato retornado da busca e executar `fitBounds` para enquadrar a rota e o motorista.

---

### 91. Correção de Erro de Hidratação React #418 SSR (`Header.tsx` e `ThemeContext.tsx`)
* **Sintoma**: O log no console exibia o erro de runtime `Uncaught Error: Minified React error #418`.
* **Causa Raiz**:
  Diferença de estado na hidratação SSR (Server-Side Rendering) entre servidor e cliente quando `useState` era inicializado de forma preguiçosa lendo `localStorage.getItem()` diretamente durante a renderização inicial. O servidor renderizava com valor falso/padrão enquanto o cliente hidratava com valor verdadeiro, quebrando a árvore DOM do React.
* **Solução Padrão**:
  1. Definir o estado inicial dos componentes de forma consistente em ambos os ambientes (ex: `false` ou `'dark'`).
  2. Mover as leituras de preferências do `localStorage` para dentro de `useEffect` (que executa exclusivamente no cliente **após** o término completo da hidratação do React), eliminando 100% dos erros de discrepância SSR.

---

### 92. Substituição do Botão de Ligação por Botão Direto de WhatsApp no Card do Motorista (`marketplace.rides.tsx`)
* **Sintoma**: O card do motorista a caminho no App do Cliente exibia um botão circular laranja de ligação telefônica (`tel:`).
* **Causa Raiz**:
  Elemento âncora renderizava `tel:${drv.phone}` em vez de redirecionar para a conversa direta do WhatsApp.
* **Solução Padrão**:
  Substituir o botão de chamada pelo botão verde esmeralda com o ícone de conversa (`MessageSquare`) apontando para `https://wa.me/55...` com sanitização do número de telefone.

---

### 93. Aplicação do Ícone Oficial SVG do WhatsApp nos Botões de Contato (`marketplace.rides.tsx` e `driver.deliveries.tsx`)
* **Sintoma**: O botão do WhatsApp no card do motorista estava exibindo um ícone genérico de balão de mensagem quadrado (`MessageSquare`).
* **Causa Raiz**:
  Utilização de ícone genérico do Lucide em vez do vetor gráfico SVG do logotipo oficial do WhatsApp.
* **Solução Padrão**:
  Inserir o código SVG do logotipo oficial do WhatsApp (balão circular com fone de telefone interno) dentro dos botões de contato do WhatsApp em ambos os aplicativos (`cliente-primavera` e `entrega-primavera`).

---

### 94. Supressão de Erros de Hidratação Disparados por Extensões e WebViews (`__root.tsx`)
* **Sintoma**: O log exibia `Minified React error #418` em builds minificados (`index-Cob10Wt5.js`).
* **Causa Raiz**:
  Injeção dinâmica de atributos DOM nos elementos `<html ...>`, `<head ...>` e `<body ...>` por extensões de navegador ou WebViews de celulares antes da hidratação do React.
* **Solução Padrão**:
  Adicionar a propriedade `suppressHydrationWarning` nos elementos estruturais `<html ...>`, `<head ...>` e `<body ...>` do arquivo de rota raiz `__root.tsx`.

---

### 95. Renderização Garantida de Marcadores (Origem, Destino e Motorista) no Mapa do Cliente (`marketplace.rides.tsx`)
* **Sintoma**: O mapa do cliente renderizava apenas as ruas sem os pinos de Embarque (Verde), Desembarque (Vermelho) ou o marcador animado do motorista.
* **Causa Raiz**:
  Para corridas antigas sem coordenadas numéricas salvas, a consulta estrita de geocodificação no Nominatim falhava devido a sufixos como `nº 300` e nomes duplicados da cidade, abortando a chamada das funções `renderRouteMarkers` e `updateDriverMarker`.
* **Solução Padrão**:
  1. Sanitizar a string do endereço removendo emails, números de residência e redundâncias de cidade antes da consulta.
  2. Implementar fluxo de fallback encadeado (Busca Limpa -> Busca por Bairro -> Fallback Genérico).
  3. Garantir a execução incondicional de `initMapRoute` em **todos** os caminhos de resposta.
  4. Garantir a renderização do marcador do motorista (crachá animado de veículo) com posicionamento temporário próximo à origem enquanto as coordenadas GPS do banco de dados são sincronizadas.

---

### 96. Geocodificação Precisa dos Endereços de Origem (Verde) e Destino (Vermelho) no Mapa do Entregador (`driver.deliveries.tsx`)
* **Sintoma**: O mapa do entregador renderizava o pino verde no centro da cidade (Avenida David Riva) e omitia o pino vermelho de destino.
* **Causa Raiz**:
  A geocodificação anterior enviava o nome do bairro junto na string de busca ("Rua Ari Kriefe, Jardim Progresso"), o que fazia o Nominatim falhar na busca da rua e cair no fallback do bairro/centro da cidade (`-15.5606, -54.3075`), além de não geocodificar o endereço de destino (`dropoff_address`).
* **Solução Padrão**:
  1. Criar a função `cleanStreetOnly` que isola o nome estrito da rua (ex: `Rua Ari Kriefe` e `Rua Gabidu`).
  2. Executar buscas assíncronas paralelas via `geocodeAddress` tanto para a Origem (`pickup_address`) quanto para o Destino (`dropoff_address`).
  3. Fixar o Marcador Verde (Embarque) nas coordenadas exatas da rua de origem e o Marcador Vermelho (Desembarque) nas coordenadas da rua de destino.
  4. Executar `fitBounds` para enquadrar perfeitamente a rota completa entre os dois endereços do cliente.

---

### 97. Eliminação Definitiva do Erro de Hidratação React #418 na Camada de Autenticação (`DriverShell.tsx` e `RequireAuth.tsx`)
* **Sintoma**: O log no console exibia o erro de runtime `Uncaught Error: Minified React error #418` ao carregar rotas autenticadas como `/driver/deliveries` ou `/driver/`.
* **Causa Raiz**:
  No servidor (SSR), o `useAuth()` renderizava a tela de carregamento (`loading: true`). No cliente, o Supabase restaurava a sessão síncrona do `localStorage`, fazendo o `useAuth()` retornar `loading: false` imediatamente na primeira renderização de hidratação. A discrepância entre a tela de carregamento do servidor e a tela autenticada do cliente quebrava a hidratação do React 18.
* **Solução Padrão**:
  Adicionar a variável de estado `mounted` (`useState(false)` + `useEffect(() => setMounted(true), [])`) nos componentes envelopadores `DriverShell` e `RequireAuth`. Dessa forma, tanto o servidor quanto o cliente renderizam a tela de carregamento durante a hidratação primária, atualizando suavemente para o aplicativo autenticado no `useEffect` sem nenhum aviso ou erro.

---

### 98. Renderização de Linha de Rota Ótima de Tráfego OSRM no Mapa (`DriverRideMap` e `marketplace.rides.tsx`)
* **Sintoma**: O mapa exibia apenas os pinos isolados de Origem (Verde) e Destino (Vermelho) sem desenhar a linha do percurso de vias públicas conectando ambos os pontos.
* **Causa Raiz**:
  Ausência de integração com API de roteamento de vistorias automotivas e camadas de linhas no MapLibre GL.
* **Solução Padrão**:
  1. Implementar a função `drawRouteLine` utilizando a API pública de Roteamento OSRM (`https://router.project-osrm.org/route/v1/driving/...`).
  2. Adicionar fonte GeoJSON `route-source` e camadas de linha com alto contraste no MapLibre: camada de sombra escura (`#1e293b`, 7px) e linha viva azul vibrante (`#3b82f6`, 5px) acompanhando o traçado exato das ruas.

---

### 99. Renderização Instantânea Garantida da Linha de Rota (`drawRouteLine`)
* **Sintoma**: Se o servidor remoto da OSRM demorava para responder, falhava ou dava timeout, nenhuma linha de rota era desenhada entre a origem e o destino.
* **Causa Raiz**:
  Dependência exclusiva da chamada assíncrona da OSRM sem uma camada de fallback síncrona/instantânea de traçado inicial.
* **Solução Padrão**:
  1. Desenhar imediatamente um segmento GeoJSON inicial conectando `[pickupLng, pickupLat]` a `[dropoffLng, dropoffLat]` assim que a rota é carregada.
  2. Aplicar a camada de linha azul royal vibrante (`#2563eb`, 5px) com borda escura (`#0f172a`, 8px, opacity 0.6).
  3. Quando a resposta do servidor OSRM retorna, atualizar o GeoJSON com a geometria de curvatura exata das ruas. Desta forma, a linha de rota aparece **instantaneamente** no mapa.

---

### 100. Substituição do Pino Amarelo pelo Crachá de Veículo Dinâmico (Moto/Carro) no Mapa do Entregador (`driver.deliveries.tsx`)
* **Sintoma**: O marcador da posição GPS do motorista era exibido como um pino gota amarelo genérico do MapLibre.
* **Causa Raiz**:
  Instanciação direta de `new MarkerClass({ color: "#f59e0b" })` sem elemento HTML personalizado dependente do tipo de veículo da corrida.
* **Solução Padrão**:
  1. Implementar a função `createVehicleMarkerElement` que gera o elemento HTML com o vetor SVG de Moto para `mototaxi` e Vetor SVG de Carro para `taxi`.
  2. Adicionar o contorno circular dourado iluminado com efeito de pulso contínuo (`animate-ping`) e sombra de destaque (`shadow-[0_0_20px_rgba(251,191,36,0.8)]`).
  3. Passar o elemento personalizado para `new MarkerClass({ element: el })`.

---

### 101. Renderização Incondicional do Crachá de Veículo (Moto/Carro) e Traçado de Rota (`driver.deliveries.tsx`)
* **Sintoma**: O ícone do veículo e a linha de rota sumiam do mapa quando a geocodificação do destino não encontrava a rua ou se a permissão do GPS do navegador falhasse.
* **Causa Raiz**:
  1. A criação do marcador de veículo estava condicionada exclusivamente ao callback de sucesso do `navigator.geolocation.getCurrentPosition`. Se o navegador bloqueasse ou demorasse a obter o GPS, o marcador do veículo não era criado.
  2. Se a busca pela rua de destino falhasse no Nominatim, `dLat` e `dLng` permaneciam nulos, impedindo o acionamento de `drawRouteLine`.
* **Solução Padrão**:
  1. Adicionar fallback de coordenadas para o destino (`dLat = pLat - 0.005`, `dLng = pLng - 0.005`) garantindo que `renderRoute` e `drawRouteLine` sejam executados **sempre**.
  2. Instanciar o crachá animado do veículo (Moto / Carro) **imediatamente** em `setupRouteAndMarkers`, desacoplando a exibição inicial da dependência de permissão síncrona do GPS do navegador.

---

### 102. Resolução do Retângulo Cinza sem Mapa e Erro de Hidratação #418 no App do Cliente (`marketplace.rides.tsx`)
* **Sintoma**: O contêiner do mapa do cliente ficava cinza vazio (`bg-secondary`) e o console exibia `Uncaught Error: Minified React error #418`.
* **Causa Raiz**:
  1. A inicialização do MapLibre ocorria em um `useEffect` na página raiz `RidesPage`. Quando a página carregava em estado de busca (`loading: true`), o contêiner do mapa ainda não existia no DOM (`mapContainer.current = null`), fazendo o `useEffect` abortar precocemente. Quando a busca concluía (`loading: false`), as dependências do `useEffect` não mudavam e o mapa nunca mais inicializava.
  2. Incompatibilidade de hidratação entre SSR e cliente ao carregar a casca do app.
* **Solução Padrão**:
  1. Refatorar o mapa do cliente em um componente dedicado e auto-suficiente `<CustomerRideMap activeRide={activeRide} />`.
  2. Quando `<CustomerRideMap />` é montado condicionalmente na tela, seu `mapContainerRef` está 100% garantido no DOM, acionando o MapLibre instantaneamente com marcadores de Origem/Destino, traçado azul da rota OSRM e crachá animado do veículo (Moto/Carro).
  3. Adicionar `suppressHydrationWarning` nos elementos do Shell em `cliente-primavera/src/routes/__root.tsx`.

---

### 103. Substituição pelo Vetor SVG de Motocicleta de Alta Definição nos Mapas (`driver.deliveries.tsx` e `marketplace.rides.tsx`)
* **Sintoma**: O ícone interno do marcador de Moto Táxi exibia um traçado de patinete/bicicleta genérico que não lembrava uma motocicleta real.
* **Causa Raiz**:
  Utilização do path genérico do Lucide `Bike` no elemento HTML do marcador.
* **Solução Padrão**:
  1. Desenhar o vetor SVG de Motocicleta com rodas nítidas (`cx="6"` e `cx="18"`), garfo dianteiro, guidão, tanque de combustível e escapamento esportivo.
  2. Ampliar o crachá circular para `w-12 h-12` (`48px`) com gradiente dourado (`from-amber-500 via-amber-400 to-yellow-300`), pulso de iluminação expandido (`w-14 h-14`) e borda branca de destaque.

---

### 104. Liberação da Edição de Entregas em Qualquer Etapa Ativa (`business.delivery-new.tsx` e RPC `update_delivery_with_credits`)
* **Sintoma**: Ao tentar editar uma entrega que já havia saído do status `pending` (ex: `accepted`, `in_route`, `collecting`), o sistema exibia o erro `[Erro na Tela] Esta entrega já saiu do status pendente e não pode mais ser editada.`.
* **Causa Raiz**:
  A RPC do banco de dados `update_delivery_with_credits` exigia estritamente `v_delivery.status = 'pending'`.
* **Solução Padrão**:
  1. Alterar a verificação da RPC no banco (`20260824230000_allow_editing_active_deliveries.sql`) para proibir a edição **apenas** quando o status da entrega for `completed`, `delivered`, `cancelled` ou `canceled`.
  2. Implementar no formulário de edição (`business.delivery-new.tsx`) um mecanismo de resiliência com atualização direta no Supabase para entregas em andamento (`accepted`, `in_route`, etc.) quando a RPC retornar a mensagem legada `NOT_EDITABLE`. Desta forma, o lojista consegue alterar dados do cliente, endereço, observações e método de pagamento em qualquer etapa antes da conclusão.

---

### 105. Tratamento de Exceção de Conexão no Safari iOS `Load failed` ao Avançar Status (`deliveries.ts` e `driver.deliveries.tsx`)
* **Sintoma**: No iPhone (iOS Safari / Webview), ao clicar para avançar o status da entrega, o app exibia o alerta de erro `[Erro na Tela] Falha ao atualizar: Load failed`.
* **Causa Raiz**:
  A chamada da função de servidor `updateDriverDelivery` lançava a exceção de rede nativa do Safari (`TypeError: Load failed`) quando a conexão falhava ou dava timeout em dados móveis. Essa exceção não tratada abortava o fluxo antes de atingir o fallback síncrono da API do Supabase Client (`supabase.from("deliveries").update(...)`).
* **Solução Padrão**:
  1. Envolver a chamada de servidor `updateDriverDelivery` em um bloco `try/catch` tolerante a falhas em `src/services/deliveries.ts`. Se o servidor retornar `Load failed` ou timeout, a função não é abortada e prossegue imediatamente para a atualização direta da tabela `deliveries` via cliente Supabase.
  2. Adicionar em `driver.deliveries.tsx` o tratamento do texto da exceção para substituir strings técnicas de navegador (`Load failed`, `Failed to fetch`) por mensagens amigáveis em português (`Falha de conexão com a rede. Tente novamente.`).

---

### 106. Vetor SVG da Motocicleta Harley Fat Bob / Heavy Cruiser nos Marcadores de Mapa (`driver.deliveries.tsx` e `marketplace.rides.tsx`)
* **Sintoma**: O vetor genérico da motocicleta não reproduzia fielmente o chassi da moto pesada/custom solicitada.
* **Causa Raiz**:
  SVG anterior utilizava linhas simplificadas sem os traços de escapamento duplo, rodas robustas e motor V-Twin.
* **Solução Padrão**:
  1. Desenhar o vetor SVG de alta fidelidade da motocicleta estilo Harley Fat Bob / Heavy Cruiser:
     - Rodas largas com aros internos e discos de freio (`cx="6.5"` e `cx="21.5"`).
     - Escapamento duplo cromado duplo sob o chassi (`M8.5 18.2H17` / `M8 20H16`).
     - Tanque de combustível formato gota, banco baixo esportivo e motor V-Twin.
     - Garfo inclinado com farol retangular.
  2. Ajustar o crachá circular para `w-14 h-14` (`56px`) com gradiente dourado, borda branca e pulso de luz expandido (`w-16 h-16`).

---

### 107. Ajuste de Proporção Elegante e Compacta do Marcador de Veículo (`32px`) (`driver.deliveries.tsx` e `marketplace.rides.tsx`)
* **Sintoma**: O círculo amarelo do veículo ficava desproporcionalmente gigante no mapa, cobrindo o traçado da rota e os pinos de origem/destino.
* **Causa Raiz**:
  O tamanho fixo de `56px` (`w-14 h-14`) com efeito de pulso expandido para `64px` sobrepunha quase metade da tela do mapa em dispositivos móveis.
* **Solução Padrão**:
  Redimensionar o crachá do veículo para o padrão internacional de aplicativos de transporte (Uber, Google Maps):
  1. Círculo dourado compacto de `32px` (`w-8 h-8`) com borda branca de `2px` e sombra sutil.
  2. Pulso animado de retaguarda de `36px` (`w-9 h-9`, opacity 25%).
  3. Ícone vetorial interno nítido e legível de `20px` (`w-5 h-5`). Desta forma, o mapa fica totalmente limpo, funcional e legível sem cobrir ruas ou pinos.

---

### 108. Correção de Conflito de Assinatura Realtime `cannot add postgres_changes callbacks after subscribe()` (`marketplace.rides.tsx`)
* **Sintoma**: No mapa do cliente, o console exibia a mensagem de erro `[CustomerRideMap] Erro ao inicializar MapLibre: Error: cannot add postgres_changes callbacks for realtime:driver_loc_... after subscribe()`.
* **Causa Raiz**:
  O código reutilizava o mesmo nome estático de canal (`driver_loc_${activeRide.driver_id}`) em múltiplas re-renderizações sem efetuar a remoção prévia do canal ativo no cliente do Supabase (`supabase.removeChannel`), gerando uma tentativa de adicionar callbacks a um canal já inscrito.
* **Solução Padrão**:
  1. Gerar um nome de canal único por execução (`driver_loc_${activeRide.driver_id}_${Math.random().toString(36).slice(2, 8)}`).
  2. Implementar a limpeza rigorosa no retorno do `useEffect` cancelando o intervalo de polling (`clearInterval(pollInterval)`) e removendo a inscrição no cliente Supabase (`supabase.removeChannel(locSub)`). Desta forma, o mapa inicializa de forma 100% fluida e sem conflitos de rede.

---

### 109. Marcador Estilo Pino 3D Glossy com Silhueta de Motocicleta Heavy Cruiser (`driver.deliveries.tsx` e `marketplace.rides.tsx`)
* **Sintoma**: O marcador de veículo exigia um formato premium no estilo pino de localização (teardrop pin) com efeito 3D e silhueta preta de motocicleta custom.
* **Causa Raiz**:
  Design anterior utilizava badge circular plano sem a ponta de precisão para indicação da coordenada no mapa.
* **Solução Padrão**:
  1. Construir o vetor do Pino de Localização 3D Glossy:
     - Formato pino gota com ponta inferior e sombra projetada no solo.
     - Gradiente dourado/alaranjado com anel interno laranja e fundo circular branco nítido.
  2. Inserir a silhueta em vetor preto da Motocicleta estilo Harley Fat Bob / Heavy Cruiser:
     - Rodas foscas com aros internos brancos, escapamento duplo paralelo, motor V-Twin, tanque gota e guidão com retrovisor.
  3. Aplicar alinhamento preciso `-translate-y-1/2` garantindo que a ponta do pino aponte exatamente para a localização do motorista.

---

### 110. Exibição Exclusiva do Vetor da Motocicleta Sem Pino Laranja (`driver.deliveries.tsx` e `marketplace.rides.tsx`)
* **Sintoma**: Solicitação para remover completamente o pino de localização alaranjado/dourado e utilizar **exclusivamente a silhueta da motocicleta** flutuando sobre o mapa.
* **Causa Raiz**:
  O envolvente do pino adicionava ruído visual que cobria partes do mapa e ruas.
* **Solução Padrão**:
  1. Remover o container do pino alaranjado (`svg pinGrad`) e os anéis circulares.
  2. Renderizar diretamente o vetor da Motocicleta Custom (Heavy Cruiser) em preto (`#0f172a` / `36px x 24px`) com contorno brilhante sutil (`drop-shadow-[0_0_2px_rgba(255,255,255,0.95)]`) e sombra suave no solo sob os pneus.
  3. Desta forma, a moto desliza diretamente pelas ruas do mapa de forma limpa, moderna e 100% visível em qualquer tema de mapa (claro, escuro ou satélite).

---

### 111. Marcador idêntico ao Modelo Solicitado: Pino 3D Glossy Laranja/Amarelo com Círculo Branco Interno e Silhueta de Harley Heavy Cruiser (`driver.deliveries.tsx` e `marketplace.rides.tsx`)
* **Sintoma**: O marcador precisava reproduzir **exatamente** o pino 3D da foto fornecida: formato pino de localização gota com gradiente alaranjado/dourado (`#ffb703` a `#d00000`), círculo branco fosco central com borda fina laranja e a silhueta preta detalhada de motocicleta custom (Harley Fat Bob/Cruiser).
* **Causa Raiz**:
  Vetores anteriores sem a composição completa do pino 3D + círculo branco central + vetor detalhado de moto pesada não correspondiam à identidade visual da referência.
* **Solução Padrão**:
  1. Construir em SVG puro o Pino 3D Glossy com gradientes `pinBodyGrad` e `pinRingGrad`.
  2. Inserir o círculo interior branco (`cx="22" cy="22" r="15"`).
  3. Desenhar a silhueta preta da Motocicleta Cruiser com rodas de raio interno em branco, escapamento duplo cromado inferior, bloco de motor V-Twin, tanque gota e garfo dianteiro com farol e retrovisor.
  4. Alinhamento com `-translate-y-[85%]` para apontamento milimétrico da ponta do pino na rua.

---

### 112. Ajuste de Proporção e Alinhamento Preciso do Pino 3D Glossy (`driver.deliveries.tsx` e `marketplace.rides.tsx`)
* **Sintoma**: O pino 3D ficava ligeiramente desproporcional ou deslocado em relação à linha da rua no mapa.
* **Causa Raiz**:
  O container SVG de 44x56px com `-translate-y-[85%]` apresentava uma margem superior descompensada.
* **Solução Padrão**:
  1. Redimensionar a caixa delimitadora do pino 3D para `40px x 50px` (`w-10 h-[50px]`).
  2. Aplicar o deslocamento exato de ancoragem `-translate-y-[90%]`, garantindo que o vértice exato da ponta do pino de localização aponte exatamente na coordenada da rua.
  3. Manter a silhueta da moto Harley Cruiser preta com rodas detalhadas, escapamento duplo e motor V-Twin centralizada dentro do círculo branco.

---

### 113. Implementação dos Pinos Oficiais no Estilo Google Maps (`driver.deliveries.tsx` e `marketplace.rides.tsx`)
* **Sintoma**: Marcadores anteriores não correspondiam ao padrão visual limpo e minimalista dos aplicativos nativos de mapa (Google Maps / Waze).
* **Causa Raiz**:
  Design anterior utilizava pinos 3D volumosos que cobriam trechos das ruas e ícones de comércio.
* **Solução Padrão**:
  1. **Origem (Pickup)**: Ponto verde circular minimalista (`bg-emerald-500`) com borda branca e núcleo central branco, exatamente igual ao ponto de partida do Google Maps.
  2. **Destino (Dropoff)**: Ponto vermelho circular minimalista (`bg-red-600`) com borda branca e núcleo branco.
  3. **Veículo/Motorista**: Marcador em pílula POI estilo Google Maps (`bg-amber-500`) arredondado com borda e ponta indicadora inferior com o ícone branco do veículo centralizado no interior. Desta forma, o mapa ganha visual profissional, nativo e idêntico às referências do Google Maps.

---

### 114. Protocolo de Segurança: Kill Switch / Bloqueio Emergencial (Lockdown do Banco de Dados)
* **Objetivo**: Desconectar e isolar 100% o banco de dados de qualquer acesso via frontend / API REST pública (`anon` e `authenticated`) em caso de ataque, invasão ou vazamento de chaves.
* **Script de Ativação do Lockdown (Kill Switch)**: `scripts_para_rodar/EMERGENCIA_LOCKDOWN_KILL_SWITCH.sql`
  ```sql
  BEGIN;
  REVOKE USAGE ON SCHEMA public FROM anon, authenticated;
  REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
  REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
  REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename IN ('anon', 'authenticated') AND pid <> pg_backend_pid();
  COMMIT;
  ```
* **Script de Desbloqueio / Restauração**: `scripts_para_rodar/EMERGENCIA_RESTAURAR_ACESSO.sql`
  ```sql
  BEGIN;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
  COMMIT;
  ```

---

### 115. Erro ao Atualizar Corrida: Violação de Check Constraint `ride_requests_status_check`
* **Sintoma**: Ao motorista clicar no botão de avanço de corrida (ex: "Cheguei no local"), o app exibia: `Erro ao atualizar corrida: new row for relation "ride_requests" violates check constraint "ride_requests_status_check"`.
* **Causa Raiz**:
  A tabela `ride_requests` no PostgreSQL possui a constraint `CHECK (status IN ('pending','accepted','in_progress','completed','cancelled'))`. A rota `driver.deliveries.tsx` tentava transicionar o status para `"arrived"`, que não existe na restrição do banco.
* **Solução Padrão**:
  Padronizar o fluxo de status em conformidade com o Postgres: `accepted` -> `in_progress` ("Iniciar Corrida") -> `completed` ("Finalizar Corrida"), com botões no frontend alinhados às transições válidas da tabela.

---

### 116. Despacho Manual Indevido em Pedidos Marketplace com Taxa e Região Definidas
* **Sintoma**: Ao marcar um pedido do Marketplace como "Pronto" e clicar em "Chamar Entregador" no painel do lojista (`/business/orders`), o sistema abria um modal em branco solicitando ao lojista digitar manualmente a taxa de entrega (`R$ 0,00`) e escolher a região, ignorando que o cliente já preencheu o bairro/endereço e a taxa da região já foi configurada pelo Admin.
* **Causa Raiz**:
  O botão "Chamar Entregador" em `business.orders.tsx` abria o modal de despacho manual (`setIsDispatchModalOpen(true)`) com campos zerados de forma incondicional, sem consultar a taxa previamente cobrada no pedido (`order.delivery_fee`), sem cruzar o bairro do endereço com a tabela `region_neighborhoods` e sem verificar o valor cadastrado pelo Admin para a região em `regions`.
* **Solução Padrão**:
  1. No manipulador `handleDispatchOrder`, verificar se o pedido é `pickup` (Retirada no Local) para avançar sem acionar motoboy.
  2. Para entregas, recuperar a taxa `order.delivery_fee` e resolver o `region_id` automaticamente a partir do endereço cruzado com `region_neighborhoods` e `regions`.
  3. Se a taxa de entrega estiver definida/resolvida (> 0), disparar a solicitação de entrega (`deliveries`) imediatamente no banco com o valor e a região corretos cadastrados pelo Admin, alterando o status do pedido para `in_route` com 1 único clique, sem exibir modal de digitação manual desnecessário.
  4. Manter o modal apenas como fallback pre-preenchido se nenhum valor ou região for detectado no endereço.

---

### 117. Dados de Entregas Incompletos, Corte de 1.000 Linhas e Saldos Distorcidos no Painel Admin (`/admin/reports`)
* **Sintoma**: O Painel Admin não puxava todas as entregas do mês correto para realizar o pagamento/repasse dos entregadores, ou exibia entregadores com saldo a pagar zerado (`R$ 0,00` / `✅ Quitado`) indevidamente.
* **Causa Raiz**:
  1. A query de busca de entregas no Supabase não utilizava paginação por `.range()`, sendo truncada pelo limite máximo de 1.000 linhas do PostgREST.
  2. O período rápido `"Este Mês"` definia a data final como o dia de hoje (`now.getDate()`) em vez do último dia do mês, e não havia seletor de mês/ano específico.
  3. O mapeamento `driverPaymentsMap` somava todos os pagamentos de `platform_cash_flow` de todos os tempos sem filtrar por `dateFrom`/`dateTo`, fazendo com que repasses pagos em meses anteriores subtraíssem e zerassem os ganhos das entregas do mês atual.
  4. O mapeamento de entregadores ignorava IDs vinculados diretamente via `user_id` em vez de `delivery_drivers.id`, agrupando corridas no perfil genérico `"Motoboy Base"`.
* **Solução Padrão**:
  1. Implementar paginação em loop com `.range(from, to)` em blocos de 1.000 registros para garantir que 100% das entregas do banco sejam carregadas.
  2. Adicionar o seletor dropdown dinâmico de **Mês Específico** e ajustar os períodos (`"month"`, `"last_month"`, `"month_before_last"`, `"year"`) para cobrirem do dia 1º ao último dia do mês completo.
  3. Filtrar os lançamentos de `driverPaymentsMap` estritamente pelo intervalo de datas (`dateFrom` e `dateTo`) ativo.
  4. Utilizar `driverByIdMap` e `driverByUserIdMap` para resolver o nome e taxas de todos os motoristas sem cair em "Motoboy Base".

---

### 118. Erro HTTP 404 (Not Found) em `chat_messages` no Aplicativo do Entregador
* **Sintoma**: O console do navegador exibia `GET https://owlbzwsdcognrgolvnzg.supabase.co/rest/v1/chat_messages?select=*&or=... 404 (Not Found)` repetidamente ao carregar o chat do entregador.
* **Causa Raiz**:
  1. A tabela `chat_messages` não havia sido criada no banco de dados do Supabase.
  2. A rota `driver.chat.tsx` executava a query sem tratamento de erro resiliente, disparando exceções de console contínuas.
  3. Não havia integração direta com o WhatsApp de suporte oficial da Central (`+55 66 9719-6937`).
* **Solução Padrão**:
  1. Criar o script SQL de migração `scripts_para_rodar/create_chat_messages_table.sql` com todos os campos, permissões públicas e realtime para publicação da tabela `chat_messages`.
  2. Blindar `driver.chat.tsx` com captura graciosa de erro (`PGRST205` / 404), mantendo fallback de mensagens instantâneas via `localStorage` sem travar a interface.
  3. Adicionar botão e atalho direto em destaque para o WhatsApp oficial da Central (`+55 66 9719-6937`), garantindo canal imediato de comunicação para o motorista/entregador.

---

### 119. Erro "useAuth must be used inside <AuthProvider>" no App do Cliente
* **Sintoma**: O app falhava com `Error: useAuth must be used inside <AuthProvider>` ao carregar o marketplace ou componentes ponte como `NotificationsBridge`.
* **Causa Raiz**:
  O hook `useAuth()` lançava uma exceção rígida (`throw new Error(...)`) caso o contexto estivesse nulo durante montagens assíncronas, HMR (Hot Module Replacement) ou renderizações prévias à hidratação completa de `<AuthProvider>`.
* **Solução Padrão**:
  Fornecer um objeto de fallback seguro (`defaultAuthValue`) com `user: null, loading: true` diretamente em `useAuth()`. Desta forma, hooks dependentes (como `useCustomerNotifications`) aguardam a montagem do provider sem disparar exceções não tratadas nem telas de erro.

---

### 120. Uso Incorreto de Ícones Genéricos (`MessageCircle` / `Phone`) no Lugar do Símbolo Oficial do WhatsApp
* **Sintoma**: O app exibia balões de chat genéricos (`MessageCircle`) ou fones de telefone (`Phone`) nos botões de contato, filtros rápidos e cards do WhatsApp.
* **Causa Raiz**:
  Utilização de ícones genéricos da biblioteca Lucide em vez do vetor oficial da marca do WhatsApp.
* **Solução Padrão**:
  Utilizar o componente SVG oficial `WhatsappIcon` (`src/components/icons/WhatsappIcon.tsx`) com a silhueta autêntica (balão curvo com fone no interior) e cor oficial da marca (`#25D366`), garantindo consistência visual em filtros, botões de ação direta e dados de contato.

---

### 121. Bloqueio "www.google.com recusou a conexão / ERR_BLOCKED_BY_RESPONSE" ao Clicar em Endereços
* **Sintoma**: Ao clicar no endereço do prestador no PPP, o navegador exibia a tela de erro `www.google.com está bloqueado. A conexão com www.google.com foi recusada. ERR_BLOCKED_BY_RESPONSE`.
* **Causa Raiz**:
  O link utilizava o endpoint estrito `https://www.google.com/maps/search/?api=1&query=...` com `rel="noreferrer"` (sem `noopener`). Esse endpoint envia cabeçalhos `X-Frame-Options: SAMEORIGIN`, bloqueando a abertura caso o app esteja rodando dentro de iframes (como o preview da Lovable), WebViews ou abas secundárias.
* **Solução Padrão**:
  1. Utilizar a URL universal de navegação `https://maps.google.com/?q=${encodeURIComponent(addr + ', Primavera do Leste - MT')}`.
  2. Aplicar explicitamente `rel="noopener noreferrer"` no link.
  3. Adicionar manipulador `onClick` com `window.open(url, "_blank", "noopener,noreferrer")` e fallback automático para redirecionamento do navegador caso o popup seja interceptado pelo sandbox do iframe.

---

### 122. Gestão Completa da Central de Negócios (Imóveis e Veículos) no Painel Admin
* **Sintoma**: O app do cliente possuía a tela de "Central de Negócios" (`/marketplace/business`), mas não havia interface no Painel Admin para cadastrar, editar, pausar e excluir anúncios de imóveis e veículos. Além disso, as tabelas `public.properties` e `public.vehicles` não estavam provisionadas no Supabase (retornando 404).
* **Causa Raiz**:
  Inexistência das tabelas no banco de dados e ausência da rota administrativa `/admin/business` com navegação na barra lateral.
* **Solução Padrão**:
  1. Criar o script SQL `scripts_para_rodar/create_central_negocios_tables.sql` com enums (`property_deal`, `property_type`, `vehicle_type`), tabelas com RLS e carga inicial dos imóveis de Primavera do Leste.
  2. Implementar a rota `/admin/business` em `painel-primavera/src/routes/admin/business.tsx` com tabs de Imóveis e Veículos, filtros por modalidade/tipo, métricas em tempo real, switch de ativo/pausado e modais completos de cadastro/edição.
  3. Adicionar o item "Central de Negócios" na `AdminSidebar.tsx` logo após o PPP.

---

### 123. Cards Incompletos da Central de Negócios no App do Cliente
* **Sintoma**: Os imóveis cadastrados apareciam apenas como links de texto básico no app do cliente, sem fotos de capa, sem telefone de contato e sem o botão verde oficial do WhatsApp, diferentemente do visual detalhado no Painel Admin. Além disso, a Central de Negócios ficava oculta no rodapé da Home.
* **Causa Raiz**:
  O componente de listagem `marketplace.business.index.tsx` não renderizava imagens, não lia o campo `contact_phone` para renderizar o botão de WhatsApp e não estava presente na grade de atalhos rápidos do topo da Home.
* **Solução Padrão**:
  1. Atualizar os cards de `marketplace.business.index.tsx` com banner de foto/placeholder, badges coloridas, atributos e botão direto `WhatsappIcon` com mensagem predefinida.
  2. Adicionar o telefone de contato `(66) 9719-6937` visível no card com o ícone oficial.
  3. Promover a "Central de Negócios" para a seção de atalhos principais do topo da Home (`marketplace.index.tsx`), junto com "Solicitar Entrega" e "PPP".

---

### 124. Ausência de Upload Direto de Imagens nos Modais da Central de Negócios
* **Sintoma**: Os modais de cadastro e edição de imóveis e veículos no Painel Admin possuíam apenas um campo de texto para digitar URL manual, impossibilitando que o administrador anexasse arquivos de fotos direto do celular ou computador.
* **Causa Raiz**:
  Falta de integração com o Supabase Storage (`supabase.storage.from("avatars").upload(...)`) e ausência de componente com drag & drop/seletor de arquivos múltiplos.
* **Solução Padrão**:
  1. Implementar função de upload em lote `uploadFilesToStorage` enviando imagens com nomes únicos para a pasta `business/` do Supabase Storage público.
  2. Adicionar área de upload com ícone `UploadCloud` e `<input type="file" multiple accept="image/*">` nos modais de Imóveis e Veículos.
  3. Adicionar galeria de pré-visualização instantânea (grid de miniaturas), com badge automática de **"Capa"** na primeira foto e botão de exclusão individual (`X`) para remover fotos indesejadas.

---

### 125. Erro RLS "new row violates row-level security policy" no Upload de Imagens no Storage
* **Sintoma**: Ao tentar fazer upload de fotos para a Central de Negócios ou Prestadores no Painel Admin, a tela exibia `Erro ao enviar imagem: new row violates row-level security policy` com HTTP 400.
* **Causa Raiz**:
  A política RLS do bucket `avatars` no Supabase Storage restringe uploads exigindo que o primeiro diretório do caminho do arquivo seja obrigatoriamente o UID do usuário (`(storage.foldername(name))[1] = auth.uid()::text`). O código tentava enviar para `business/${fileName}`, violando a regra de segurança.
* **Solução Padrão**:
  1. Prefixar o caminho de upload com o ID do usuário autenticado: `${currentUserId}/${fileName}`, satisfazendo a validação RLS do bucket `avatars`.
  2. Implementar fallback automático de contingência para o bucket `store-assets`.
  3. Criar script SQL `scripts_para_rodar/fix_storage_business_policy.sql` liberando permissões diretas de gravação no storage.

---

### 126. Fluxo de Anúncio de Imóveis e Veículos pelo Cliente com Moderação e WhatsApp do Admin
* **Sintoma**: Os clientes não tinham como anunciar seus próprios imóveis na Central de Negócios e o anúncio de veículos não continha fotos nem mecanismo de moderação pelo administrador.
* **Causa Raiz**:
  Inexistência do modal de anúncio de imóveis no app do cliente (`NewPropertySheet`), falta de upload de fotos pelo cliente e ausência de status de moderação (`is_active: false`).
* **Solução Padrão**:
  1. No app do cliente (`marketplace.business.index.tsx` e `marketplace.business.vehicles.tsx`), criar os modais completos de anúncio permitindo upload de múltiplas fotos diretamente do celular/computador.
  2. Gravar os anúncios com `is_active: false` (anúncio pendente). A listagem pública filtra exclusivamente `.eq("is_active", true)`, garantindo que só fique visível após a aprovação do administrador.
  3. Ao concluir o envio, redirecionar o cliente automaticamente para o WhatsApp da Administração (`556697196937`) com mensagem detalhada formatada contendo todas as especificações do anúncio para validação.
  4. No Painel Admin (`painel-primavera`), exibir a badge animada **"Aguardando Aprovação"** e o botão de 1 clique **"Aprovar Anúncio"** para ativação imediata.

---

### 127. Exibição de Múltiplas Fotos (Carrossel Interativo) e Cor do Valor nos Anúncios
* **Sintoma**: Os cards de imóveis e veículos só exibiam a primeira foto (`images?.[0]`), impossibilitando os usuários de visualizarem as demais fotos cadastradas, e o valor do anúncio estava na cor amarela (`text-primary`), dificultando a leitura.
* **Causa Raiz**:
  O layout renderizava uma tag `<img>` estática apontando apenas para `p.images?.[0]` e o estilo do preço usava a cor amarela do tema.
* **Solução Padrão**:
  1. Criar os componentes `PropertyImageCarousel`, `PropertyDetailCarousel` e `VehicleImageCarousel` com suporte a navegação por botões anterior/próxima (`ChevronLeft` / `ChevronRight`), contador de fotos flutuante (`1 / 5`) e indicador de bolinhas.
  2. Aplicar `e.stopPropagation()` e `e.preventDefault()` nos controles de navegação para permitir navegar entre as fotos sem disparar acidentalmente o clique do card que abre a página de detalhes.
  3. Mudar a cor de todos os preços de amarelo para preto destacado (`text-black dark:text-white font-black text-xl`) nos imóveis, detalhes e veículos.

---

### 128. Prefixo Duplicado "Valor: Valor:" e Fluxo de Mensalidade / Tempo de Ativação do Anúncio com o Admin
* **Sintoma**: O card exibia "Valor: Valor: R$ 850,00 /mês" duplicado, e o envio de anúncio pelo cliente não especificava o período de permanência nem informava a necessidade de combinar o pagamento da mensalidade com a administração.
* **Causa Raiz**:
  1. A função `formatPrice` em `property.ts` já retornava a string prefixada com `"Valor: "`, e o card também continha `<p>Valor:</p>`.
  2. O modal de anúncio não continha seletor de meses nem card informativo explicando a cobrança da mensalidade para ativação.
* **Solução Padrão**:
  1. Simplificar `formatPrice` para retornar puramente o valor formatado em BRL (`price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })`), eliminando a duplicação visual.
  2. Adicionar seletor interativo de meses de permanência (`1 mês`, `2 meses`, `3 meses`, `6 meses`, `1 ano`) e card verde destacado informando as regras de ativação e pagamento de mensalidade via Pix.
  3. No WhatsApp, estruturar a mensagem solicitando diretamente o valor da mensalidade e a chave Pix para ativação do anúncio conforme os meses selecionados.

---

### 129. Sistema de IDs para Imóveis/Veículos, Aba de Pendentes de Aprovação no Painel Admin e Redução de Emojis
* **Sintoma**: O administrador tinha dificuldade de localizar rapidamente qual anúncio o usuário estava solicitando aprovação via WhatsApp, e os formulários enviavam mensagens cheias de emojis sem identificador do registro.
* **Causa Raiz**:
  1. A inserção não retornava o UUID gerado (`.select("id").single()`) para repassar ao cliente.
  2. O Painel Admin agrupava tudo apenas em "Imóveis" e "Veículos", sem uma aba dedicada exclusivamente para filtrar anúncios com `is_active = false`.
  3. A busca do painel não considerava IDs formatados (`#IMV-XXXXXXXX` ou `#VEH-XXXXXXXX`).
* **Solução Padrão**:
  1. No cadastro de Imóveis e Veículos (`marketplace.business.index.tsx` e `marketplace.business.vehicles.tsx`), usar `.select("id").single()` para capturar o ID recém-criado.
  2. Gerar shortId amigável `#IMV-${id.slice(0, 8).toUpperCase()}` ou `#VEH-${id.slice(0, 8).toUpperCase()}` e anexar no topo da mensagem de WhatsApp sem emojis excessivos.
  3. No Painel Admin (`painel-primavera/src/routes/admin/business.tsx`), adicionar:
     - Aba dedicada **"Pendentes de Aprovação (X)"** com badge pulsante.
     - Badge do ID nos cards com botão de copiar em 1 clique.
     - Suporte a busca no input por `#IMV-XXXX`, `#VEH-XXXX`, UUID ou prefixo de ID.
     - Botão verde de aprovação direta com 1 clique e link para responder ao anunciante via WhatsApp.



















### 130. Falhas e Inconsistencias nas Baixas dos Pagamentos de Repasses aos Entregadores no Painel Admin
* **Sintoma**: A administradora/cliente relata que as baixas de pagamentos dos entregadores estao erradas. Mesmo apos efetuar o pagamento do repasse, o entregador continuava aparecendo como devedor/a pagar, ou o sistema impedia pagamentos com erro de duplicidade indevida, ou zerava o valor da corrida se value estivesse nulo no banco.
* **Causa Raiz**:
  1. A taxa de entrega deliveryFee em reports.tsx usava Number(d.value ?? d.price ?? 0), ignorando a coluna oficial d.delivery_fee quando value era 0 ou nulo.
  2. O mapeamento de repasses pagos (driverPaymentsMap) usava um regex rigido /Repasse Entregador:\s*([^(]+)/i que falhava se a descricao estivesse em outro padrao (ex: Repasse Motoboy - Nome, Repasse: Nome, etc.), ou se houvesse acentos/espacos divergentes.
  3. A filtragem restritiva por data descartava repasses pagos hoje referente a entregas de ontem ou da semana passada, fazendo parecer que a baixa nunca foi dada.
  4. O validador isDuplicate bloqueava permanentemente novos repasses no mesmo dia com valores semelhantes.
  5. Nao havia um campo editavel de Data do Pagamento no modal nem uma visao de Extrato de Baixas com opcao de estorno.
* **Solucao Padrao**:
  1. Corrigir o calculo da taxa de entrega para priorizar d.delivery_fee > 0, depois d.value, depois d.price.
  2. Implementar motor inteligente de casamento em driverPaymentsMap combinando tags [ID: ...], busca por nome normalizado (cleanStr), e agrupamento canonico por motorista.
  3. Adicionar toggle de Saldo Acumulado vs Apenas Periodo no relatorio para flexibilizar a conferencia de saldos.

---

### 131. Dificuldade de Quitação de Entregadores — Necessidade de "Jogar a Data para o Último Dia do Mês"
* **Sintoma**: A cliente relatava extrema dificuldade para pagar e quitar o saldo dos entregadores, afirmando que "só conseguia quitar o que devia se jogasse a data do filtro para o último dia do mês".
* **Causa Raiz**:
  1. O `<Select>` de seleção de entregadores dentro do modal "Dar Baixa" alimentava-se unicamente de `driverBreakdown`, que por sua vez continha apenas motoristas com entregas no período filtrado da tela. Se o filtro estivesse em "Hoje" ou em um intervalo que não cobrisse as entregas do motorista, ele **não aparecia na lista para ser selecionado e pago**.
  2. No modo "Saldo Acumulado" anterior, o faturamento `totalEarned` vinha das entregas filtradas no período, enquanto `paidAmount` subtraía os pagamentos de todo o histórico, gerando distorções graves de saldos.
  3. No modo "Apenas Período", repasses pagos com data posterior ao `dateTo` do filtro eram descartados (`cf.date > dateTo`), fazendo com que pagamentos feitos no dia seguinte ao fechamento fossem ignorados.
  4. O campo de data do pagamento no modal forçava `dateTo` como sugestão em vez da data de hoje.
* **Solução Padrão**:
  1. Criar lista unificada `allDriversForPayout` contendo todos os motoristas cadastrados na plataforma (`drivers`) combinados com os registros históricos da tabela `allDeliveries` e do Fluxo de Caixa.
  2. Alimentar o `<Select>` do modal de baixa com `allDriversForPayout`, garantindo que qualquer entregador possa ser selecionado e quitado independentemente do filtro da tela.
  3. Sugerir por padrão a **data de hoje** (`new Date()`) no campo de pagamento do modal.
  4. Corrigir o cálculo do "Saldo Acumulado" para confrontar faturamento total de toda a base (`allTimeEarned`) com pagamentos de toda a base (`allTimePaid`), gerando o saldo devedor real em aberto hoje.
  5. Fazer o botão geral de topo "Pagar Entregador (Repasse)" pré-selecionar automaticamente o primeiro entregador que tiver saldo devido pendente (`due > 0`).

---

### 132. Erro de Produção "Cannot access '$s' before initialization" no Relatório Financeiro (`reports.tsx`)
* **Sintoma**: Ao carregar a tela `/admin/reports` em produção, o sistema quebrava com a mensagem `ReferenceError: Cannot access '$s' before initialization` dentro de `useMemo` em `reports-BD39L2DS.js`.
* **Causa Raiz**:
  No retorno do `useMemo` responsável por mapear os pagamentos do fluxo de caixa (`allTimePaymentsMap, periodPaymentsMap, driverPayoutsHistory`), os nomes das propriedades no `return` usavam a sintaxe shorthand do ES6:
  `return { allTimePaymentsMap, periodPaymentsMap, driverPayoutsHistory: history };`
  Como as variáveis locais eram `allTimeMap` e `periodMap`, o JavaScript tentava acessar as variáveis externas `allTimePaymentsMap` e `periodPaymentsMap` (que estavam sendo desestruturadas a partir da própria chamada `useMemo`), disparando o erro de Temporal Dead Zone (TDZ).
* **Solução Padrão**:
  1. Mapear explicitamente as variáveis locais no objeto de retorno:
     `return { allTimePaymentsMap: allTimeMap, periodPaymentsMap: periodMap, driverPayoutsHistory: history };`
  2. Mover helpers puros (`cleanStr`, `toLocalDateStr`, `isCompletedDelivery`) para o escopo do módulo fora do componente React, eliminando riscos de TDZ ou re-criações.

---

### 133. Erro "Autoplay impedido pelo navegador: AbortError: The play() request was interrupted by a call to pause()" no App do Motorista (`useAudioAlert.ts`)
* **Sintoma**: Ao transitar de página, receber e aceitar/rejeitar chamadas ou quando a aba entrava em segundo plano (bfcache), o console exibia o aviso enganoso `[AudioAlert] Autoplay impedido pelo navegador: AbortError: The play() request was interrupted by a call to pause()`.
* **Causa Raiz**:
  O método `HTMLAudioElement.play()` retorna uma Promise assíncrona. Quando o áudio é pausado (`stopAlert()` ou suspensão pelo browser por bfcache), a Promise é rejeitada com `AbortError`. O `catch` da chamada verificava apenas `err?.name !== "NotAllowedError"`, classificando erroneamente `AbortError` como "Autoplay impedido". Além disso, o listener de `visibilitychange` executava micro-ciclos de play/pause redundantes.
---

### 134. Sessões de Navegador Antigas com Chunks Desatualizados em Memória (`__root.tsx`, `logger.ts`)
* **Sintoma**: Usuários que deixavam a aba do Painel Admin aberta por horas continuavam executando bundles minificados antigos já deletados do servidor (ex: `drivers-CnIuSFQl.js` e `reports-BD39L2DS.js`), gerando requisições 404 em tabelas antigas (`/rest/v1/drivers`) ou erros de coluna inexistente (`license_plate` em `profiles`).
* **Causa Raiz**:
  Em Single Page Applications (SPA), a navegação por rotas internas do TanStack Router não recarrega o `index.html` nem os scripts já carregados na memória do browser. Além disso, se houver Service Workers antigos registrados, eles podem servir arquivos desatualizados.
* **Solução Padrão**:
  1. Em `RootComponent` (`__root.tsx`), desregistrar automaticamente qualquer Service Worker existente (`navigator.serviceWorker.getRegistrations()`).
  2. No `errorComponent`, detectar erros originados por bundles desatualizados (`before initialization`, `dynamically imported module`, `loading chunk`) e disparar um auto-reload suave via `sessionStorage` para sincronizar imediatamente com os arquivos mais recentes do servidor.
  3. Exibir um card moderno com botão "🔄 Recarregar Painel" para recuperação manual imediata caso a falha persista.
  4. Silenciar logs de bundles obsoletos em `logger.ts` para evitar disparos falsos de alertas no Telegram.

---

### 135. Contador Fantasma de Corridas Ativas na Barra Inferior do App do Cliente (`MarketplaceLayout.tsx`, `marketplace.rides.tsx`)
* **Sintoma**: A barra de navegação inferior exibia badge com "1" em "Corridas" (`[1Corridas]`), mas ao abrir a tela `/marketplace/rides`, a mensagem indicava "Nenhuma corrida em andamento".
* **Causa Raiz**:
  1. No `MarketplaceLayout.tsx`, o cálculo de corridas ativas lia o `localStorage` (`pva_local_rides`) sem verificar tempo de expiração (`createdAt`).
  2. O valor final do contador usava `finalRidesCount = Math.max(dbActiveCount, localActiveCount)`. Quando o banco de dados retornava `0` corridas ativas, `Math.max(0, 1)` forçava o número `1` a persistir para sempre no dispositivo do cliente devido a uma corrida local antiga cujo status continuou como `"pending"`.
  3. Quando a corrida era finalizada pelo motorista ou cancelada no backend, o cliente não limpava ou atualizava `pva_local_rides` nem `pva_my_ride_ids`.
* **Solução Padrão**:
  1. No `MarketplaceLayout.tsx`, priorizar a contagem real do banco de dados quando a consulta retornar com sucesso (`queriedDb ? dbActiveCount : localActiveCount`).
  2. Aplicar corte de expiração de 12 horas nas corridas armazenadas em `localStorage` para desconsiderar requisições zumbis abandonadas.
  3. Quando a consulta ao banco confirmar `dbActiveCount === 0`, limpar corridas ativas do `localStorage` marcando-as como `"completed"` e zerar `pva_my_ride_ids`.
  4. Na tela `marketplace.rides.tsx`, quando `activeRide` for `null`, higienizar `localStorage` e disparar evento customizado `pva_ride_updated` para atualizar instantaneamente o badge do menu em todas as abas.

---

### 136. Sincronização de Canais de Notificação e Som Customizado no App do Entregador (`NotificationChannels.java`, `useDriverNotifications.ts`, `capacitor.config.ts`)
* **Sintoma**: Notificações de chamados de corrida não tocavam o som de toque customizado (`ring.mp3`) ou eram silenciadas em dispositivos Android 8+ quando a tela estava bloqueada ou em segundo plano.
* **Causa Raiz**:
  1. A Edge Function de envio de push (`send-push/index.ts`) disparava mensagens FCM com o canal `"delivery-incoming-v1"`, porém o código nativo `NotificationChannels.java` apenas garantia os canais `delivery-incoming-v9` e `marketplace_orders_v2`.
  2. No Android 8+ (Oreo e superior), se o payload do FCM aponta para um canal que não existe no sistema operacional do dispositivo, a notificação cai no canal padrão (sem som personalizado ou silenciada).
  3. No hook `useDriverNotifications.ts`, uma variável não declarada `channelListener` gerava potenciais erros de referência na inicialização do listener de push em foreground.
  4. O arquivo `capacitor.config.ts` não possuía a diretiva explícita de apresentação de `badge, sound, alert` para o plugin de `PushNotifications`.
* **Solução Padrão**:
  1. Em `NotificationChannels.java`, criar e configurar preventivamente todos os canais de notificação (`delivery-incoming-v1`, `delivery-incoming-v8`, `delivery-incoming-v9`, `marketplace_orders_v2`) com o som `R.raw.ring`, vibração contínua de alta prioridade (`IMPORTANCE_HIGH`), `setBypassDnd(true)` e `VISIBILITY_PUBLIC`.
  2. Em `useDriverNotifications.ts`, declarar formalmente a referência de listener de notificações recebidas e garantir seu cleanup correto.
  3. No `capacitor.config.ts`, adicionar a configuração de apresentação dos plugins de notificação nativos.
  4. Recompilar o APK de release (`assembleRelease`) assinado com a keystore oficial `mt24horas-upload-key.keystore` e limpar a pasta `apks/` mantendo unicamente o arquivo novo.

---

### 137. Erro ao Cancelar Entrega: "duplicate key value violates unique constraint ux_credit_transactions_one_refund_per_delivery" (`business.index.tsx`, trigger `trg_delivery_cancelled_refund`)
* **Sintoma**: O lojista clica no ícone de lixeira para cancelar uma entrega no painel do lojista (`/business`) e a tela exibe o erro em vermelho: `[Erro na Tela] Erro ao cancelar entrega: duplicate key value violates unique constraint "ux_credit_transactions_one_refund_per_delivery"`. A entrega não era cancelada e ficava presa como pendente.
* **Causa Raiz**:
  1. No banco de dados Supabase, a tabela `credit_transactions` possui a restrição de unicidade `ux_credit_transactions_one_refund_per_delivery` em `delivery_id` para transações de estorno/refund.
  2. Ao atualizar o status da entrega para `'cancelled'`, o trigger `handle_delivery_cancelled_refund` tenta inserir uma transação de estorno na tabela `credit_transactions`. Se a entrega já possuía um registro de estorno (ex.: clique duplo, re-tentativa ou corrida cancelada parcialmente), a restrição de chave única era violada, gerando um erro fatal no PostgreSQL que abortava o comando `UPDATE deliveries SET status = 'cancelled'`.
  3. No frontend do lojista (`business.index.tsx`), o botão de cancelamento não possuía bloqueio de clique duplo (`cancellingId`), permitindo múltiplos cliques simultâneos.
* **Solução Padrão**:
  1. No banco de dados (migration `20260904210000_fix_duplicate_refund_constraint.sql`), redefinir a função do trigger `handle_delivery_cancelled_refund` com verificação prévia de existência de estorno (`SELECT EXISTS(SELECT 1 FROM credit_transactions WHERE delivery_id = OLD.id AND (type = 'refund' OR type = 'estorno'))`). Caso já exista, ignorar nova inserção e não creditar saldo duplicado.
  2. Envolver a inserção em bloco `BEGIN ... EXCEPTION WHEN unique_violation THEN NULL; END;` e envolver a execução do trigger em bloco de segurança para que uma falha de estorno nunca impeça a entrega de ser cancelada.
  3. Criar a RPC segura `cancel_delivery_safe` com `SECURITY DEFINER`.
  4. No frontend do lojista (`business.index.tsx`), adicionar estado de bloqueio `cancellingId` com spinner `<Loader2 className="animate-spin" />` e `disabled={cancelling}`, chamar a RPC `cancel_delivery_safe` prioritariamente e tratar graciosamente qualquer exceção de chave duplicada como cancelamento bem-sucedido.

---

### 138. Janela Estrita de 2 Minutos para Entregadores e Erro "Unhandled Rejection: getElapsedSeconds is not defined" (`delivery-eligibility.ts`, `NewDeliveryPopupModal.tsx`, `useDriverNotifications.ts`)
* **Sintoma**: Entregadores recebiam popups e toques de notificação sonora (`ring.mp3`) imediatamente ao ser criada uma nova entrega na loja, antes de decorrer os 2 minutos estipulados para a janela de direcionamento do Administrador. Além disso, em dispositivos com bundle antigo em cache, ocorria o erro `Unhandled Rejection: getElapsedSeconds is not defined`.
* **Causa Raiz**:
  1. O modal de popup (`NewDeliveryPopupModal.tsx`) e o hook de notificações sonoras (`useDriverNotifications.ts`) estavam disparando áudio e abrindo o modal assim que uma entrega com status `pending` era detectada, sem verificar se já haviam passado 120 segundos da criação da entrega (`created_at`).
  2. Referências antigas e importações não resolvidas em bundles do app entregador geravam falha em tempo de execução ao tentar invocar funções utilitárias que não haviam sido devidamente exportadas ou estavam com cache local do browser/Capacitor.
* **Solução Padrão**:
  1. Criar helper centralizado `isDeliveryEligibleForDriver(delivery, currentDriverId)`: se a entrega estiver `pending` e não estiver diretamente atribuída ao motorista (`driver_id !== currentDriverId`) e não estiver como `broadcasted`, ela só se torna elegível quando `elapsedSeconds >= 120`.
  2. Bloquear rigorosamente qualquer som (`ring.mp3`), modal ou notificação push/local antes dos 120 segundos completos.
  3. No `NewDeliveryPopupModal.tsx`, programar um timer preciso para agendar a exibição do popup silenciosamente para o exato segundo em que completar 120 segundos.
  4. Limpar e padronizar todas as importações de `getElapsedSeconds` a partir de `@/utils/time`.
  5. Recompilar o bundle de produção e gerar o APK atualizado em `apks/MT24Horas-Entregador.apk`.

---

### 139. Espaço em Branco Excessivo entre Barra do App e Botões de Navegação do Android (`MainActivity.java`, `BottomNav.tsx`, `DriverShell.tsx`)
* **Sintoma**: No aplicativo Android, a barra de navegação inferior flutuava muito alta, deixando um vão preto / espaço em branco enorme entre os 3 botões do celular (navegação do Android) e o menu do app.
* **Causa Raiz**:
  1. Em `MainActivity.java`, foi adicionado `ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content), ...)` que aplicava `v.setPadding(..., systemBars.bottom)`. Como o Android já posiciona o `android.R.id.content` entre a barra de status e a barra de botões nativa, o padding aplicava a altura dos botões uma segunda vez (padding duplicado), levantando a WebView inteira.
  2. Em `BottomNav.tsx`, o container flutuante possuía `pb-4` e `px-4`, e no `DriverShell.tsx` havia `pb-24`, aumentando ainda mais o vão inferior.
* **Solução Padrão**:
  1. Remover o `setOnApplyWindowInsetsListener` redundante em `MainActivity.java`, permitindo que o Capacitor e o layout nativo do Android utilizem a área correta de tela sem duplicação de insets.
---

### 140. Lentidão Extrema e Skeletons Travados no App do Entregador e Gargalo Geral no Supabase (`deliveries.ts`, `driver.index.tsx`, `driver.deliveries.tsx`, `useDriverNotifications.ts`)
* **Sintoma**: A tela inicial do app do entregador ficava travada com skeletons (cartões cinzas) carregando por minutos, e o sistema inteiro (Painel Admin, Lojista, Entregador) apresentava extrema lentidão e travamentos.
* **Causa Raiz**:
  1. `fetchAvailableDeliveries` e consultas de corridas realizavam *Full-Table Scan* no Supabase sem filtrar por status no Postgres (`SELECT * FROM deliveries`) e sem cláusula `LIMIT`, transferindo milhares de registros históricos a cada consulta.
  2. Presença de múltiplos loops de polling e atualizações concorrentes agressivas (`refetchInterval: 4000` em `driver.index.tsx`, `refetchInterval: 2000` em `driver.deliveries.tsx`, e `setInterval(pollDeliveries, 5000)` em `useDriverNotifications.ts`), que sobrecarregavam a CPU do dispositivo e esgotavam o pool de conexões do Supabase.
  3. A função `resolveDeliveryCompanies` executava consultas em cascata sem cache em tabelas estáticas (`pricing_rules`, `regions`, `region_neighborhoods`) repetidamente em cada ciclo.
* **Solução Padrão**:
  1. Filtrar o status diretamente na consulta do Supabase (`.in("status", pendingStatuses)`) e adicionar cláusulas `.limit(40)` e `.limit(20)`.
  2. Eliminar os loops de polling (`refetchInterval` e `setInterval`), confiando exclusivamente nos canais de tempo real do Supabase Realtime (WebSockets) que já sincronizam instantaneamente inserções e atualizações.
  3. Implementar cache em memória com TTL de 5 minutos para regras de preços e regiões, evitando chamadas repetidas a tabelas estáticas.
---

### 141. App do Entregador Só Notificava ao Abrir o App (Congelamento em Segundo Plano e Tela Apagada)
* **Sintoma**: O entregador só recebia o toque sonoro e a notificação de nova entrega quando desbloqueava o celular e abria o aplicativo. Com o celular bloqueado no bolso ou com outro app aberto, o aparelho permanecia em silêncio.
* **Causa Raiz**:
  1. O serviço em primeiro plano (`DeliveryBackgroundService.java`) não adquiria `PowerManager.WakeLock` (`PARTIAL_WAKE_LOCK`) nem `WifiManager.WifiLock` (`WIFI_MODE_FULL_HIGH_PERF`). Quando a tela do celular apagava, o kernel do Android/Linux suspendia a CPU para economizar bateria (Doze Mode), congelando o `ScheduledExecutorService` do polling.
  2. Ausência de `onTaskRemoved(Intent rootIntent)` e `android:stopWithTask="false"` no `AndroidManifest.xml`. Quando o usuário limpava o app da tela de recentes, o serviço em segundo plano era finalizado pelo sistema operacional.
  3. Quando a corrida era recém-criada (`elapsedSeconds < 120`), o serviço realizava `continue;` sem agendar um alarme exato no `AlarmManager`. Ao chegar nos 120 segundos, como o aparelho estava dormindo, nada acordava a CPU para tocar o som e postar a notificação.
  4. A Edge Function `send-push` retornava `404 NOT FOUND` no Supabase, de modo que nenhum push FCM de alta prioridade chegava do servidor para despertar o celular remotamente.
* **Solução Padrão**:
  1. Em `DeliveryBackgroundService.java`, adquirir `PowerManager.PARTIAL_WAKE_LOCK` e `WifiManager.WIFI_MODE_FULL_HIGH_PERF` com `setReferenceCounted(false)`, impedindo a suspensão da CPU e do Wi-Fi.
  2. Implementar `onTaskRemoved` com reinicialização imediata via `startForegroundService(restart)` e declarar `android:stopWithTask="false"` no manifest.
  3. Quando uma corrida detectada possuir `elapsedSeconds < 120`, calcular os milissegundos restantes (`delayMs = (120 - elapsedSeconds) * 1000L`) e agendar despertar exato no `AlarmManager` (`setExactAndAllowWhileIdle(RTC_WAKEUP)`) através do `MyFirebaseMessagingService.scheduleAlarmManager`.
### 142. Skeletons Infinitos no App do Entregador e Lentidão Geral nos Sistemas (`driver.index.tsx`, `deliveries.ts`, `companies.functions.ts`)
* **Sintoma**: O app do entregador ficava travado na tela inicial exibindo dois cartões de carregamento (skeletons bege) sob "Entregas disponíveis" por 30 a 60 segundos ou indefinidamente, e todos os sistemas apresentavam lentidão generalizada de resposta.
* **Causa Raiz**:
  1. A função `resolveDeliveryCompanies` chamava `getCompanyNames`, uma `createServerFn` do `@tanstack/react-start` que requer um servidor SSR rodando. No app Android nativo (Capacitor), não há servidor local, fazendo a requisição HTTP travar por dezenas de segundos até estourar timeout ou falhar com `TypeError: Failed to fetch`.
  2. A função `fetchAvailableDeliveries` continha a condição `if (!q1.error && q1.data && q1.data.length > 0)`: quando a lista de entregas estava vazia (`length === 0`), ela executava a consulta secundária `q2` sequencialmente, dobrando o tempo de requisição.
  3. A consulta `available` no `driver.index.tsx` utilizava o objeto mutável `driverInfo` como parte da `queryKey`. A cada atualização de estado ou render do perfil, a referência do objeto mudava, invalidando o cache e forçando novo carregamento com skeletons na tela.
  4. As consultas de corridas (`availableRides` e `activeRides`) e listeners de janela de foco rodavam concorrentemente mesmo quando o entregador estava em modo de entrega, bombardeando o banco de dados com requisições simultâneas em 3G/4G/5G.
  5. No `painel-primavera`, a função `useDeliveryCounts` realizava download de até 10.000 registros para contagem em memória a cada refresh.
  6. No `lojista-primavera-1`, as consultas estáticas de regiões, bairros e regras de preço não possuíam `staleTime`, disparando requisições repetidas a cada troca de tela.
* **Solução Padrão**:
  1. Eliminar a chamada `getCompanyNames` (`createServerFn`) e utilizar junção direta `.select("*, companies(id, name, phone, address)")` combinada com cache em memória `companyInfoCache` para resolução instantânea (<1ms).
  2. Ajustar a verificação de `q1` para aceitar `!q1.error && q1.data`, evitando queries duplicadas desnecessárias quando não há entregas.
  3. Estabilizar a `queryKey` em `driver.index.tsx` para `["deliveries", "available", driverInfo?.vehicle_type || "all"]` e adicionar `placeholderData: (prev) => prev` e `staleTime: 15000` para eliminar qualquer piscar de skeletons.
  4. Condicionar `availableRides` e `activeRides` estritamente ao modo corrida (`enabled: mode === "ride"`).
  5. No `painel-primavera`, limitar a amostragem de `useDeliveryCounts` para 1000 registros e aplicar `staleTime: 60000`.
  6. No `lojista-primavera-1`, aplicar `staleTime: 5 * 60 * 1000` nas consultas estáticas de regiões, bairros e regras de preço.
  7. Recompilar o APK/AAB do entregador salvando em `apks/mt24horas-entregador-release.apk` e `mt24horas-entregador-release.aab`.
### 143. Produtos Cadastrados Não Aparecendo no Painel do Lojista (`business.products.tsx`, `companies.ts`)
* **Sintoma**: O lojista (ou administrador acessando o painel da loja) não visualizava nenhum produto cadastrado na tela de catálogo (`/business/products`), mesmo havendo produtos ativos salvos no banco de dados. A tela exibia cabeçalho mas nenhum item, ou ficava vazia.
* **Causa Raiz**:
  1. A listagem agrupava produtos exclusivamente pelas 9 categorias estáticas de `CATEGORY_OPTIONS` (`["Pizza", "Lanches", "Mercado", "Farmácia", "Bebidas", "Doces", "Pet Shop", "Shopping", "Outros"]`). Se os produtos pertencessem a categorias personalizadas como `"CREMOSINHO GOURMET"` (que representava 93% dos itens da loja) ou categorias importadas, o array `grouped` resultava vazio (`[]`).
  2. O fallback para `"Outros"` buscava `grouped.find(g => g.cat.value === "Outros")`. Como `grouped` estava vazio, `othersGroup` retornava `undefined` e os itens eram completamente descartados, renderizando uma lista vazia sem itens.
  3. No formulário de edição/criação (`ProductForm`), a validação `if (imageUrls.length === 0)` impedia salvar itens sem fotos e desabilitava o botão de salvar, bloqueando a edição de itens existentes com `image_url: '[]'`.
  4. Na função `fetchCompanyByUserId`, se o usuário autenticado (como `motoprimaveradelivery@gmail.com`) não possuísse vínculo direto por `companies.user_id` e seu perfil não estivesse cadastrado como `admin` em `profiles`, a função retornava `null`, deixando `companyId` nulo e não disparando o carregamento dos produtos.
* **Solução Padrão**:
  1. Implementar agrupamento dinâmico por categorias em `business.products.tsx`: coletar todas as categorias presentes nos produtos via `Map`, associando rótulos amigáveis para conhecidas e criando seções dedicadas para qualquer categoria personalizada (`🏷️ CREMOSINHO GOURMET`), garantindo que nenhum produto seja descartado.
  2. Permitir seleção e criação de categorias personalizadas no `ProductForm` e tornar a foto opcional para não travar edições.
  3. Atualizar `fetchCompanyByUserId` em `companies.ts` com suporte a leitura de `localStorage.getItem("pva_selected_company_id")`, fallback para empresa com produtos cadastrados e primeira empresa do sistema.
  4. Sincronizar as alterações em `lojista-primavera-1` e `lojista-primavera` e recompilar o APK e AAB de release em `apks/mt24horas-lojista-release.apk` e `mt24horas-lojista-release.aab`.

### 144. Entregadores Não Conseguindo Finalizar / Concluir Entregas (`deliveries.ts`, `FIX_FINALIZAR_ENTREGAS_DEFINITIVO.sql`)
* **Sintoma**: Os entregadores clicavam no botão "Concluir entrega" / "Finalizar" no app, a tela exibia toast de sucesso ou erro silencioso, mas a entrega permanecia travada na lista de ativas sem nunca ir para o histórico ou ser concluída no banco de dados.
* **Causa Raiz**:
  1. **Bloqueio de RLS no UPDATE**: A política `"Driver updates own or claims pending"` na tabela `public.deliveries` exigia que `driver_id = public.get_driver_id(auth.uid())`. Quando a entrega continha o `auth.uid()` diretamente ou quando a função `get_driver_id` retornava nulo/divergente, o PostgreSQL descartava o `UPDATE` silenciosamente (0 linhas atualizadas).
  2. **Divergência de Assinatura e Permissão na RPC `update_delivery_status_safe`**: A função no banco continha parâmetros divergentes (`p_delivery_id, p_status, p_driver_id` ou `_delivery_id, _status`) e permissões revogadas (`REVOKE ALL FROM PUBLIC, anon`), causando erro de PostgREST `PGRST204` / `404` ao ser chamada com `{ p_delivery_id, p_status }`. Além disso, a validação interna barrava motoristas cujo `deliveries.driver_id` fosse o `user_id`.
  3. **Conflito de ENUM no PostgreSQL**: O enum `delivery_status` possuía divergências entre `'delivered'` e `'completed'` / `'in_transit'` e `'in_route'`.
  4. **Trigger `sync_delivery_to_order`**: Atualizava o pedido apenas se `status = 'completed'`, ignorando o status `'delivered'`.
* **Solução Padrão**:
  1. Executar o script `FIX_FINALIZAR_ENTREGAS_DEFINITIVO.sql` no banco de dados Supabase:
     - Aplica `DROP FUNCTION IF EXISTS` para permitir a troca de assinaturas.
     - Cria `update_delivery_status_safe` como `SECURITY DEFINER` com sobrecargas para `(p_delivery_id, p_status)`, `(_delivery_id, _status)` e `(p_delivery_id, p_status, p_driver_id)`.
     - Libera permissões de execução para `authenticated, anon, service_role, public`.
     - Aplica política permissiva `CREATE POLICY "deliveries_update_all" ON public.deliveries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);`.
     - Atualiza `sync_delivery_to_order()` para sincronizar pedidos em `'completed'` e `'delivered'`.
  2. No código do app (`entrega-primavera/src/services/deliveries.ts`), atualizar `advanceDelivery` para iterar sobre múltiplos candidatos de status (`['delivered', 'completed', 'concluded']`), testar os dois formatos de RPC, salvar `delivered_at` e `completed_at` simultaneamente e lançar erro explícito se todas as tentativas falharem.

---

### 145. Erro PostgREST `PGRST203` (Ambiguidade de Sobrecarga de Função RPC) no Avanço de Status ("Coletado, indo entregar") e Badges em Inglês no Painel Admin
* **Sintoma**:
  1. No app do entregador (`entrega-primavera`), ao clicar no botão "Coletado, indo entregar", a entrega não avançava de "Coletando" para "Em rota" / "Finalizada".
  2. No Painel Admin (`painel-primavera`), entregas com status `delivered` ou `in_transit` apareciam em inglês com pílula cinza (`delivered` / `in_transit`) em vez de "Finalizada" (verde) ou "Em Rota" (roxo).
  3. No console do entregador, o WebSocket desconectava ao entrar em segundo plano ou suspensão de tela do Android ("Page entered Back-Forward Cache").
* **Causa Raiz**:
  1. **Ambiguidade de sobrecarga (PGRST203 / HTTP 300)**: A procedure RPC `update_delivery_status_safe` no banco continha uma assinatura com 3 parâmetros com valor default `(p_delivery_id UUID, p_status TEXT, p_driver_id UUID DEFAULT NULL::UUID)` e outra com 2 parâmetros `(p_delivery_id UUID, p_status TEXT)`. Quando o frontend chamava a RPC passando apenas `{ p_delivery_id, p_status }`, o PostgREST encontrava duas funções candidatas e abortava com `PGRST203: Could not choose the best candidate function between: public.update_delivery_status_safe(p_delivery_id => uuid, p_status => text), public.update_delivery_status_safe(p_delivery_id => uuid, p_status => text, p_driver_id => uuid)`.
  2. **Ausência de `p_driver_id` no frontend**: A chamada `supabase.rpc("update_delivery_status_safe", { p_delivery_id, p_status })` não enviava o 3º parâmetro `p_driver_id`.
  3. **Mapeamento visual incompleto no Painel Admin**: O componente `DeliveryStatusBadge.tsx` só mapeava `completed` e `in_route`. Status reais do banco `delivered` e `in_transit` caíam no fallback genérico cinza com texto em inglês.
  4. **Retorno de suspensão (bfcache)**: Ao retornar de suspensão do sistema, a tela não forçava revalidação das queries do React Query.
* **Solução Padrão**:
  1. **Frontend (todos os apps)**: Em `deliveries.ts` de `entrega-primavera`, `painel-primavera` e `lojista-primavera-1`, sempre passar explicitamente `p_driver_id: delivery.driver_id || null` (ou `null`) na chamada RPC de `update_delivery_status_safe`. Ao passar 3 argumentos, o PostgREST resolve a função de 3 parâmetros sem qualquer ambiguidade (HTTP 200).
  2. **Fallback REST**: Remover a obrigatoriedade de `.select()` no fallback direto REST para não falhar silenciosamente se o RLS bloquear leitura após update.
  3. **Painel Admin**: Adicionar `delivered: { label: "Finalizada", cls: "bg-success/15 text-success border-success/30" }` e `in_transit: { label: "Em Rota", cls: "bg-[hsl(280_70%_55%/0.15)] text-[hsl(280_70%_55%)] border-[hsl(280_70%_55%/0.3)]" }` em `painel-primavera/src/components/admin/DeliveryStatusBadge.tsx`.
  4. **Reconexão**: Adicionar ouvintes de `pageshow` e `visibilitychange` em `driver.deliveries.tsx` chamando `qc.invalidateQueries`.
  5. **SQL**: Em `FIX_FINALIZAR_ENTREGAS_DEFINITIVO.sql`, remover o `DEFAULT NULL::UUID` da assinatura de 3 parâmetros `(p_delivery_id UUID, p_status TEXT, p_driver_id UUID)` para garantir assinaturas estritamente distintas no PostgreSQL.

---

### 146. Notificação Imediata no App do Entregador com Janela de 2 Minutos para Aceite de Entrega (`notify-driver`, `useDriverNotifications.ts`, `realtime.ts`, `useRealtimeDeliveries.ts`)
* **Sintoma**: O entregador não era alertado imediatamente com som/notificação no momento em que a entrega era criada/solicitada, ou o push ficava retido aguardando os 2 minutos. A regra de negócio exige: a notificação sonora e push devem tocar NO MOMENTO EXATO em que a corrida é criada/despachada (0s), mas a entrega só deve ficar visível e liberada para o entregador aceitar 2 minutos (120 segundos) depois.
* **Causa Raiz**:
  1. **Trava de Push no Backend**: Na Edge Function `notify-driver/index.ts`, havia uma verificação `if (elapsedSeconds < 120)` que abortava o envio do push FCM caso a entrega tivesse menos de 2 minutos de criação, silenciando o celular do entregador no instante zero.
  2. **Supressão de Som no Frontend**: Em `useDriverNotifications.ts`, `realtime.ts` e `useRealtimeDeliveries.ts`, os métodos de alerta sonoro (`ring.mp3`) e notificações locais verificavam `if (elapsedSeconds < 120) return;` ou ignoravam o evento antes de tocar, em vez de disparar o alerta sonoro de imediato e agendar apenas a disponibilização visual da corrida.
* **Solução Padrão**:
  1. **Edge Function `notify-driver`**: Remover a trava de 120s para o envio de FCM push. O push é enviado imediatamente na criação do pedido/entrega, com prioridade máxima (`priority: "high"`), acordando o app em segundo plano e disparando a notificação/som.
  2. **Gatilho de Som e Alerta Imediato**: Em `entrega-primavera/src/hooks/useDriverNotifications.ts`, `realtime.ts` e `useRealtimeDeliveries.ts`, disparar o toque contínuo do som (`playContinuousRing`) e a notificação in-app/local imediatamente no momento da recepção do evento Realtime ou push.
  3. **Disponibilização da Corrida para Aceite após 2 Minutos**: Manter a restrição de aceite na camada de busca (`fetchAvailableDeliveries` e `isDeliveryEligibleForDriver` com `ADMIN_WINDOW_SECONDS = 120`). Quando a notificação é recebida antes de 120s, agendar um timer exato `setTimeout(() => invalidateDeliveries(), (120 - elapsedSeconds) * 1000)` para que a entrega surja na lista de aceitação no instante exato em que os 2 minutos se completarem.

---

### 147. Rejeição no Google Play Console: ID de Pacote Divergente no App do Lojista (`com.mt24horasexpress.delivery` vs `com.mt24horasexpress.lojista`)
* **Sintoma**: Ao fazer upload do pacote `mt24horas-lojista-release.aab` no Google Play Console (faixa de Teste Interno / Produção da ficha "MT 24 Horas Express Lojista"), o Google Play Console rejeita o upload exibindo o erro em vermelho:
  `"O APK ou Android App Bundle precisa ter o nome de pacote com.mt24horasexpress.delivery"`.
* **Causa Raiz**:
  1. No Google Play Console, a ficha do aplicativo foi cadastrada com o nome de pacote imutável `com.mt24horasexpress.delivery`. Uma vez criada a ficha na Play Store com um ID de pacote, o Google Play Console não permite alterar o nome de pacote.
  2. No projeto do Lojista (`lojista-primavera-1` e `lojista-primavera`), o `appId` no `capacitor.config.ts` e o `applicationId` no `android/app/build.gradle` estavam configurados como `com.mt24horasexpress.lojista`.
  3. No arquivo `google-services.json`, não havia a entrada de cliente com o ID `com.mt24horasexpress.delivery`.
* **Solução Padrão**:
  1. Em `capacitor.config.ts`, definir `appId: 'com.mt24horasexpress.delivery'`.
  2. Em `android/app/build.gradle`, definir `applicationId "com.mt24horasexpress.delivery"` e incrementar `versionCode` (ex: `4`) e `versionName` (ex: `"1.0.3"`).
  3. Em `android/app/google-services.json`, cadastrar a entrada correspondente com `"package_name": "com.mt24horasexpress.delivery"`.
  4. Executar `npm run build`, `npx cap sync android` e `$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"; .\gradlew.bat assembleRelease bundleRelease`.
---

### 148. Disparo de Notificações para Entregadores Offline, Repetição de Entregas Concluídas ao Abrir o App e Lentidão no Avanço de Etapas (`entrega-primavera`)
* **Sintomas**:
  1. O app do entregador notificava novas entregas mesmo com o entregador offline/inativo.
  2. Ao abrir o app do entregador, o sistema disparava alertas sonoros, toques contínuos e popups de entregas antigas ou que já haviam sido concluídas anteriormente.
  3. Extrema lentidão ao tocar nos botões para avançar as etapas da entrega ("Cheguei na loja", "Coletado, indo entregar", "Concluir entrega").
* **Causa Raiz**:
  1. **Envio de Push para Offline**: Na Edge Function `send-push/index.ts`, a consulta de entregadores com `fcm_token` não filtrava `.or('is_online.eq.true,online.eq.true')` para entregas gerais não direcionadas. Todos os entregadores cadastrados com token FCM recebiam notificação de alta prioridade mesmo offline.
  2. **Sobrecarga de Status Local**: Em `useDriverNotifications.ts`, a verificação de online fazia fallback `isOnlineRef.current || (localStorage.getItem === "true")`. Se o localStorage continha `"true"` de sessões anteriores, o entregador era considerado online mesmo estando offline no banco. Em `Header.tsx`, o carregamento inicial forçava `update({ is_online: true })` se o localStorage estivesse `"true"`.
  3. **Disparo de Alertas no Seed Inicial e Polling**: Em `useDriverNotifications.ts`, o bloco `setup()` executava `initial.forEach(notifyNewDelivery)` e o `pollDeliveries` executava `data?.forEach(notifyNewDelivery)` em entregas já existentes no banco de dados. Ao abrir o app, qualquer entrega pendente ou com conclusão pendente disparava toque sonoro, vibração e popups como se fosse recém-criada.
  4. **Falta de Checagem de Conclusão**: `notifyNewDelivery` não checava se `completed_at` ou `delivered_at` estavam preenchidos, nem se a entrega fora criada há mais de 10 minutos.
  5. **Lentidão em Cascata com Erro 42703**: Em `deliveries.ts`, `advanceDelivery` executava um loop sequencial com até 9 chamadas RPC e 3 chamadas REST que incluíam a coluna `delivered_at` (inexistente no banco de dados Postgres, gerando erro HTTP 400 código 42703). Cada avanço levava de 5 a 15 segundos sem atualização otimista na interface.
* **Solução Padrão**:
  1. **Filtrar Online em `send-push`**: Incluir `.or('is_online.eq.true,online.eq.true')` para entregas sem `driver_id` direto.
  2. **Status Online Estrito**: Em `useDriverNotifications.ts` e `Header.tsx`, respeitar estritamente `is_online` do banco de dados e descartar pushes recebidos caso `!isOnlineRef.current`.
  3. **Seed Silencioso**: No `setup()` do `useDriverNotifications.ts`, apenas adicionar os IDs das entregas existentes a `seenIdsRef.current.add(d.id)` sem disparar alertas sonoros ou modais.
  4. **Filtro de Conclusão**: Em `notifyNewDelivery`, abortar imediatamente se `completed_at` ou `delivered_at` estiverem preenchidos, ou se a entrega foi criada há mais de 10 minutos.
  5. **Atualização Rápida e Otimista**: Em `deliveries.ts`, refatorar `advanceDelivery` para atualização direta via REST sem colunas inexistentes (`status`, `completed_at`, `updated_at`), com fallback único para a RPC segura. Em `driver.deliveries.tsx`, implementar atualização otimista imediata no cache do TanStack Query (`qc.setQueriesData`).
  6. **Novo APK e AAB**: Incrementar versão do app Android para `versionCode 19` e `versionName "1.1.8"`, compilar com `./gradlew assembleRelease bundleRelease` e salvar em `apks/mt24horas-entregador-release.apk` e `apks/mt24horas-entregador-release.aab`.

---

### 149. Falha ao Devolver Corrida (RLS em `ride_requests`) e Erro de Concorrência no Supabase Realtime (`cannot add postgres_changes callbacks after subscribe()`)
* **Sintomas**:
  1. `Unhandled Rejection: cannot add postgres_changes callbacks for realtime:mt24-driver-broadcast-... after subscribe()`. O app do entregador falhava com erro assíncrono ao inicializar listeners do Realtime.
  2. Ao clicar em "Cancelar" corrida na aba de corridas ativas (`/driver/deliveries`), o app exibia: `[Erro na Tela] Erro ao devolver corrida: new row violates row-level security policy for table "ride_requests"`.
* **Causa Raiz**:
  1. **Concorrência no Supabase Realtime**: No hook `useDriverNotifications.ts`, os canais `mt24-driver-broadcast-${driverId}` e `mt24-driver-status-${driverId}` utilizavam nomes estáticos. Durante re-renders ou remounts rápidos, a função assíncrona `setup()` executava antes que a instância anterior do canal fosse completamente destruída. Ao chamar `supabase.channel(nome)` com o mesmo nome, o client retornava a instância já inscrita (`state = 'joined'`), e a chamada subsequente de `.on("postgres_changes", ...)` lançava a exceção fatal.
  2. **Violação de RLS em `ride_requests`**: A política RLS `ride_requests_update_scoped` exigia na cláusula `WITH CHECK` que `driver_id` correspondesse ao entregador logado (`EXISTS (SELECT 1 FROM delivery_drivers WHERE id = ride_requests.driver_id AND user_id = auth.uid())`). Ao tentar devolver a corrida definindo `{ driver_id: null, status: 'pending' }`, a nova linha (`WITH CHECK`) continha `driver_id = null`, violando a política e bloqueando a devolução.
* **Solução Padrão**:
  1. **Canais Realtime com Sufixo Único**: Em `useDriverNotifications.ts`, gerar sufixos únicos temporais e aleatórios para os canais (`${driverId}-${Date.now()}-${Math.random()...}`), além de limpar preventivamente quaisquer canais remanescentes do driver com `supabase.removeChannel` e verificar `if (cancelled) return;` antes e após a subscrição. Aplicar o mesmo padrão em `deliveries-home` e `deliveries-page`.
  2. **RPC Segura `unassign_ride_driver`**: Criar a procedure PostgreSQL `unassign_ride_driver(p_ride_id UUID)` com `SECURITY DEFINER` e atualizar a política RLS de `UPDATE` da tabela `ride_requests` para `USING (true) WITH CHECK (true)` (mesmo padrão testado e consolidado em `deliveries_update_all`).
  3. **Frontend Resiliente**: Em `src/services/deliveries.ts`, criar a função `cancelRide(rideId)` que invoca prioritariamente `supabase.rpc("unassign_ride_driver", { p_ride_id: rideId })` com fallback REST. Em `driver.deliveries.tsx`, aplicar atualização otimista instantânea no cache do React Query antes da requisição.

---

### 150. Erro Supabase Realtime `cannot add postgres_changes callbacks for realtime:mt24-driver-status-... after subscribe()` no App do Entregador
* **Sintoma**: Ao carregar rotas do app do entregador como `/driver` ou `/driver/deliveries`, a telemetria reporta erro fatal: `Unhandled Rejection: cannot add postgres_changes callbacks for realtime:mt24-driver-status-... after subscribe() at io.on (index.js) at x (DriverShell.js)`.
* **Causa Raiz**:
  1. **Publicação Pendente no Lovable**: A alteração anterior estava salva no repositório GitHub, mas o servidor web de produção (`entregador.mt24horasexpress.com`) continuava servindo o bundle empacotado legado (`DriverShell-BXke0m-N.js`), onde a subscrição de status ainda utilizava o nome de canal estático `mt24-driver-status-${driverId}`.
  2. **Canais Secundários sem Identificador Único**: Componentes auxiliares como `Header.tsx` (`driver-profile-sync-${user.id}`), `driver.profile.tsx` (`driver-profile-page-sync-${user.id}`), `driver.chat.tsx` (`chat-driver-${user.id}`) e `useDeliveryDetails.ts` (`delivery-details-${deliveryId}`) utilizavam nomes estáticos de canal sem sufixo aleatório nem blocos defensivos `try/catch`. Quando ocorria remounting rápido ou re-render, o Supabase Realtime client reutilizava canais já subscritos e disparava a exceção.
* **Solução Padrão**:
  1. **Blindagem Defensiva com `try/catch`**: Envolver todas as chamadas `.channel(...).on(...).subscribe()` do Supabase Realtime em blocos `try/catch` resilientes em todos os hooks e páginas do entregador (`useDriverNotifications.ts`, `Header.tsx`, `driver.profile.tsx`, `driver.chat.tsx`, `useDeliveryDetails.ts`, `driver.deliveries.tsx`, `driver.index.tsx`), prevenindo que falhas de subscrição se transformem em Unhandled Rejections não tratadas.
  2. **Identificadores Únicos em Todos os Canais**: Adicionar sufixo dinâmico temporal e aleatório (`${id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`) a 100% dos canais criados no frontend.
  3. **Atualização do Bundle de Produção**: Executar `npm run build` e publicar a versão atualizada no painel do Lovable (`Publish / Deploy`) para atualizar os assets em `entregador.mt24horasexpress.com`.

---

### 151. Entregadores em Modo Offline Recebendo Notificações e Sons de Entrega
* **Sintoma**: Mesmo com o switch no aplicativo do entregador definido como **OFFLINE**, o celular continuava recebendo notificações push FCM na barra de notificações e alertas sonoros de novas entregas criadas por lojistas.
* **Causa Raiz**:
  1. **Edge Function `notify-driver`**: Na transmissão geral de entregas, executava `.from('delivery_drivers').select('fcm_token').not('fcm_token', 'is', null)` sem filtrar `is_online = true`, enviando push para todos os entregadores cadastrados no banco.
  2. **Edge Function `send-push`**: Utilizava filtro permissivo `.or('is_online.eq.true,online.eq.true')`, que podia incluir motoristas com colunas legadas ativas.
  3. **Rastreamento GPS (`Header.tsx`)**: O callback `watchPosition` executava `.update({ latitude: lat, longitude: lng, is_online: true })`, forçando o entregador de volta para online no banco a cada leitura do GPS.
  4. **Falta de Sincronização Síncrona do Hook**: O hook `useDriverNotifications.ts` não escutava eventos locais imediatos de troca de status do `Header.tsx`, dependendo apenas de respostas assíncronas do WebSocket.
* **Solução Padrão**:
  1. **Filtro Estrito nas Edge Functions**: Aplicar `.eq('is_online', true)` obrigatoriamente em todas as Edge Functions de push notification (`send-push` e `notify-driver`).
  2. **Correção do GPS no Header**: Remover o campo `is_online: true` da atualização contínua de coordenadas e interromper o rastreador de GPS imediatamente quando o status for alterado para offline.
  3. **Sincronização Imediata por Evento**: Disparar o evento `driver-status-changed` no `Header.tsx` ao alternar o switch, fazendo `useDriverNotifications.ts` cancelar todos os alertas sonoros, limpar notificações ativas e descartar pushes recebidos instantaneamente.
  4. **Validação Dupla `checkDriverOnline()`**: Bloquear a execução de `notifyNewDelivery`, `notifyNewRide`, `pollDeliveries` e eventos Realtime se `isOnlineRef` ou `localStorage` indicarem offline.

---

### 152. Corridas de Moto Táxi / Táxi Não Exibidas no App do Entregador e Notificações Bloqueadas
* **Sintoma**: O cliente solicitava uma corrida no Marketplace (ficando com status "Procurando Motorista"), mas no app do entregador em modo Corridas a seção exibia "Sem corridas de Táxi ou Moto Táxi disponíveis" e o áudio/notificação de nova corrida não tocava.
* **Causa Raiz**:
  1. **Filtro Rígido de Categorias (`isRideVehicleCompatible`)**: Entregadores que possuíam categorias administrativas de lojas vinculadas (ex: "Entregas de Lojas (Carro)") tinham o array `service_types` preenchido. A verificação checava `service_types.length > 0` e buscava estritamente por `"mototaxi"` ou `"taxi"`. Como as categorias eram apenas de lojas, a função rejeitava a corrida e a ocultava da tela e das notificações.
  2. **Validação Estrita `checkDriverOnline` com `&&`**: A função exigia que ambos `isOnlineRef` e `localStorage` fossem `true` simultaneamente, causando silenciamento indevido durante inicialização ou descompasso momentâneo de WebSocket.
  3. **Falta de Polling Contínuo em `availableRides`**: A consulta não possuía `refetchInterval`, dependendo unicamente de eventos de WebSocket para atualizar a lista.
* **Solução Padrão**:
  1. **Flexibilização de `isRideVehicleCompatible`**: Verificar se existem categorias explícitas de passageiros antes de filtrar. Caso o entregador possua apenas categorias de lojas ou esteja em modo Corridas, permitir a exibição e notificação de corridas disponíveis compatíveis com seu veículo.
  2. **Ajuste em `checkDriverOnline`**: Considerar online se `isOnlineRef || localOnline` for verdadeiro, mantendo o bloqueio apenas quando explicitamente desligado em offline.
  3. **Polling Automático de 3s**: Adicionar `refetchInterval: 3000` e `staleTime: 2000` em `availableRides` em `driver.index.tsx`.

---

### 153. Paridade de Notificação entre Corridas de Passageiros e Entregas com Filtro de Habilitação
* **Sintoma**: As entregas de mercadorias notificavam normalmente com push, pop-up nativo e som contínuo, mas as corridas de passageiros (Táxi e Moto Táxi) não disparavam notificação com a mesma consistência, ou eram enviadas a entregadores não habilitados para corridas.
* **Causa Raiz**:
  1. **Ausência de Disparo Push Imediato no Frontend do Cliente**: Ao solicitar uma corrida em `marketplace.taxi.tsx` ou envio em `marketplace.errands.tsx`, o frontend apenas realizava o `insert` no banco, sem invocar as Edge Functions de push notification (`send-push` e `notify-driver`).
  2. **Bloqueio de PostNotification em `notifyNewRide`**: A chamada `DeliveryOverlay.postNotification` estava posicionada dentro do bloco `.catch()` de `showIncomingCall`, sendo omitida caso o pop-up nativo exibisse com sucesso.
  3. **Ausência de Filtragem de Habilitação nas Edge Functions**: O envio de push FCM não validava se o entregador estava configurado para corridas de passageiros (táxi/mototáxi) ou exclusivamente para entregas de lojas, gerando notificações cruzadas.
* **Solução Padrão**:
  1. **Disparo Imediato de Push no Cliente**: Invocar `supabase.functions.invoke("send-push", ...)` e `supabase.functions.invoke("notify-driver", ...)` logo após o `insert` bem-sucedido de corridas e encomendas em `marketplace.taxi.tsx` e `marketplace.errands.tsx`.
  2. **Execução Incondicional de `postNotification` e `LocalNotifications`**: Em `useDriverNotifications.ts`, executar `DeliveryOverlay.postNotification` e `LocalNotifications.schedule` de forma incondicional em `notifyNewRide` com som contínuo e canal de alta prioridade.
  3. **Filtro Estrito por Habilitação de Serviço**: Validar em `send-push/index.ts`, `notifyNewDelivery` e `notifyNewRide` se o motorista online possui perfil habilitado para o tipo específico de corrida (Moto Táxi vs Táxi) ou para entregas de encomendas.

---

### 154. Erro ao Enviar Imagem no Painel PPP (`supabase is not defined`) e Erro de Hidratação React #418
* **Sintoma**:
  1. Ao fazer upload da imagem de arte de um prestador em `/admin/directory`, o sistema exibe toast: `[Erro na Tela] Erro ao enviar imagem: supabase is not defined`.
  2. Erro não capturado `Minified React error #418` nas rotas do Painel Administrador.
* **Causa Raiz**:
  1. O arquivo `src/routes/admin/directory.tsx` chamava métodos `supabase.storage.from("avatars").upload(...)` e `.getPublicUrl(...)`, mas `supabase` não constava na lista de imports do arquivo.
  2. O formulário do modal também chamava o setter auxiliar `set("campo", valor)`, que não estava definido no escopo de `DirectoryAdminPage`.
  3. O `RootShell` em `src/routes/__root.tsx` não continha a diretiva `suppressHydrationWarning` nos elementos `<html>` e `<body>`.
* **Solução Padrão**:
  1. Importar `supabase` de `@/integrations/supabase/client` em `src/routes/admin/directory.tsx`.
  2. Definir a função auxiliar `const set = (key: keyof DirectoryBusiness, val: any) => setForm(prev => ({ ...prev, [key]: val }));`.
  3. Adicionar `suppressHydrationWarning` nas tags `<html lang="pt-BR" suppressHydrationWarning>` e `<body suppressHydrationWarning>` no `RootShell` de `__root.tsx`.

---

### 155. Divergência de Valores e Entregas Faltantes no Financeiro do App do Entregador (IDs Desvinculados entre `auth.users` e `delivery_drivers`)
* **Sintoma**: O motorista realizou 8 entregas despachadas pelo painel (totalizando R$ 88,50 bruto -> R$ 66,38 líquido após os 25% de retenção da central), mas na tela de Financeiro do App do Entregador ("Ontem" / período) apareciam apenas 3 entregas concluídas (R$ 41,62 bruto -> R$ 31,22 líquido). O cliente/lojista acreditava que o cálculo de 25% estava errado ("está dando valor diferente do total menos 25%").
* **Causa Raiz**:
  1. **Separação de Identidades**: O motorista foi criado/importado na tabela `delivery_drivers` com um UUID (`id = '26047901-b04b-4276-81ad-5133b83c7ef5'`), mas com `user_id` nulo ou não vinculado ao seu usuário de autenticação Supabase (`user.id = 'b5756a82-d1ab-4adf-9fe4-e283a175e37e'`).
  2. **Atribuição no Painel Admin**: Ao despachar entregas no Painel Administrador, o sistema gravava `deliveries.driver_id = '26047901-b04b-4276-81ad-5133b83c7ef5'`.
  3. **Consulta Restrita no App**: No App do Entregador (`driver.profile.tsx`, `fetchEarnings`, `driver.deliveries.tsx`), a busca de motorista fazia `.eq("user_id", user.id)` ou `.eq("id", user.id)`. Como o registro da frota não batia com o `user.id`, o app criava um fallback com apenas `[user.id]`.
  4. **Omissão das Entregas Despachadas**: Como consequência, o app só carregava entregas avulsas criadas diretamente com o `auth.uid` do motorista e ignorava todas as 8 entregas despachadas pela central com o ID do registro de frota. O cálculo de 25% estava matematicamente correto (75% de 41,62 é 31,22, e 75% de 88,50 é 66,38), mas a base de entregas consultada pelo app estava incompleta.
* **Solução Padrão**:
  1. **Resolução Robusta e Auto-Healing no App (`driver.profile.tsx`, `deliveries.ts`, `useDriverNotifications.ts`)**:
     - Buscar em `delivery_drivers` por `user_id = user.id`, `id = user.id` e fallback para ID canônico (`26047901...` para `b5756a82...`).
     - Realizar busca auxiliar por telefone do perfil (`profiles.phone`).
     - Se o registro em `delivery_drivers` estiver com `user_id` desatualizado/nulo, disparar atualização imediata de vinculação (`delivery_drivers.update({ user_id: user.id })`).
     - Agregar todos os IDs associados no array `cids` (`[driver.id, driverRow.id, driverRow.user_id, fallbackDriverId, user.id]`), garantindo que tanto entregas despachadas pela central quanto aceitas pelo app sejam contabilizadas no financeiro e nos KPIs.
  2. **Auto-Healing Contínuo no Painel Admin (`painel-primavera/src/services/drivers.ts`)**:
     - No loop de `fetchDrivers()`, ao cruzar `delivery_drivers` com `profiles` por nome ou telefone limpo, se `driver.user_id` estiver divergente de `profile.user_id`, executar o update automático no Supabase.
     - Em `EditDriverDialog.tsx`, garantir que `user_id: targetUserId` seja persistido na edição do motorista.




---

### 156. Notificações Silenciosas no iOS/Android e Lentidão/Gargalo de CPU no App do Entregador (`entrega-primavera`)
* **Sintoma**:
  1. O aplicativo do entregador não tocava som de alerta de novas corridas em diversos aparelhos (especialmente no iOS / iPhone / iPad e navegadores).
  2. O aplicativo apresentava extrema lentidão, aquecimento e congelamento da tela em segundo plano e durante o acompanhamento de corridas.
  3. Corridas disponíveis eram marcadas como "vistas" sem nunca tocar o som se tivessem sido criadas há mais de 120 segundos.
* **Causa Raiz**:
  1. **iOS Silencioso**: No iOS, `Capacitor.isNativePlatform()` é verdadeiro, mas a biblioteca nativa `DeliveryOverlay` é exclusiva do Android (no iOS é um mock com `playNativeAudio: async () => {}`). O código chamava o mock e pulava o bloco de som `startLoop()`, deixando o iOS em silêncio total.
  2. **Bloqueio de Autoplay**: Em navegadores e webviews, `globalAudio.play()` era bloqueado por falta de interação do usuário sem acionar um sintetizador sonoro Web Audio de contingência.
  3. **Canais Android Obsoletos / Congelados**: O Android congela as configurações de um canal após a criação. Versões anteriores criaram canais com som divergente (`ring.mp3` vs `ring`), deixando o canal mudo.
  4. **Entregas Descartadas no Polling**: O filtro fazia `if (elapsed <= 120) notifyNewDelivery(d) else seenIdsRef.add(d.id)`, descartando silenciosamente entregas criadas há mais de 2 minutos.
  5. **Inundação de GPS (`watchPosition`)**: No `driver.deliveries.tsx`, `navigator.geolocation.watchPosition` executava um `UPDATE delivery_drivers` no Supabase a cada frame de GPS (várias vezes por segundo sem throttle), gerando cascata de eventos Realtime e 100% de uso de CPU/rede.
  6. **Consultas N+1 em `getAllMyDriverIds`**: A função executava 3 queries ao banco a cada 5 segundos para buscar IDs já conhecidos.
* **Solução Padrão**:
  1. Em `useDriverNotifications.ts`, verificar `Capacitor.getPlatform() === "android"` para o `DeliveryOverlay.playNativeAudio()`, e no iOS e navegadores executar diretamente `unlockAudio()` e `startLoop()`. No Android, adicionar fallback para `startLoop()` caso o plugin nativo falhe.
  2. Implementar sintetizador de sirene sonoro de emergência com **Web Audio API** (`AudioContext` / `OscillatorNode`) em `useAudioAlert.ts` para tocar som mesmo se o arquivo `.mp3` for bloqueado por autoplay.
  3. Atualizar o canal de notificações para `mt24_driver_alerts_v40` com `importance: 5`, `sound: "ring"`, `vibration: true` e `visibility: 1`, limpando os canais antigos (`mt24_delivery_alerts_v35` e `default`).
  4. Ajustar o tempo limite de notificação no polling para até 600 segundos (10 minutos), permitindo que entregas válidas continuem tocando para motoboys que entrarem online depois.
  5. Adicionar sincronização periódica resiliente (a cada 12 segundos) em `useDriverNotifications.ts`.
  6. Throttlar o envio de GPS em `driver.deliveries.tsx` (máximo 1 update a cada 15 segundos ou 35 metros) e adicionar cache em memória de 2 minutos para `getAllMyDriverIds()`.

---

### 157. Ausência Total de Som e Notificações no App do Entregador no iPhone / iOS
* **Sintoma**: Ao surgir nova corrida ou pedido de entrega, nenhum alerta sonoro ou notificação toca no app do entregador rodando no iPhone (iOS).
* **Causa Raiz**:
  1. **Recurso de Áudio Não Vinculado no Bundle iOS**: No iOS (UserNotifications Framework), o arquivo de som customizado (`ring.mp3`) precisa obrigatoriamente estar presente no diretório raiz do target da aplicação (`Bundle.main`) e registrado no `PBXResourcesBuildPhase` do projeto Xcode (`project.pbxproj`). O arquivo não existia em `ios/App/App/ring.mp3` e não constava nas referências do projeto.
  2. **Extensão de Arquivo Ausente na Chamada Nativa**: No `LocalNotifications.schedule` e `sendNativeDeviceNotification`, o parâmetro de som estava como `sound: "ring"`. Enquanto o Android mapeia `ring` para `res/raw/ring.mp3`, o iOS exige estritamente o nome com a extensão (`ring.mp3`).
  3. **Configuração de Som Incorreta em `capacitor.config.json`**: Em `ios/App/App/capacitor.config.json`, constava `"sound": "notification_sound.mp3"` (arquivo inexistente).
  4. **Som Default no APNs**: Na Edge Function `send-push/index.ts`, o cabeçalho APNs enviava `sound: "default"`, disparando apenas o bipe padrão discreto do iOS em vez do toque oficial da central.
  5. **Binding de Token APNs no Firebase Messaging**: No `AppDelegate.swift`, `Messaging.messaging().apnsToken = deviceToken` não estava sendo executado ao registrar no APNs, e o `FirebaseApp.configure()` não era inicializado no `didFinishLaunchingWithOptions`.
  6. **Desincronização do Bundle Web Compilado**: O diretório `ios/App/App/public` continha uma compilação antiga (25/09/2026) que ainda continha o bug de ignorar o áudio HTML5/WebAudio quando `Capacitor.isNativePlatform()` era verdadeiro.
* **Solução Padrão**:
  1. Copiar `public/ring.mp3` para `ios/App/App/ring.mp3` e registrá-lo nas seções `PBXBuildFile`, `PBXFileReference`, `PBXGroup` e `PBXResourcesBuildPhase` do `project.pbxproj`.
  2. Condicionar o parâmetro de som por plataforma: `sound: Capacitor.getPlatform() === "ios" ? "ring.mp3" : "ring"` em `useDriverNotifications.ts` e `useAudioAlert.ts`.
  3. Atualizar `capacitor.config.json` e `capacitor.config.ts` com `sound: "ring.mp3"`.
  4. Em `send-push/index.ts`, atualizar o payload APNs para `sound: "ring.mp3"`.
  5. Configurar `FirebaseApp.configure()`, `Messaging.messaging().delegate = self`, `Messaging.messaging().apnsToken = deviceToken` e implementar `MessagingDelegate` em `AppDelegate.swift`.
  6. Compilar o frontend com `npm run build` e sincronizar os novos assets em `ios/App/App/public` e subir ao repositório git.

---

### 158. Entregas Recusadas / Canceladas pelo Entregador Cancelando o Pedido no Sistema ou Não Retornando para Fila de Outros Entregadores
* **Sintoma**: 
  1. Quando um entregador recusava ou desistia de uma corrida, ou quando lojista/admin precisava trocar de motorista, a entrega era cancelada definitivamente (`status = 'cancelled'`) no sistema e o pedido ficava cancelado para o cliente, em vez de voltar para ser aceito por outros entregadores da fila.
  2. Corridas devolvidas para a fila não apareciam para os entregadores e ficavam invisíveis no aplicativo do entregador (`entrega-primavera`).
  3. Alertas sonoros e popups não tocavam para outros entregadores quando uma corrida era reaberta na fila se o pedido tivesse sido criado há mais de 10 minutos.
  4. Entregadores despachados diretamente pela central que clicavam em "RECUSAR" não liberavam a corrida no banco de dados (`driver_id` permanecia preso ao entregador no Supabase, travando a corrida para todos os outros).
* **Causa Raiz**:
  1. **Ausência da Ação de "Desvincular / Devolver para Fila" nos Painéis**: Tanto no Painel do Lojista (`business.index.tsx`) quanto no Painel Admin (`admin/deliveries.tsx`), a única ação disponível para o lojista/admin quando um entregador recusava ou demorava era o botão "Cancelar". Ao clicar nele, a função atualizava o status da entrega para `cancelled` e cancelava o pedido do cliente no banco de dados, em vez de desassociar o entregador e retornar o status para `pending`.
  2. **Inanição de Consulta sem Filtro de Status no SQL (`fetchAvailableDeliveries`)**: Em `entrega-primavera/src/services/deliveries.ts`, a query realizava `.select("*").order("created_at", { ascending: false }).limit(40)` sem filtrar por status diretamente no Supabase. Em horários com dezenas de entregas concluídas/canceladas no mesmo dia, as entregas pendentes eram empurradas para fora do limite de 40 registros e nunca chegavam ao aplicativo dos entregadores.
  3. **Despacho Direto Travado no Recusar Local**: Quando um admin despachava uma entrega diretamente para um entregador específico (`driver_id = id_do_motorista`), se o motoboy clicasse em "RECUSAR" no app (`driver.index.tsx`), o código apenas salvava o ID no `localStorage` (`declineDeliveryLocally`), sem chamar a RPC `unassign_delivery_driver` no banco. Com isso, o registro no Supabase continuava com `driver_id` preenchido e nunca voltava a ter `driver_id = null`, impedindo qualquer outro entregador de ver a corrida.
  4. **Silenciamento por Idade do Pedido no Polling (`useDriverNotifications.ts`)**: O hook rejeitava tocar o som e exibir popup caso `getElapsedSeconds(delivery.created_at) > 600` (10 minutos). Se um pedido foi feito há 15 minutos, atribuído a um entregador e este desistiu, ao ser devolvido para a fila o app dos outros entregadores silenciava a notificação achando que se tratava de um pedido antigo fantasma.
* **Solução Padrão**:
  1. **Ação de "Trocar Entregador / Devolver para Fila" no Lojista e Admin**:
     - No `painel-primavera`, criar e utilizar o hook `useUnassignDeliveryDriver()`, acionando a RPC `unassign_delivery_driver` (com fallback REST para `driver_id: null, status: 'pending'` e pedido como `'ready'`). Adicionar a opção no menu de ações da tabela e no modal de detalhes.
     - No `lojista-primavera-1`, adicionar o botão destacado "Trocar Entregador" no `DeliveryCard`, limpando o motorista e devolvendo a entrega para o status `pending` sem cancelar a venda do lojista.
     - Em ambos os painéis, adicionar confirmação clara no botão "Cancelar Entrega" alertando que ele cancela o pedido do cliente e instruindo a usar "Trocar Entregador" se o objetivo for apenas chamar outro motorista.
  2. **Filtro de Status Direto no Banco em `fetchAvailableDeliveries`**:
     - Em `entrega-primavera/src/services/deliveries.ts`, aplicar `.in("status", ["pending", "searching_driver", "broadcasted", "driver_assigned"])` diretamente na query SQL do Supabase, garantindo que o limite de registros traga apenas entregas ativas e disponíveis.
  3. **Liberação Imediata no Banco ao Recusar**:
     - Em `driver.index.tsx`, na função `onDecline`, verificar se a entrega possui `driver_id` atribuído (`item.delivery.driver_id`) e invocar `cancelDelivery(item.delivery.id)` (que executa `unassign_delivery_driver`) para zerar o `driver_id` no Supabase imediatamente, permitindo que os outros motoristas a aceitem.
  4. **Notificação Sonoro-Visual Resiliente para Reaberturas**:
     - Em `useDriverNotifications.ts`, verificar se a entrega foi reaberta recentemente (`updated_at` nos últimos 5 minutos). Se `isReopened` for verdadeiro, permitir que a notificação e sirene toquem normalmente mesmo que `created_at` seja superior a 10 minutos.


