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

1. Na tela de entrada, ele informa o e-mail e recebe um **link de acesso** (login
   por link do Firebase). Funciona com qualquer provedor de e-mail, e ele não
   precisa de conta Google.
2. No primeiro clique no link, o e-mail fica confirmado e o servidor grava um
   pedido em `solicitacaoAcesso/{uid}`. **O login é recusado** com a mensagem de
   que o pedido está em análise.
3. `admin` ou `gestor` abre **Acessos** no menu e libera ou recusa.
4. Liberado, o convidado pede um link novo e entra.

Quem é do domínio continua entrando com o Google, e pode usar o link também.

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
  *Email link (passwordless sign-in)*. Sem isso, o envio do link falha com
  `auth/operation-not-allowed`, e a tela diz isso.
- O domínio de produção já está em *Authorized domains*, porque o login do Google
  usa a mesma lista. Ele é o destino do link.
- Opcional: em *Templates*, pôr o e-mail do link em português.
- Conceder `gestor`: a pessoa entra uma vez e depois
  `npm run perfil -- <email> gestor`.
