# Pós-deploy — mudanças depois da validação

O `CLAUDE.md` descreve o sistema até a entrada em produção. As mudanças pedidas
depois disso ficam registradas aqui, em ordem. **Onde este arquivo e o `CLAUDE.md`
divergirem, vale este arquivo.**

O repositório continua público: nenhum e-mail, nome de pessoa ou de organização
externa entra aqui, no código ou em mensagem de commit. Quem tem cada papel está
no Firestore (`usuarioPerfil`), não no repositório.

---

## 2026-10-14 — Papéis novos e acesso de convidado externo

**Pedido:** liberar acesso a pessoas de fora do domínio corporativo, com aprovação
feita dentro do sistema.

### Papéis

| Papel | Quem | O que faz |
|---|---|---|
| `admin` | concedido por script | tudo, inclusive liberar convidado |
| `gestor` | concedido por script, a uma pessoa | hoje, as mesmas funções do `admin` |
| `usuario` | **padrão** de quem é do domínio e não tem perfil | vê o inventário e as emissões registradas, registra a própria viagem, não vê quem registrou cada viagem e não libera ninguém |
| `externo` | convidado de fora do domínio, liberado na tela de acessos | vê o inventário e as emissões registradas, sem nome de ninguém; **não registra viagem** |
| `sustentabilidade`, `importacao`, `colaborador` | concedidos por script | sem mudança |

**O que mudou de nome:** o papel padrão do domínio se chamava `gestor`. Ele virou
`usuario`, com o mesmo alcance, e `gestor` passou a ser o papel de quem libera
convidado. No momento da mudança só havia um perfil gravado no banco (um `admin`),
então nada precisou de migração.

**Isto substitui a §5.2 e a parte da §12.12 que dizia que nenhuma tela concede
acesso.** A tela de acessos concede, mas **um papel só, `externo`**. Os demais
continuam sendo dados por `npm run perfil`.

### Como o convidado entra

1. Na tela de entrada, em **Primeiro acesso**, ele informa o e-mail e cria uma
   senha (mínimo de 8 caracteres). Funciona com qualquer e-mail, e ele não precisa
   de conta Google.
2. O servidor grava um pedido em `solicitacaoAcesso/{uid}` e **recusa o login**,
   avisando que o pedido está em análise.
3. `admin` ou `gestor` abre **Acessos** no menu e libera ou recusa.
4. Liberado, o convidado entra com e-mail e senha.

Quem é do domínio continua entrando **só pelo Google**. Cadastro com senha usando
e-mail da empresa é recusado no login e em cada requisição: sem isso, qualquer
pessoa poderia cadastrar o e-mail de um colega e entrar como `usuario`, sem passar
por aprovação.

**O e-mail do convidado não é confirmado, e isso é decisão.** A primeira versão
mandava um link de acesso para o e-mail, o que provava que a pessoa é dona da
caixa postal. Saiu no mesmo dia: o fluxo confundia e o e-mail caía no spam.
Consequência: **qualquer um pode se cadastrar com o e-mail de outra pessoa**, e o
pedido aparece como se fosse dela. **A verificação passa a ser quem aprova:**
libere só quem combinou com você que acabou de se cadastrar. A tela de Acessos diz
isso, e mostra em cada pedido se o e-mail foi confirmado (só nos que entraram pelo
Google).

Esqueceu a senha: não há recuperação por e-mail, pelo mesmo motivo. Quem libera
revoga, apaga a conta no Firebase Console (Authentication → Users) e a pessoa
refaz o primeiro acesso.

### Regras que seguram a tela

- **Só `admin` e `gestor` abrem a tela e decidem**, conferido na consulta, não no
  menu. O padrão `usuario` nunca libera: senão qualquer pessoa da empresa abriria
  a porta para alguém de fora.
- **A tela só grava `externo`, e nunca sobrescreve um perfil de outro papel.**
- **Fora do domínio, a sessão só aceita `externo`.** Um perfil `admin` gravado
  por engano numa conta externa é recusado no login e em cada requisição.
- **Conta do domínio não passa por convite**: ela já entra como `usuario`.
- **Recusado ou revogado não volta sozinho para a fila** tentando entrar de novo.
  Para devolver o acesso, libera-se pela tela.
- **Revogar apaga o perfil e encerra a sessão aberta** (`revokeRefreshTokens`).
  Fora do domínio não há papel padrão, então revogar tira o acesso de verdade.
- Cada liberação guarda quem liberou e quando (`aprovadoPor`, `aprovadoEm`), e
  cada decisão fica registrada no pedido (`decididoPor`, `decididoEm`).
- O motivo de uma decisão recusada volta pela URL como código, nunca com o e-mail.

### O que o convidado vê

O que o `usuario` vê, menos o formulário de viagem: as cinco telas do inventário
e "Emissões registradas", agregada e sem nome. **Isso inclui nome de agente de
carga, porto, navio e os volumes reais** que as telas mostram. Foi decidido que
isso é aceitável para os convidados liberados.

### Operação (fora do código)

- **Firebase Console → Authentication → Sign-in method → Email/Password:** ligar
  a primeira opção, *Email/Password*. **Deixar desligado** *Email link
  (passwordless sign-in)*, que não é mais usado. Sem a primeira, o cadastro falha
  com `auth/operation-not-allowed`, e a tela diz isso.
- Conceder `gestor`: a pessoa entra uma vez e depois
  `npm run perfil -- <email> gestor`.
