# Corrigir cadastro por convite do entregador

## O que os alertas mostram
1. **"Preencha o email e uma senha válida..."** — o entregador (iPhone) tentou avançar a 1ª etapa do convite com algo faltando. A mensagem é genérica: não diz se o erro é o e-mail, a senha curta ou as senhas diferentes.
2. **"A user with this email address has already been registered"** — o e-mail dele já tem conta no sistema. A tela só mostra o erro em inglês e o entregador fica travado, sem saída.
3. **"Scraping / Cópia em Massa" no painel Admin** — é alguém da equipe copiando a lista de entregas no painel Admin (painel.mt24horasexpress.com). Isso é do projeto do Admin, não deste app. Provavelmente é um falso alarme (um usuário logado copiando os próprios dados).

## O que vai mudar neste app (Entregador)

**Etapa 1 do convite — mensagens claras**
- Mostrar uma mensagem específica para cada problema: "Informe seu e-mail", "A senha precisa ter pelo menos 6 caracteres", "As senhas não coincidem".
- Destacar o campo com erro logo abaixo dele, sem depender só do aviso que some.
- Remover espaços extras do e-mail e salvar sempre em minúsculas (o preenchimento automático do iPhone costuma colocar espaços ou maiúsculas).

**E-mail já cadastrado — não travar mais**
- Quando o e-mail já existir, o app tenta entrar automaticamente com a senha digitada.
  - Se a senha estiver certa: vincula a conta como entregador, salva os dados do convite (nome, telefone, veículo, placa), marca o convite como usado e leva direto para o painel.
  - Se a senha estiver errada: mostra em português "Este e-mail já tem conta. Entre com sua senha ou recupere o acesso", com os botões **Entrar** e **Esqueci minha senha**.
- Traduzir para português as mensagens em inglês que vêm do sistema.

**Alertas do Telegram**
- Erros de preenchimento do formulário (campo vazio, senha curta, e-mail já cadastrado) deixam de ser enviados como "ERRO NO SISTEMA", porque não são falhas do app. Erros reais continuam sendo enviados.

## Fora deste app
- O alerta de cópia em massa vem do painel Admin. Para ajustá-lo (por exemplo, não alertar quando quem copia é admin ou lojista logado), é preciso abrir o projeto do Admin e pedir a mudança lá.

## Detalhes técnicos
- `src/routes/invite.$token.tsx`: dividir a validação de `nextStep()` por campo, guardando os erros por campo; aplicar `trim().toLowerCase()` no e-mail; em `handleSubmit`, quando a resposta de `accept-invitation` ou de `signUp` indicar "already registered", chamar `signInWithPassword`. Se der certo, fazer upsert em `delivery_drivers` pelo `user_id`, atualizar `invitations.status = 'accepted'` e navegar para `/driver`. Se falhar, mostrar o bloco com links para `/login` e recuperação de senha (`resetPasswordForEmail`).
- `src/services/logger.ts`: lista de mensagens de validação ignoradas no envio de `toast_error` ao Telegram.
- Nenhuma mudança no banco de dados.
