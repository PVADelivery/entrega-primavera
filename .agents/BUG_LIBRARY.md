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

### 33. Ocultação de Corridas Ativas no Rodapé do Cliente (`marketplace.rides.tsx`)
* **Sintoma**: Na tela `/marketplace/rides`, mesmo com corridas pendentes criadas no sistema, o rodapé exibia a mensagem "Você ainda não possui corridas concluídas no histórico".
* **Causa Raiz**: O componente filtrava o histórico exclusivamente por `status === "completed" || status === "cancelled"`. Quando o cliente só possuía corridas ativas/pendentes (`pending`, `accepted`), o filtro resultava em 0 itens e acionava o estado vazio enganoso.
* **Solução Padrão**:
  Em `marketplace.rides.tsx`, exibir o mapa de acompanhamento da corrida ativa no topo e renderizar todas as corridas registradas no contêiner "Todas as Corridas" via `rides.map(...)`, com os devidos badges de status (`pending`, `accepted`, `in_progress`, `completed`, `cancelled`). O estado vazio só é acionado se `rides.length === 0`.
