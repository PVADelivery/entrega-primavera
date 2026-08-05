# Separar Entregas e Corridas no app do entregador

## O que entendi (confirme se estiver certo)

1. O admin define, no cadastro do motorista, quais serviços ele pode fazer (`service_types`): entregas moto, entregas carro, frete carro aberto, táxi, moto táxi. O app só lê isso — o motorista não muda.
2. O mesmo motorista pode estar habilitado nos dois lados (entregas E corridas).
3. No topo da home entra uma **chave de modo de trabalho**: "Entregas" ou "Corridas". Ele escolhe um por vez.
4. Enquanto estiver em "Corridas", ele **só** vê e recebe notificação de corridas de passageiro. Em "Entregas", só entregas. Nada misturado na mesma tela.
5. Se o admin não habilitou uma das categorias, o botão daquele modo aparece bloqueado ("não habilitado pelo administrador").
6. Comissão continua 75% motorista / 25% plataforma nos dois tipos.

## Home (`/driver`)

```text
[ Header: MT 24 Horas Express · Online · Olá, Joao ]
[ Card de ganhos do modo atual ]
[  ENTREGAS  |  CORRIDAS  ]   <- chave de modo, logo abaixo dos ganhos
[ Chips das categorias habilitadas pelo admin (somente leitura) ]
[ Em andamento (do modo atual) ]
[ Disponíveis (do modo atual) ]
```

- A seção "Filtro de Corridas" atual vira o bloco de chips somente-leitura, mostrando apenas as categorias liberadas pelo admin.
- Modo Entregas: cards de entrega (loja, endereço, valor, aceitar).
- Modo Corridas: cards de corrida com passageiro, origem, destino, tarifa, aceitar/iniciar/concluir.
- Os ganhos exibidos passam a ser os do modo ativo (entregas concluídas ou corridas concluídas).

## Aba Entregas & Corridas (`/driver/deliveries`)

Duas abas no topo (Entregas / Corridas) sincronizadas com a escolha da home, cada uma com sua lista de ativos e seu histórico.

## Aba Perfil

Blocos por categoria, exibindo só o que se aplica ao que o admin habilitou:

- **Entregador (moto/carro/frete)**: veículo, placa, tipo de bag/carga, entregas concluídas, ganhos de entregas.
- **Moto táxi / Táxi**: veículo, placa, capacidade de passageiros, avaliação, corridas concluídas, ganhos de corridas.
- Bloco comum: dados pessoais, avatar, região, avaliação, regra de repasse 75/25.
- Faixa no topo: "Habilitado pelo administrador: Entregas · Corridas" e o modo ativo.

## Notificações e tempo real

- Assinaturas realtime ligadas/desligadas conforme o modo: em Corridas escuta só `ride_requests`; em Entregas só `deliveries`.
- O badge do menu inferior conta apenas os itens ativos do modo selecionado.

## Detalhes técnicos

- Novo `useWorkMode()` (contexto leve) com `"delivery" | "ride"`, persistido em `localStorage` por usuário, derivando `canDelivery` / `canRide` de `delivery_drivers.service_types`.
- Novo componente `WorkModeSwitch` (pílula dupla no estilo dourado do app), usado na home e na aba de entregas.
- `driver.index.tsx`: consultas de entregas e corridas com `enabled` conforme o modo, evitando buscas desnecessárias.
- `driver.deliveries.tsx` ganha as duas abas; `driver.profile.tsx` ganha os blocos por categoria; `BottomNav.tsx` filtra o badge pelo modo.
- Sem mudança de schema: `service_types` e `ride_requests` já existem no banco conectado; o modo ativo é preferência local do app.

Confirme (ou corrija) os 6 pontos do início e eu aplico.