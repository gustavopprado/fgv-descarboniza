# FGV Descarboniza

Inventário de emissões de CO₂ da FGV Ferragens para Móveis.
Este documento é a especificação do sistema. Leia inteiro antes de escrever código.

---

## 0. Regras de trabalho

**Não suba servidor de desenvolvimento.** Não rode `npm run dev`, `next dev` ou equivalente.
O Gustavo roda a aplicação e reporta o que viu. Faça build ou typecheck se precisar validar,
mas não deixe processo servindo.

**O protótipo é referência visual, não fonte de dado.** O arquivo
`fgv-descarboniza-prototipo.html` define layout, paleta, tipografia, comportamento dos mapas
e das animações. **Todos os números dentro dele são de exemplo** — alguns são inventados.
Nenhum valor do protótipo entra no sistema.

**Este repositório é público.** Leia a seção 2 antes de criar qualquer arquivo, escrever
qualquer constante ou montar qualquer fixture.

**O contexto real dos dados está em `CONTEXTO.md`**, que é ignorado pelo git. Lá estão as
colunas reais de cada base, os valores de conferência, as armadilhas de formato e os números
de referência. Consulte-o para implementar; **nunca copie o conteúdo dele para cá, para
comentário de código, para mensagem de commit ou para teste.**

**Registre o que fizer** na seção 14.

---

## 1. O que este sistema é

Um inventário de emissões com três módulos e um painel consolidado.
**Somente relatórios de emissão** — sem cenários de redução, sem simulações, sem projeções.

| Módulo | Escopo GHG | Métrica exibida |
|---|---|---|
| Mobilidade casa-trabalho | Escopo 3, cat. 7 | kg CO₂ por funcionário por mês |
| Viagens corporativas | Escopo 3 cat. 6 / Escopo 1 | kg CO₂ por viagem |
| Transporte marítimo de importações | Escopo 3, cat. 4 | kg CO₂ por contêiner |
| Painel consolidado | — | toneladas de CO₂e por ano |

**Regra de exibição:** peso, volume, distância, tonelada-quilômetro e intensidade por quilo
são insumo de cálculo e **não aparecem na interface**.

### 1.1 O sistema tem duas partes separadas

**Inventário** — retrospectivo, alimentado por bases fechadas. Telas: Visão geral,
Mobilidade, Viagens, Marítimo, Método.

**Programa de viagens** — prospectivo, alimentado pelos próprios funcionários.
Telas: Registrar viagem, Emissões registradas.

A separação é visível na navegação e é conceitual: a primeira parte relata o que já
aconteceu, a segunda começa a medir daqui para a frente.

---

## 2. Repositório público: o que nunca entra no git

O repositório é público no GitHub. Trate tudo que segue como segredo.

### 2.1 Nunca versionar

- **Arquivos de base** — planilhas e JSON de mobilidade, viagens e importações, em qualquer
  formato, em qualquer pasta
- **Qualquer arquivo derivado deles** — JSON intermediário, CSV de conferência, dump de
  banco, backup, export de relatório
- **Variáveis de ambiente** — `.env` e todas as variantes
- **Credenciais** — service account do Firebase, chave de API de rotas, client secret do
  OAuth. **O JSON da service account nunca entra no repositório**, em nenhuma pasta
- **Identificadores da infraestrutura** — id do projeto Firebase, domínio do
  Workspace da empresa
- **Coordenada da fábrica** — é parâmetro de ambiente, nunca constante no código
- **Nomes reais** — de funcionários, de agentes de carga, de empresas do grupo, de clientes,
  de fornecedores, de navios
- **Volumes e valores reais** — emissão por agente, contagem de contêineres, número de
  embarques, número de respondentes, totais de conferência

### 2.2 Onde isso costuma vazar sem ninguém perceber

- **Seeds e fixtures.** Toda massa de teste é fictícia, inventada do zero. Nunca recortar
  linhas da base real, nem "só algumas para testar".
- **Testes.** Valores esperados em asserção viram dado público. Use números fictícios.
- **Comentários de código.** Não documente a base real dentro do código.
- **Mensagens de commit.** Não cite nome de empresa, de agente ou valor de emissão.
- **Snapshots e arquivos de saída de teste.**
- **Rótulo de interface.** É a via que ninguém revisa: dado real disfarçado de texto de
  UI. No protótipo, o nome de um agente de carga real aparece dentro de uma etiqueta de
  estado, e nomes de pessoas aparecem como conteúdo de tabela — coisas que passam por
  "texto da tela" numa revisão e entram no repositório público como constante. Título,
  etiqueta, legenda, subtítulo, placeholder e mensagem de erro seguem a mesma regra dos
  seeds: se o valor veio da base real, não entra.
- **README e documentação.** Descreva o sistema, não os dados.

### 2.3 `.gitignore`

Existe um `.gitignore` na raiz cobrindo os itens acima. **Mantenha-o atualizado**: ao criar
uma pasta nova que possa receber dado real, adicione a regra antes de rodar qualquer coisa
que escreva nela.

### 2.4 Antes do primeiro push

`.gitignore` não remove o que já foi commitado. Se algum arquivo de base já entrou no
histórico, ele continua público mesmo depois de apagado. Nesse caso o caminho é repositório
novo, não `git rm`. Avise o Gustavo se encontrar rastro assim.

---

## 3. Identificação de pessoas

**Regra geral: nas telas de inventário, nenhuma pessoa é identificável.**

### 3.1 Inventário — anônimo

Nas telas de Mobilidade, Viagens (histórico) e Marítimo:

- **Nunca exibir nome, matrícula, e-mail ou qualquer identificador de pessoa.** Nem em
  tabela, nem em tooltip, nem em legenda, nem em exportação.
- O identificador interno existe no banco para cálculo e deduplicação, mas **não é enviado
  ao cliente**. O agregado sai pronto do servidor.
- No radar de mobilidade, cada ponto é um funcionário **sem nenhum dado associado**. Sem
  tooltip, sem clique, sem nada que permita isolar um indivíduo.
- **O ângulo do radar não tem significado, e isso é uma decisão de privacidade, não
  preguiça de implementação.** O protótipo posiciona cada ponto por distância *e direção*
  em relação à fábrica. Raio e direção reais, juntos, formam um localizador quase único:
  apontam para uma casa mesmo sem nome, sem bairro e sem tooltip — é reidentificação por
  geometria. Direção também não é dado que o sistema possa ter, porque a §6.1 só permite
  persistir distância, bairro e cidade. O ângulo serve apenas para os pontos não se
  empilharem, e a tela declara isso em texto para ninguém ler um mapa onde não há mapa.
- **Supressão de grupos pequenos:** não exibir recorte com menos de 5 pessoas. Um bairro com
  um respondente identifica esse respondente mesmo sem o nome dele. Agrupe o que ficar
  abaixo do limite em "outros".

A base histórica de viagens contém nomes de passageiros. Eles são carregados para ligar a
viagem ao funcionário, e **não aparecem em tela nenhuma do inventário**.

### 3.2 Programa de viagens — identificado

Só aqui a pessoa aparece pelo nome:

- O viajante vê as próprias submissões, identificadas.
- Os perfis `admin` e `sustentabilidade` veem quem registrou cada viagem. É necessário para
  acompanhar adesão e corrigir lançamento errado.
- O perfil `gestor` **não vê nome nem aqui** — para ele o programa também é agregado.

---

## 4. Stack e infraestrutura

- **Next.js** (App Router) + **TypeScript**
- **Firestore** — banco de documentos, acessado só pelo **Admin SDK**, no servidor
- **Firebase Auth**, provedor Google, restrito ao domínio corporativo
- **Deploy: Vercel**
- Aplicação única, com telas e acessos variando por perfil

O Firebase é a plataforma dos demais sistemas internos da empresa: a autenticação
corporativa já está resolvida nesse ecossistema e o volume deste inventário é
pequeno — ordem de centenas a poucos milhares de documentos por ano. Não há ganho
prático em manter um banco relacional separado.

**Firebase Storage não é usado e não deve ser configurado.** Serviço sem uso é
credencial a mais para administrar. Ver seção 13.

Identidade visual: ver protótipo. Paleta `#618264` `#79AC78` `#B0D9B1` `#D0E7D2`, com
`#7BC258` (verde da FGV) reservado para marca, item ativo de menu e elementos vivos.

---

## 5. Perfis de acesso

Quatro papéis consultam o painel. O quinto não consulta nada — só alimenta.

| Perfil | Acesso |
|---|---|
| `admin` | Tudo |
| `sustentabilidade` | Inventário completo e programa (Diretoria/Sustentabilidade) |
| `gestor` | Indicadores agregados, sem nome de pessoa em nenhuma tela (Gestor de Área) |
| `importacao` | Somente módulo marítimo, podendo ser filtrado por empresa (Importação/Suprimentos) |
| `colaborador` | Somente registrar a própria viagem e ler as próprias submissões |

**`importacao` não vê a visão geral.** "Somente módulo marítimo" inclui o consolidado:
um total que soma um módulo só seria um número menor que o inventário apresentado como se
fosse o inventário — o erro que a §9.10 existe para impedir. A navegação não oferece a tela
e a consulta recusa quem chegar pela URL. Recusar ali é o comportamento correto, não um bug.

### 5.1 `colaborador` é o papel de menor privilégio

É o único perfil usado por gente de fora da equipe do inventário, e por isso o
escopo dele é fechado e explícito:

- **Pode criar registro de viagem e ler apenas os próprios.**
- **Não acessa o painel**, não vê dado de terceiro, não vê agregado.
- A verificação é **na consulta, filtrando pelo uid do próprio usuário** — nunca
  escondendo item de menu.

Autorização aplicada **no servidor, dentro de cada consulta**, junto do dado.
Esconder item de menu não é controle de acesso.

**Não existe tela de upload de arquivo.** A carga das bases é feita por script, rodado pelo
Gustavo fora da aplicação.

---

## 6. Módulo Mobilidade

Fonte: planilha da pesquisa de mobilidade, aba única de respostas. Colunas, tipos,
armadilhas de formato e distribuição atual estão em `CONTEXTO.md`.

### 6.1 Restrição obrigatória de privacidade

**O endereço não entra no banco.** O script de ingestão geocodifica a partir do CEP, calcula
a distância até a fábrica e grava **apenas distância, bairro e cidade**. CEP, logradouro,
número e complemento são descartados após o cálculo e nunca são persistidos — nem em coleção
de staging, nem em log, nem em cache, nem em arquivo temporário.

### 6.2 Regras de cálculo

- Dois deslocamentos por dia útil (ida e volta).
- Dias úteis por mês: parâmetro configurável, não constante no código.
- Coordenada da fábrica: variável de ambiente.
- Bicicleta e deslocamento a pé: emissão zero.
- Ônibus: fator de transporte público, por passageiro-km.
- Respostas marcadas como exceção não entram na média e são listadas na tela de método.

O campo de combustível só é válido para modais motorizados; preenchido em modal não
motorizado, ou vazio em modal motorizado, é erro de entrada e deve ser sinalizado.

---

## 7. Módulo Viagens corporativas

Cobre **aéreo** e **carro**, com duas fontes separadas por data.

| Período | Fonte | Situação |
|---|---|---|
| Até a data de corte | Relatório da agência | Histórico congelado, carga única, **imutável** |
| Até a data de corte | Planilha do cartão empresarial | Viagem que não passa pela agência |
| A partir da data de corte | Formulário do viajante | Fonte oficial |

**A planilha do cartão é uma terceira fonte, não um complemento da agência.** São
viagens pagas no cartão empresarial, que por isso não aparecem no relatório da agência —
foi assim que as viagens intercontinentais entraram no inventário. Ela tem escopo de recarga
próprio (`fonte = cartao`), então regravá-la não enxerga nem apaga o que veio das outras
duas fontes.

Três coisas dela mudam o número e ficam declaradas na tela de método:

- **a distância é calculada na carga**, pela ortodrômica entre os aeroportos com o uplift
  aplicado, porque a planilha não traz distância — ao contrário da base da agência, em que
  ela já vem pronta e com o uplift embutido (§7.2);
- **a data vale para o bloco inteiro.** A planilha traz data só na primeira linha de cada
  viagem, e os demais trechos herdam. Para o total do ano não muda nada; para a série
  mensal, um trecho de volta pode cair no mês seguinte e ser contado no anterior;
- **o viajante vem só pelo primeiro nome.** Nome de uma palavra não identifica ninguém, e
  vincular pelo palpite atribuiria a viagem à pessoa errada e estragaria a contagem de
  pessoas distintas que sustenta a supressão (§3.1). Quem não casa com o cadastro entra como
  registro próprio desta fonte, com alerta no trecho.

**A data de corte ainda não está definida.** O `30/09/2026` que circulou em versões
anteriores deste documento era exemplo, não compromisso. Enquanto a data real não for
decidida, ela é **parâmetro de ambiente**, nunca constante no código nem literal em teste —
o mesmo tratamento dado à coordenada da fábrica. Quem define é o Gustavo, junto com o
anúncio do programa aos colaboradores.

**O corte é pela data do voo ou da viagem, não pela data de preenchimento nem pela data de
lançamento da passagem.** O formulário recusa viagem com partida anterior à data de corte.

Toda viagem carrega `fonte` (`agencia` | `formulario`).

**Na série mensal, marcar visualmente a troca de fonte no mês da data de corte.** Nos
primeiros meses a adesão será parcial e a emissão vai parecer cair sem ter caído.

### 7.1 Base histórica

Vem de um JSON já consolidado e validado, com aeroportos, companhias, pessoas e reservas
contendo trechos. Estrutura, valores de conferência e regras específicas em `CONTEXTO.md`.

**Reimplemente o cálculo e confira contra o valor de conferência antes de seguir.**

### 7.2 Regras de cálculo aéreo

```
kg_co2e = trecho.distancia_km
        × fator_da_faixa_de_distancia
        × multiplicador_classe
        × trecho.passageiros
```

- **A unidade de cálculo é o trecho, não a reserva.** Cada trecho é um passageiro.
- Na base histórica, `distancia_km` **já inclui o uplift de 8%** sobre a ortodrômica. Não
  aplicar de novo. No formulário, a distância é calculada do zero e o uplift **precisa** ser
  aplicado.
- **Ignorar reservas com `contabilizar: false`** — são itinerários duplicados no relatório
  da agência.
- **Agrupar o inventário pela data do voo, nunca pela data de lançamento da passagem.** Há
  passagem emitida num ano com voo no ano seguinte.
- O relatório não informa a cabine. Classe econômica é assumida em todos os trechos, e isso
  é declarado na tela de método.
- Escalas contam como trechos separados e emitem mais que um voo direto equivalente.

Fatores: DEFRA/UK DESNZ, kg CO₂e por passageiro-km, **com forçamento radiativo**, por faixa
de distância. Os valores vêm do JSON da base, carregados para a coleção `fatorEmissao`.

Na base de origem, quem aprovou a passagem às vezes é a agência e às vezes o próprio
passageiro. **Para emissão, o que vale é quem viajou, não quem aprovou.**

### 7.3 Formulário de viagens

Quem viajou preenche. **Não há fluxo de aprovação** — se a viagem aconteceu, já foi aprovada
antes. O viajante vê apenas as próprias submissões e pode editar enquanto o período não for
fechado.

Ao enviar, o sistema devolve na hora a emissão calculada. Esse retorno imediato é o
principal incentivo de adesão; não omitir.

**O formulário existe para centralizar num lugar só a informação de deslocamento
que hoje não está em sistema nenhum.** Peça o mínimo necessário para calcular
emissão: origem, destino, data e modal. **Não peça valor, não peça justificativa,
não peça aprovação.** Quanto mais curto o formulário, maior a chance de ser
preenchido — e nenhum desses campos entra no cálculo.

**Campos comuns:** viajante (do login), data de ida, data de volta.

**Aéreo:** um ou mais trechos com aeroporto de origem e destino, em autocomplete sobre a
coleção de aeroportos. Botão para gerar o trecho de volta.

**Carro:** lista ordenada de municípios — origem, paradas intermediárias, destino. Botões
"adicionar parada" e "retornar à origem". A distância é a soma dos trechos consecutivos.

Campos adicionais do carro — os três entram na conta, por isso são exceção à regra
do formulário mínimo:
- `propriedadeVeiculo`: `frota` | `proprio` | `locado`
  → **`frota` é Escopo 1; `proprio` e `locado` são Escopo 3.** Gravar o escopo resolvido.
- `combustivel`: `gasolina` | `etanol` | `diesel` | `flex`
- `ocupantes`: inteiro ≥ 1. A emissão é do veículo. Dividir pelo número de ocupantes ao
  atribuir por pessoa, e deixar a regra explícita na interface.

### 7.4 Distância rodoviária

Distância **rodoviária**, nunca ortodrômica. Em trajetos regionais a diferença passa de 25%,
é irregular e não se corrige com fator fixo.

- Provedor: **Google Routes API**, decidido em 15/09/2026. O OpenRouteService foi testado
  contra a base real e reprovado: a cota diária do plano gratuito não suporta recarregar a
  pesquisa mais de uma vez no mesmo dia, e cota esgotada derruba a carga. Geocodificação
  também é do Google, pelo mesmo teste — o provedor gratuito devolve a coordenada do
  município para a maioria dos CEPs. **A troca de provedor muda o número**, por isso está
  declarada na tela de método (§10) e não é tratada como detalhe de infraestrutura.
- **Cachear toda rota no banco**, com chave = sequência ordenada de códigos IBGE. As rotas
  da empresa se repetem muito.
- Seleção de município via **lista do IBGE embarcada na aplicação** (5.570 registros), não
  campo de texto livre. Elimina ambiguidade de grafia e é o que torna o cache eficaz.

---

## 8. Módulo Transporte marítimo

Fonte: relatório do agente de carga, exportado de sistema de gestão de embarques, com abas
de detalhe por agente e uma aba de resumo montada manualmente. Estrutura, armadilhas e
números de referência em `CONTEXTO.md`.

### 8.1 Como o CO₂ é alocado

A emissão informada pelo agente é alocada **por contêiner, por corredor**, não por peso. Na
mesma rota o CO₂ por quilo varia até dez vezes, enquanto o CO₂ por contêiner é estável.

**Não recalcular por tonelada-quilômetro.** O valor do agente é o dado primário. O CO₂ por
contêiner é o teste de sanidade da ingestão: linha muito fora da mediana do corredor é
sinalizada para revisão.

**Não reproduzir a metodologia da aba de resumo.** Ela deriva peso a partir de contagem de
contêiner com uma constante e depois deriva contagem a partir do peso — a conta é circular,
e a constante usada está acima da média real.

### 8.2 Estimativa dos agentes sem detalhe

Nem todos os agentes entregam detalhe linha a linha. Cascata, do mais específico para o mais
genérico:

1. `medido` — CO₂ informado pelo agente para aquele embarque
2. `estimado_corredor` — contêineres reais × média de CO₂/contêiner do corredor
3. `estimado_media` — contêineres reais × média geral de CO₂/contêiner
4. `estimado_peso` — último recurso, só se nem a contagem de contêiner existir

Gravar `nivelDado` em todo documento. No rodapé do módulo, uma linha de texto:
*"X% deste número vem de dado do agente, o restante é estimativa por média."*

### 8.3 Regras de ingestão

- **Localizar a linha de cabeçalho pelo conteúdo**, nunca por índice fixo — ela muda de
  posição entre abas.
- **As colunas mudam entre abas.** Tratar coluna ausente como ausente, não como erro fatal.
- **Há linhas de total dentro das abas de dados.** Descartar toda linha sem identificador de
  embarque.
- **Usar a coluna numérica de quantidade de contêineres**, mais confiável que fazer parse do
  texto de tipo de contêiner, que vem nulo em algumas linhas.
- **Embarques ainda não embarcados já vêm com CO₂ lançado.** É previsão, não realizado. Flag
  própria, com opção de excluir do total.
- **Há carga aérea de fornecedor no arquivo.** É Escopo 3 cat. 4, frete upstream. **Não
  confundir com o módulo de viagens**, que é passageiro, cat. 6.
- **Abas de template do sistema de origem são lixo.** Ignorar.
- **A aba de detalhe e a de resumo usam bases de data diferentes.** Escolher uma, aplicar em
  todo o sistema e declarar qual é na tela de método.
- Linha cuja ordem de grandeza é incompatível com o restante **não é importada** até ser
  conferida na origem.

---

## 9. Modelo de dados

Firestore, coleções de topo e documentos rasos. **Nenhuma tela lê coleção direto:**
tudo passa pela camada de consulta agregada da seção 9.9, que é onde moram o
anonimato e a supressão de grupos pequenos.

### 9.1 Princípios

1. **Um documento por unidade de emissão** — um trecho, uma resposta de mobilidade,
   um embarque. **Sem array aninhado de trechos.** Viagem com conexão vira dois
   documentos ligados pelo mesmo `reservaId`.
2. **Campos de filtro desnormalizados em todo documento:** `ano`, `mes`, `empresa`
   e `modal`. É o que permite usar `where()` quando o volume crescer.
3. **Todo documento de emissão guarda a emissão calculada E o fator usado**, com
   versão. Fator muda todo ano e o inventário precisa ser auditável: sem essa
   marca não dá para saber o que foi calculado com qual fator.
4. **Data é sempre string `AAAA-MM-DD`.** Nunca `Timestamp` do Firestore — é o que
   evita os bugs de fuso UTC/São Paulo, mesmo padrão já adotado no sistema de
   controle de férias.
5. **Sem contador agregado.** Neste volume a agregação é feita no servidor, lendo
   a coleção e reduzindo em JavaScript. Contador pré-calculado desincroniza em
   silêncio e trava a criação de cortes novos.
6. **Saldo e total são sempre calculados, nunca armazenados.**
7. **ID de documento é determinístico**, derivado da origem. Recarregar sobrescreve
   em vez de duplicar — é o que substitui o índice único do modelo anterior.

### 9.2 Coleções

```
funcionario/{matriculaOuChaveDeOrigem}
mobilidade/{anoBase}_{matricula}
viagemTrecho/{fonte}_{refOrigem}_{ordem}
embarque/{agente}_{shipmentId}
containerPortoMes/{ano}_{mes}_{porto}
fatorEmissao/{categoria}__{chave}__{versao}__{vigenciaInicio}
aeroporto/{iata}
municipio/{codigoIbge}
rotaCache/{chave}
usuarioPerfil/{uid}
```

### 9.3 Por que três coleções de emissão, e não uma

Mobilidade é **taxa mensal**; viagem e embarque são **eventos**. Somar os dois num
mesmo `sum(co2)` produz número errado sem nenhum sinal de erro. Coleções separadas
tornam a mistura impossível por descuido, e todo documento ainda carrega
`periodicidade` (`mensal` | `evento`) para que a consolidação seja explícita.

### 9.4 Envelope comum das coleções de emissão

Todo documento de `mobilidade`, `viagemTrecho` e `embarque` carrega:

```
modulo          'mobilidade' | 'viagens' | 'maritimo'
modal           'aereo' | 'terrestre' | 'maritimo'
escopo          1 | 3
periodicidade   'mensal' | 'evento'
ano             number             -- 2026
mes             'AAAA-MM' | null   -- null só onde não se aplica (ver 9.5)
empresa         string | null      -- nulo é categoria visível, ver 9.9
fator           { categoria, chave, versao, valor, unidade, vigenciaInicio }
alertas         [{ tipo, descricao, severidade }]
alertasCodigos  [string]
atualizadoEm    'AAAA-MM-DD'
```

`alertas` guarda o detalhe e é sempre lido junto do documento. `alertasCodigos`
existe porque **array de objeto não é indexável de forma útil no Firestore**: é ele
que permite `array-contains` para responder "todos os trechos com suspeita de
duplicidade" sem varrer a coleção.

**Não existe campo de valor, custo, orçamento ou aprovação financeira em nenhuma
coleção.** Isto é inventário de emissões, não controle de gastos.

### 9.5 `mobilidade` — uma resposta da pesquisa

```
funcionarioId, anoBase, transporte, combustivel, distanciaKm,
bairro, cidade, diasUteisMes, co2KgMes, excecao, motivoExcecao
```

**Sem endereço.** Ver 6.1: só distância, bairro e cidade.

`periodicidade: 'mensal'` e o valor se chama `co2KgMes`, com a unidade no nome. `mes`
é nulo: a pesquisa é anual e o valor vale para todo mês do ano-base — na série
mensal o mesmo valor se repete nos doze meses, e isso é declarado na tela de método.

### 9.6 `viagemTrecho` — um documento por trecho

```
reservaId, ordem, funcionarioId, criadoPorUid,
tipo('aereo'|'carro'), fonte('agencia'|'formulario'), contabilizar,
dataIda, dataVolta, origem, destino, companhia, voo, dataVoo,
distanciaKm, faixaDistancia, passageiros, co2Kg
aereo: classeCabine, multiplicadorClasse
carro: propriedadeVeiculo, combustivel, ocupantes
```

`fator` carimba o fator por faixa; o multiplicador de classe é o outro termo da
conta (§7.2) e fica em campo próprio, senão a emissão do trecho não é
reproduzível a partir do documento.

`reservaId` é o que liga os trechos da mesma viagem. `ano` e `mes` saem **da data do
voo**, nunca da data de lançamento da passagem (§7.2). `criadoPorUid` é o que
permite ao `colaborador` ler apenas as próprias submissões (§5.1).

### 9.7 `embarque` — um embarque do relatório do agente

```
agente, empresa, shipmentId, houseRef, trans, mode,
portoOrigem, portoDestino, navioPartida, navioTransbordo,
etd, eta, atd, ata, pesoKg, volumeM3, containers,
co2Kg, nivelDado, status, previsao
```

`ano` e `mes` saem da base de data escolhida na §8.3, e qual é fica declarado na
tela de método.

### 9.8 `fatorEmissao` e apoio

```
fatorEmissao   categoria, chave, valor, unidade, fonte, versao,
               vigenciaInicio, vigenciaFim
aeroporto      iata, nome, cidade, uf, utcOffset, latitude, longitude
municipio      codigoIbge, nome, uf, latitude, longitude
rotaCache      sequenciaIbge, distanciaKm, provedor, calculadoEm
usuarioPerfil  email, papel, empresa, funcionarioId
funcionario    matricula, nome, email, departamento, ativo, chaveOrigem
               -- SEM endereço. Ver 6.1.
```

**Fatores ficam em coleção, com vigência — nunca hardcoded.** **Se um fator não
estiver lá, o cálculo falha explicitamente em vez de usar um padrão.** Não inventar
valor nem assumir número de memória. A coleção é pequena: lê-se inteira e filtra-se
a vigência em JavaScript, sem índice composto.

**A granularidade da falha é o registro, não a carga.** Na mobilidade, combinação
de modal e combustível sem fator é **erro de dado, não modal a estimar**: moto a
diesel e moto elétrica não têm fator de propósito. A resposta recebe alerta, vira
exceção com motivo, fica fora da média e aparece na tela de método — e o restante
da carga continua. Uma linha ruim não derruba as outras, e nenhuma delas recebe
valor aproximado.

Nas viagens a política é outra, de propósito: o fator aéreo vem do próprio arquivo
da base e é carregado pelo seed. Ausência ali não é erro de uma linha, é sinal de
que o seed não rodou ou de que a base está inconsistente — e continuar
subestimaria o inventário em silêncio. Por isso a carga de viagens para.

`usuarioPerfil.empresa` existe para o perfil `importacao`, que pode ser filtrado por
empresa (§5).

### 9.9 O que o banco não garante mais

O modelo relacional recusava dado inválido. O Firestore aceita qualquer coisa, então
estas regras passam a ser **validação obrigatória na escrita**, num único ponto por
coleção — se não estiverem no código, não existem:

- `escopo` só pode ser 1 ou 3;
- `propriedadeVeiculo: 'frota'` obriga `escopo: 1`; `proprio` e `locado` obrigam 3;
- `ocupantes` inteiro ≥ 1; `passageiros` inteiro ≥ 1;
- `distanciaKm` ≥ 0;
- `vigenciaFim`, quando existe, é posterior a `vigenciaInicio`;
- toda data casa com `AAAA-MM-DD`;
- `ano` e `mes` batem com a data de referência do próprio documento.

Apagar documento não tem cascata, e não existe `DELETE WHERE`. Regravar um período
acontece **nesta ordem, que não é a intuitiva**:

1. gravar todos os documentos da carga nova, sobrescrevendo pelo ID determinístico;
2. só então apagar, do mesmo escopo, o que não está na carga nova.

Apagar primeiro abriria uma janela com o inventário vazio, e uma falha no meio da
escrita deixaria o período sem dado nenhum. Nesta ordem o pior caso é sobra de
documento antigo, que a execução seguinte limpa — nunca falta.

**Carga que não produziu documento nenhum é recusada**, porque apagaria o escopo
inteiro sem nada no lugar; quase sempre é erro de leitura do arquivo. Esvaziar de
propósito é opção explícita.

### 9.10 Agregação e camada de consulta

A agregação acontece no servidor, lendo a coleção e reduzindo em JavaScript, dentro
de **um único módulo de consulta**, em `src/server/consultas`. Nenhuma tela alcança
a coleção por fora dele — e isso é verificado por teste, não só combinado.
É esse módulo que garante, para as telas de inventário:

- nenhum identificador de pessoa no que sai (§3.1);
- supressão de recorte com menos de 5 pessoas, agrupado em "outros" (§3.1);
- **nulo é categoria visível, não registro ausente.** Ao agrupar por `empresa`, os
  documentos sem empresa aparecem como fatia própria, "Sem empresa". **O total
  geral sempre bate com a contagem de documentos da coleção; se não bater, é bug.**
  Inventário com registro sumindo de agregação é erro que só aparece em auditoria.

---

## 10. Telas

**Inventário**

1. **Visão geral** — total do ano em tCO₂e, faixa proporcional dos três módulos, três cartões
   de indicador, emissão mês a mês.
2. **Mobilidade** — kg CO₂ por funcionário/mês, total no ano, distância média, radar de onde
   o quadro mora, emissão por modal.
3. **Viagens** — kg CO₂ por viagem, total, mapa de rotas, destinos mais frequentes, emissão
   por mês.
4. **Marítimo** — kg CO₂ por contêiner, total, mapa de rotas com navios em movimento, emissão
   por mês, contêineres por porto, tabela de corredores.
5. **Método** — fontes, fatores com vigência, qualidade do dado, alertas e exceções.

A tela de Método é onde cada escolha que muda o número fica registrada. No mínimo:
provedor de geocodificação e de roteamento (§7.4), base de data escolhida no marítimo
(§8.3), classe econômica assumida no aéreo (§7.2), um ocupante por carro e por moto na
mobilidade (§6.2), repetição do valor anual da mobilidade nos doze meses (§9.5), fatores
com fonte e vigência, e a lista de exceções com motivo.

**Programa de viagens**

6. **Registrar viagem** — formulário, com resultado imediato da emissão.
7. **Emissões registradas** — registradas no período, emissão acumulada, cobertura, últimas
   viagens, participação de avião e carro.

Comportamento visual, animações e detalhe de layout: seguir o protótipo.

### 10.1 Cortes que o painel oferece

São quatro, e só esses:

- **por período** — ano e mês;
- **por modal** — aéreo, marítimo, terrestre;
- **por rota ou destino**;
- **por empresa**, nos módulos onde essa informação existe.

Não há corte por centro de custo, por valor ou por qualquer dimensão financeira.

Em qualquer agrupamento vale a regra da 9.10: **nulo é categoria visível.** Agrupar
por empresa mostra "Sem empresa" como fatia própria, e o total geral bate com a
contagem de documentos da coleção.

---

## 11. Segurança e LGPD

O sistema fica público na Vercel. Regras não negociáveis:

1. **Endereço de funcionário não entra no banco.** Só distância e localização em
   nível de bairro e cidade.
2. **Todo acesso a dado é server-side.** O cliente **nunca consulta o Firestore
   diretamente**: quem lê e escreve é o Admin SDK, dentro de Server Components e
   Route Handlers do Next.js. O cliente recebe apenas o agregado que a tela
   desenha. Nenhuma variável `NEXT_PUBLIC_` com credencial ou dado de pessoa. A
   service account é env var de servidor.
3. **Autorização verificada na consulta**, junto do dado — nunca só na interface.
   Para o `colaborador`, isso é o filtro pelo uid dele (§5.1).
4. **Login via Firebase Auth com provedor Google**, restrito ao domínio corporativo.
5. **Nenhum identificador de pessoa trafega para o cliente nas telas de inventário.**
6. **Firestore Security Rules negam tudo por padrão** — leitura e escrita. Como o
   acesso é server-side pelo Admin SDK, que passa por cima das rules, uma regra
   aberta só existiria para ser explorada. As rules ficam versionadas no
   repositório e são a última linha de defesa se um dia algum caminho de cliente
   for aberto por engano.

7. **Credencial exposta é credencial rotacionada**, mesmo sem commit. Chave que passou
   por arquivo versionado, por log ou por mensagem, ainda que nada tenha subido, conta
   como comprometida: não há como provar por onde mais ela passou — backup do editor,
   índice de busca, extensão, pasta sincronizada. Rotacionar é barato; auditar o que não
   deixa rastro, não.
8. **Chave de provedor pago é restrita na origem.** As chaves do Google usadas em
   geocodificação e roteamento ficam limitadas por API e, onde o IP de origem for estável,
   por IP. Onde não for, o controle é teto de faturamento com alerta. Chave de API paga
   sem restrição não é só risco de privacidade: é conta a pagar.

9. **O cookie de sessão carrega quatro atributos, e cada um fecha uma porta.**
   `httpOnly`, para que o JavaScript da página não alcance o cookie e um XSS não
   vire roubo de sessão. `secure`, para o cookie não trafegar em claro — em
   produção sempre; em desenvolvimento local ele fica desligado porque o
   navegador recusaria um cookie `secure` em http e ninguém conseguiria entrar.
   `sameSite: lax`, que não envia o cookie em requisição disparada por outro
   site e é o que fecha o CSRF do caminho de escrita da §10.6, sem quebrar quem
   chega por um link externo. E `path` na raiz: uma sessão para o sistema
   inteiro. **O cliente nunca lê nem escreve esse cookie**; quem o emite e quem
   o apaga é o servidor.

10. **A sessão dura doze horas.** O Firebase aceita até quatorze dias, e
    quatorze dias seria conveniência cara: este sistema mostra dado de pessoa, e
    a sessão de um notebook esquecido aberto continuaria válida por duas
    semanas. Doze horas cobrem um dia de trabalho de ponta a ponta e expiram
    antes da manhã seguinte; renovar é um clique, com a conta já escolhida.
    Encurtar é sempre aceitável, esticar é decisão que precisa de motivo.

11. **Sair revoga no servidor, não só no navegador.** Apagar o cookie do
    navegador não invalida nada: quem tiver copiado o valor continua entrando
    com ele até expirar. O logout chama `revokeRefreshTokens`, que move o marco
    de validade da conta para agora, e a verificação da requisição seguinte
    recusa qualquer cookie emitido antes disso. O efeito alcança todas as
    sessões daquela pessoa, em todos os dispositivos — para este sistema, sair
    é sair.

12. **Papel revogado ou trocado vale na requisição seguinte.** O papel **nunca
    vem do token**: ele é lido de `usuarioPerfil/{uid}` a cada requisição, junto
    da verificação de revogação. Token não carrega papel de propósito — token
    velho continuaria valendo depois de o acesso ter sido tirado. Rebaixar um
    perfil tem efeito imediato sem deslogar ninguém; remover o perfil derruba
    também a sessão aberta, e quem estava dentro é mandado para a tela de
    entrada, que explica o que houve em vez de devolver erro de servidor.
    Conceder e revogar acontecem **fora da aplicação**, por script, como as
    cargas — não existe tela que dê acesso a alguém.

**Verificar o sistema antigo:** na versão estática, as bases iam para o build. Se o JSON de
viagens (com nome de passageiro) ou a base de mobilidade (com CEP e logradouro) estiverem
acessíveis pelo navegador, é vazamento ativo hoje.

---

## 12. Fora de escopo

- Cenários de redução, simulações e projeções de qualquer tipo
- Tela de upload de arquivo
- Reconstrução do cálculo marítimo por tonelada-quilômetro
- Reprocessamento do relatório bruto da agência (o JSON consolidado já é o resultado)
- Separação de CO₂ biogênico do etanol
- **Qualquer campo de valor, custo, orçamento ou aprovação financeira.** Isto é
  inventário de emissões, não controle de gastos. Também não há centro de custo:
  o corte por área não é dimensão deste sistema
- **Firebase Storage** — não configurar, não criar regra, não adicionar dependência
- Contador agregado, saldo armazenado ou qualquer total pré-calculado (§9.1)
- Mecanismo de cobrança, validação cruzada ou fluxo de aprovação do registro de
  viagem do colaborador. Assume-se que os colaboradores vão registrar

---

## 13. Pontos em aberto

Coisas que provavelmente vão acontecer, mas não agora.

- **Storage voltará junto com uma tela de admin.** Hoje a ingestão das bases é por
  arquivo processado fora do sistema. No dia em que existir tela de administração
  para subir a planilha da agência ou o arquivo marítimo, o Storage entra — é
  provável que aconteça, só não agora.
- **`empresa` nasce parcialmente preenchida.** A base marítima já traz a empresa
  por embarque; mobilidade e viagens nascem com o campo nulo até a origem passar a
  informar. O campo existe desde já porque acrescentar campo depois, em base
  existente, é migração de backfill — e o nulo é tratado como categoria visível
  (§9.10), não como registro ausente.
- **Fatores da mobilidade** não vêm de nenhuma base do inventário: são escolha
  metodológica de quem assina o relatório e entram por arquivo próprio.
- **Data de corte entre agência e formulário** (§7) — ainda não decidida. Depende do
  anúncio do programa aos colaboradores, não do código.
- **Módulo marítimo não começou.** É o que falta para o painel consolidado deixar de ser
  parcial.
- **Chaves do Google separadas por função e por destino** (§11.8). Já estão separadas por
  API — uma para geocodificação, outra para roteamento —, porque restringir uma chave única
  a uma API derrubaria a chamada da outra ponta. Falta a separação por **destino**: a chave
  usada nas cargas roda da máquina de quem opera e admite restrição por IP; a que o
  formulário vai usar sairá da Vercel, cujo IP de saída não é estável, e nessa ponta o
  controle é restrição por API mais teto de faturamento com alerta. Nada disso é código:
  é configuração no console do Google, e entra quando o formulário existir.
- **O provedor de rota não fica carimbado no documento.** O documento de emissão carimba o
  fator (§9.1), não o provedor de geocodificação nem o de roteamento — então a tela de
  método declara a configuração **atual** do ambiente, e não necessariamente a que produziu
  a carga que está no banco. Enquanto a carga for manual e rara, a diferença é teórica;
  quando deixar de ser, o caminho é carimbar o provedor junto do fator.
- **Das sete telas da §10, só a de Método existe**, junto da entrada e da casca de
  navegação. Faltam Visão geral, Mobilidade, Viagens, Marítimo e as duas do programa de
  viagens. A Visão geral fica por último de propósito: enquanto o marítimo não existir, ela
  mostraria dois terços do inventário como se fosse o total.

---

## 14. Registro de execução

**Seção mantida pelo Claude Code.** Registrar em ordem cronológica: o que foi implementado e
quando; correções pedidas pelo Gustavo e o que mudou; bugs encontrados e como foram
resolvidos; decisões técnicas tomadas durante a implementação que não estavam neste
documento.

**Sem dado real nas entradas** — descreva o que mudou, não os números que apareceram.

### Histórico

<!-- adicionar entradas abaixo -->

#### 2026-09-14 — Fundação e carga de viagens

Etapa de fundação e dados. Nenhuma tela construída.

**Projeto**

- Next.js (App Router) + TypeScript + Tailwind. Só o shell: `layout`, uma página
  de espaço reservado e a paleta da §4 como tokens de tema. `.gitignore` não foi
  tocado.
- Raiz do Turbopack fixada em `next.config.ts`: existe um lockfile em diretório
  acima e o build inferia a raiz errada.

**Banco**

- Schema Drizzle com as tabelas da §9 e as migrations `0000_inicial` e
  `0001_views`. Geradas, não aplicadas.
- `0001_views` cria as views de viagens (mensal, destino, rota, resumo, alertas)
  e a de fatores vigentes para a tela de método. Todas agregadas, todas sem
  identificador de pessoa, todas filtrando `contabilizar`. As views de
  mobilidade e marítimo entram junto com a carga de cada módulo.
- Restrições que travam regra de negócio no próprio banco: escopo só 1 ou 3;
  carro de frota obriga escopo 1 e próprio/locado obrigam escopo 3; ocupantes
  ≥ 1; vigência de fator coerente.
- Colunas de CO₂ com escala 6. Com escala 3 o arredondamento por trecho
  acumulava o bastante para a conferência do total não fechar.

**Scripts**

- `seed-fatores.ts` — carrega os fatores aéreos do JSON da base para
  `fator_emissao`, com fonte, versão e vigência. Reexecutável: identifica a
  linha por (categoria, chave, versão, início de vigência).
- `ingest-viagens.ts` — carrega aeroportos, funcionários, viagens, trechos e
  alertas. Cálculo por trecho, sem reaplicar uplift, agrupando por data do voo,
  usando quem viajou e não quem aprovou. Reservas com `contabilizar: false` são
  gravadas com a emissão calculada e ficam fora do inventário pelo próprio flag.
  Regravação acontece dentro de transação e só apaga o que veio da agência.
- `verificar.ts` — recalcula a partir do banco e compara com os valores de
  conferência, imprimindo esperado, obtido e diferença; sai com 1 se não bater.

**Decisões que não estavam no documento**

- **De onde vêm os valores esperados da conferência.** Total de conferência é
  dado que não se versiona (§2.1), então nenhum valor esperado está no código.
  `verificar.ts` os lê do próprio arquivo da base, refaz a conta de forma
  independente a partir dele e aceita um `conferencia.local.json` na raiz para
  valores vindos de outra fonte. O nome já cai na regra `conferencia*` do
  `.gitignore`.
- **Duas colunas técnicas fora da §9.** `funcionario.chave_origem` e
  `viagem.ref_origem` guardam o identificador da pessoa e da reserva no arquivo
  de origem. Sem elas a carga não é idempotente: reprocessar duplicaria
  funcionário e viagem. Nenhuma das duas vai para o cliente.
- **Limites de faixa também viram linha em `fator_emissao`.** Os quilômetros que
  separam as faixas fazem parte da definição do fator; guardados na tabela, o
  cálculo do formulário não vai precisar de número no código.
- **Vigência do fator é informada na carga**, por variável de ambiente ou
  argumento. Sem vigência o script recusa a carga em vez de escolher uma data.
- **O escopo do aéreo é gravado como 3** e o resolvido do carro sai de
  `propriedade_veiculo`, conforme §7.3.
- **Alerta de fonte sobreposta.** A carga marca a viagem cujo voo cai em
  `VIAGENS_CORTE_FONTE` ou depois — período em que a fonte oficial já é o
  formulário.

**Bug encontrado durante a implementação**

- Importar uma função de um script disparava a carga inteira, porque a chamada
  do `main` estava solta no topo do módulo. Resolvido com `ehEntrada()`, que só
  executa quando o módulo é chamado direto pela linha de comando.

**Validação**

- `tsc --noEmit` e `next build` passam. Nenhum servidor de desenvolvimento foi
  subido.
- O cálculo aéreo foi reimplementado e conferido contra o valor de conferência
  da base antes de seguir, com um arquivo de ensaio temporário que foi apagado
  em seguida. Bateu exatamente, em distância e em emissão, e a classificação de
  faixa reconstruída a partir dos limites gravados reproduziu a da base em todos
  os trechos. `seed-fatores`, `ingest-viagens` e `verificar` ainda não foram
  executados contra um banco.
- `git init` rodado e conferido em modo simulado: nenhuma base, nenhum `.env`,
  nenhum arquivo de conferência e nenhum derivado entram no commit. Nada foi
  commitado nem enviado.

**Pendências desta etapa**

- ~~A estrutura de pastas citada na conversa não chegou junto; foi usada a
  convenção `src/app`, `src/db`, `src/lib`, `scripts` e `drizzle`.~~
  Confirmada pelo Gustavo em 14/09/2026: é essa mesma.
- `npm audit` aponta 4 alertas moderados, todos no `esbuild` que vem dentro do
  `drizzle-kit` e restritos ao servidor de desenvolvimento dele. A correção
  automática rebaixaria o `drizzle-kit` vários majors; ficou como está.

#### 2026-09-14 — Ingestão de mobilidade

**Carga**

- `scripts/ingest-mobilidade.ts` — lê a planilha da pesquisa, geocodifica pelo
  CEP, calcula a distância até a fábrica e grava distância, bairro e cidade. As
  colunas de logradouro, número e complemento não chegam a ser lidas; o CEP
  existe só entre a leitura da linha e a geocodificação, e não vai para o banco,
  para log, para cache nem para arquivo temporário. Recarregar substitui o
  ano-base inteiro, dentro de uma transação.
- `scripts/seed-fatores-mobilidade.ts` — carrega os fatores da mobilidade de um
  arquivo que quem assina o relatório monta com a fonte adotada. O script valida
  a forma e recusa fator onde ele não se aplica, mas não traz valor nenhum.
- `scripts/verificar.ts` ganhou o bloco de mobilidade: recalcula a emissão a
  partir do que está gravado e compara com o gravado, confere que modal de
  emissão zero não tem emissão e confronta a contagem de registros com a de
  respostas do arquivo de origem.

**Banco**

- `0002_mobilidade_alerta` cria a tabela de alertas do módulo. A §9 não a
  previu, mas a §6.2 manda sinalizar erro de entrada e a §10.5 manda mostrar —
  sem ela o alerta não teria onde morar.
- `0003_views_mobilidade` cria as views do módulo e a função
  `fgv_supressao_minima()`. A supressão de grupos pequenos acontece dentro do
  banco: recorte abaixo do limite vira "outros" antes de qualquer coisa sair
  dali. O limite padrão é o da §3.1 e pode ser elevado por conexão, sem
  migration.
- A view do radar devolve só a distância, sem nenhum outro campo — é o que a
  §3.1 pede para o ponto do funcionário.

**Decisões que não estavam no documento**

- **Leitura do "modal motorizado" da §6.2.** O campo de combustível passou a
  valer para carro e moto, onde o deslocamento queima o combustível do próprio
  respondente. Ônibus é motorizado, mas o fator é por passageiro-km e não
  depende de combustível, então resposta preenchida ali é sinalizada como erro
  de entrada sem tirar a linha da média. A leitura precisa aparecer na tela de
  método.
- **Distância rodoviária ou ortodrômica é parâmetro**, não padrão embutido: a
  escolha muda o número do inventário e precisa ser declarada. O provedor de
  rota é o mesmo já previsto para viagens.
- **A data de referência do fator é a virada do ano-base.** A data da resposta
  não é coluna da §9, então usá-la deixaria o cálculo impossível de reproduzir
  depois — o `verificar` não teria como chegar ao mesmo número.
- **Exceções.** Entram como exceção, fora da média e listadas no método:
  distância acima de um limite configurável, CEP que não geocodificou, modal não
  reconhecido e modal que depende de combustível sem combustível informado.
  Nenhum desses casos é decidido por cidade ou por resposta específica no
  código — todos saem de regra e de parâmetro.
- **Normalização de cidade e bairro.** Variantes de caixa e acento são agrupadas
  por uma chave sem acento e exibidas com a grafia mais acentuada; sem isso o
  mesmo bairro viraria dois recortes pequenos e a supressão atuaria onde não
  deveria.
- **Deduplicação por matrícula** mantendo a resposta mais recente, com alerta na
  linha mantida.
- **Vínculo com cadastro existente.** Quando a matrícula não existe, a carga só
  reaproveita um funcionário já cadastrado por outra base se o nome
  normalizado identificar uma única linha ainda sem matrícula. Homônimo não é
  fundido.

**Divergência encontrada na origem**

- A matrícula não tem comprimento fixo como o material de apoio descreve: há
  valores mais curtos, mais longos e alguns com prefixo de letra. Passou a ser
  tratada como texto opaco — sem conversão para número e sem completar com
  zeros, que juntaria pessoas diferentes. Linha cuja matrícula vem como número
  na planilha recebe alerta, porque nesse caso o zero à esquerda pode já ter se
  perdido na origem.

**Validação**

- `tsc --noEmit` e `next build` passam. Nenhum servidor subiu.
- A leitura da planilha, a normalização de lugar, o reconhecimento de modal e
  combustível e a validação cruzada dos dois foram exercitadas contra o arquivo
  real, com um ensaio temporário que foi apagado. O cabeçalho é localizado pelo
  conteúdo, todas as respostas de transporte e todas as datas foram
  reconhecidas, e a normalização reduziu a contagem de cidades distintas sem
  encostar na de bairros.
- A carga em si não rodou: depende de banco, de chave de geocodificação e do
  arquivo de fatores.

**Correção feita nesta etapa**

- Um comentário de migration citava contagem da base real. Reescrito sem número:
  §2.2 vale também para comentário.

#### 2026-09-14 — Mudança de decisão arquitetural: Postgres → Firebase

**Decisão do Gustavo.** O banco deixa de ser Postgres (Supabase/Neon) e passa a
ser Firestore, com Firebase Auth. Motivo: todos os outros sistemas internos da
empresa já rodam em Firebase, a autenticação corporativa via Google Workspace já
está resolvida nesse ecossistema, e o volume é pequeno — ordem de centenas a
poucos milhares de documentos por ano. Não há ganho prático em manter um banco
relacional separado.

As entradas anteriores deste log descrevem o modelo relacional e ficam como
estão: são registro do que foi feito, não especificação vigente. A especificação
é o corpo deste documento.

**O que esta etapa mudou — só o CLAUDE.md, nenhum código**

- §4: stack passa a Firestore + Firebase Auth, com a justificativa da decisão.
  Storage declarado como não usado e não configurado.
- §5: cinco papéis mantidos. Nova §5.1 fixa o `colaborador` como papel de menor
  privilégio, com escopo fechado — cria e lê só o próprio, não acessa painel, e a
  verificação é o filtro por uid na consulta.
- §7.3: formulário do colaborador reduzido ao mínimo que calcula emissão. Saiu o
  campo de motivo; ficam os três campos do carro, que entram na conta.
- §9: reescrita inteira. Coleções, envelope comum, IDs determinísticos, alertas em
  dois campos, validação na escrita e camada única de consulta agregada.
- §10.1: os quatro cortes do painel — período, modal, rota/destino e empresa.
- §11: segurança reescrita para Firebase, com rules negando tudo por padrão.
- §12: entram como fora de escopo qualquer campo financeiro, centro de custo,
  Storage, contador agregado e fluxo de aprovação do registro de viagem.
- §13 nova, "Pontos em aberto". O log virou §14 e o ponteiro da §0 foi corrigido —
  ele apontava para a seção errada desde o início.

**Decisões de modelagem que entraram**

- **Um documento por trecho**, não por viagem; conexão vira dois documentos
  ligados pelo mesmo `reservaId`. Sem array aninhado de trechos.
- **Campos de filtro desnormalizados** em todo documento: ano, mês, empresa e
  modal.
- **Todo documento guarda o fator usado, com versão.** Fator muda todo ano e o
  inventário precisa ser auditável.
- **Data sempre string `AAAA-MM-DD`**, nunca Timestamp, para não repetir os bugs
  de fuso.
- **Sem contador agregado**; agregação no servidor, reduzindo em JavaScript.
  Total e saldo são sempre calculados.
- **Alertas em dois campos:** `alertas` com o detalhe e `alertasCodigos` só com os
  códigos. O segundo existe porque array de objeto não é indexável de forma útil
  no Firestore; é ele que permite `array-contains`.
- **`empresa` fica, `centroCusto` sai.** Empresa é dimensão ambiental legítima:
  cada pessoa jurídica responde pelo próprio Escopo 3. Centro de custo é dimensão
  financeira e não pertence a um inventário de emissões.
- **Nulo é categoria visível.** Ao agrupar por empresa, os documentos sem empresa
  formam fatia própria e o total bate com a contagem de documentos da coleção.
  Registro que some de agregação é erro que só aparece em auditoria.

**Decisões minhas, tomadas ao escrever a seção 9**

- **Três coleções de emissão, não uma.** Mobilidade é taxa mensal; viagem e
  embarque são eventos. Somar os dois num mesmo total dá número errado sem
  nenhum sinal de erro. Coleções separadas impedem a mistura por descuido, e todo
  documento ainda carrega `periodicidade`.
- **`modal` e `modulo` são campos distintos.** A carga aérea de fornecedor que
  vem no arquivo marítimo é modal aéreo dentro do módulo marítimo; sem os dois
  campos ela se confundiria com viagem de passageiro.
- **`mes` é nulo na mobilidade.** A pesquisa é anual e o valor vale para todo mês
  do ano-base; na série mensal o mesmo valor se repete, e isso é declarado no
  método.
- **O que o banco garantia vira validação na escrita**, listada na §9.9: escopo,
  coerência entre propriedade do veículo e escopo, ocupantes, passageiros,
  distância não negativa, vigência coerente e formato de data. Sem isso no
  código, essas regras deixam de existir.

**Auditoria da migração, feita antes de mexer**

- Nenhum script jamais rodou contra banco: não há dado a migrar. O custo da
  troca é de código, não de dado.
- Descartado por inteiro: schema, as quatro migrations, os snapshots, a config e
  o cliente — cerca de 930 linhas.
- Reescrito, com a lógica preservada: o resolvedor de fatores, o `conectar()`, os
  blocos de gravação dos dois ingests, os upserts dos dois seeds e as agregações
  do verificar.
- Intocado: todo o cálculo e todo o parsing — cerca de 660 linhas já validadas,
  incluindo a leitura de planilha, a normalização de lugar, a deduplicação e a
  cascata de geocodificação.
- Perda real: as garantias que o banco dava de graça. Estão convertidas em
  validação de escrita, ID determinístico e camada única de consulta — §9.9 e
  §9.10.

**Critério de aceite da migração de código:** o `verificar` precisa fechar no
mesmo valor de conferência que fechou no modelo relacional.

#### 2026-09-14 — Migração, Fase B: infraestrutura Firebase

**Entrou**

- `firebase-admin` como dependência.
- `src/server/firestore.ts` — inicialização única do Admin SDK, com as duas
  formas de credencial previstas, e `COLECAO`, que concentra os nomes de coleção
  num lugar só. Nome de coleção escrito à mão em cada consulta é como se cria
  uma coleção nova, vazia, sem nenhum erro aparecer.
- `firestore.rules` negando leitura e escrita para qualquer cliente, e
  `firebase.json` apontando para elas. Publicação por `npm run rules:deploy`.
- `.env.example` reescrito: credencial do Admin SDK, configuração pública do SDK
  web e domínio corporativo. Todos os valores fictícios.
- `.gitignore` ampliado: `serviceAccount*.json`, `firebase-adminsdk*.json` e os
  artefatos do CLI e do emulador.

**Saiu**

- As quatro migrations, os snapshots do drizzle-kit, `drizzle.config.ts`, o
  cliente Postgres e o pacote `drizzle-kit`.
- Os scripts npm `db:generate` e `db:migrate`.
- `DATABASE_URL` do `.env.example`.

**Decisões da fase**

- **`ignoreUndefinedProperties` fica desligado**, que é o padrão. Campo ausente
  precisa ser gravado como `null` explícito: é o que mantém "sem empresa" como
  categoria visível na agregação (§9.10) em vez de o campo simplesmente não
  existir no documento.
- **A configuração pública do SDK web é `NEXT_PUBLIC_`.** Ela não é credencial,
  mas carrega o id do projeto, que a §2.1 trata como identificador de
  infraestrutura. Fica em variável de ambiente, com valor fictício no exemplo, e
  o cabeçalho do `.env.example` foi corrigido: a regra não é "nada é
  NEXT_PUBLIC_", é "nenhuma credencial e nenhum dado de pessoa é NEXT_PUBLIC_".
- **A ordem da demolição mudou, e isto foi combinado com o Gustavo.** O schema
  antigo e os pacotes `drizzle-orm` e `postgres` continuam no repositório porque
  são o que mantém os scripts compilando; morrem no fim da Fase E, junto com o
  último consumidor. Derrubá-los agora deixaria a árvore quebrada por três
  fases. `databaseUrl()` ficou marcado como transitório pelo mesmo motivo.

**Validação**

- `tsc --noEmit` e `next build` passam. Nenhum servidor subiu.
- Nenhuma credencial real no repositório: a varredura só encontra os
  placeholders fictícios do `.env.example`.
- Os alertas do `npm audit` mudaram de origem: sumiram os do `esbuild` que vinham
  com o `drizzle-kit`, e restam três moderados de `uuid`, que chega por baixo do
  leitor de planilha e do cliente HTTP do Firebase. O aviso é sobre uma chamada
  com buffer próprio, que não é o uso daqui; corrigir rebaixaria o leitor de
  planilha em um major.

**Ainda não existe**: nenhuma escrita ou leitura de Firestore. Isso é a Fase C.

#### 2026-09-14 — Migração, Fase C: modelo, validação e escrita

**Entrou**

- `src/server/documentos/tipos.ts` — formato dos documentos das três coleções de
  emissão e das de apoio, com o envelope comum da §9.4. `montarAlertas()` monta
  os dois campos de alerta de uma vez, porque mantê-los em sincronia à mão é o
  tipo de coisa que só aparece quando a consulta por código devolve menos do que
  deveria.
- `src/server/documentos/ids.ts` — IDs determinísticos por coleção, com limpeza
  do que o Firestore recusa no identificador.
- `src/server/documentos/validacao.ts` — a §9.9 inteira, em código.
- `src/server/escrita.ts` — gravação em lote, apagamento por escopo e recarga de
  período.
- `src/server/documentos/validacao.test.ts` e `npm test` — 19 testes, sem
  dependência nova: o runner é o do próprio Node.

**Decisões da fase**

- **A recarga grava antes de apagar, e a §9.9 foi corrigida para dizer isso.** O
  texto anterior mandava apagar primeiro, que é o que o modelo relacional fazia
  dentro de uma transação. Sem transação do tamanho da carga, apagar primeiro
  abre uma janela com o período vazio, e uma falha no meio da escrita deixa o
  inventário sem dado. Gravando primeiro e limpando o obsoleto depois, o pior
  caso é sobra, que a execução seguinte resolve — nunca falta.
- **Recarga sem documento nenhum é recusada.** Seria o caminho mais curto para
  apagar um período inteiro por causa de um erro de leitura de arquivo.
  Esvaziar de propósito continua possível, mas tem que ser pedido.
- **ID repetido dentro da mesma carga é recusado.** Sem índice único, dois
  documentos com o mesmo ID simplesmente se sobrescrevem e o inventário encolhe
  sem nenhum erro.
- **`undefined` é recusado em qualquer profundidade.** O Admin SDK também
  recusaria, mas sem dizer qual campo; e campo ausente precisa ser `null`
  explícito para continuar visível na agregação (§9.10).
- **Fator nulo só passa com emissão zero**, e vice-versa. É o que separa
  "modal que não emite por definição" de "fator que alguém esqueceu de aplicar".
- **Ano e mês são conferidos contra a data de referência do próprio documento.**
  Campo de filtro desnormalizado que não bate com o dado faz o corte por período
  mentir sem nenhum sinal.
- **Teste virou parte do projeto.** A §2.2 já previa suíte de testes ao alertar
  sobre valor real em asserção; e desde que o banco saiu, a validação é a única
  guarda que resta. Toda a massa dos testes é fictícia, inventada do zero.

**Bug encontrado durante a implementação**

- `recarregarEscopo` resolvia a conexão antes de conferir as guardas, então uma
  carga vazia falharia reclamando de credencial em vez de dizer o que estava
  errado. As guardas passaram para antes de qualquer acesso ao banco — é também
  o que permite testá-las sem Firestore.

**Validação**

- `tsc --noEmit`, `npm test` (19 testes) e `next build` passam.
- Os testes exercitam cada regra da §9.9 pelos dois lados: documento válido
  passa, documento inválido é recusado. A recusa exige o erro específico da
  validação, para que um erro acidental do próprio teste não conte como
  aprovação.
- Nada foi escrito no Firestore: as guardas testadas rodam antes de qualquer
  conexão.

#### 2026-09-14 — Migração, Fase D: fatores, viagens e conferência

**Portado para o Firestore**

- `src/server/fatores.ts` — resolvedor de vigência. A coleção é lida **uma vez**
  e a vigência é filtrada em memória; no modelo relacional cada trecho fazia a
  própria consulta, o que aqui seriam centenas de leituras para responder sempre
  as mesmas meia dúzia de perguntas.
- `src/lib/calculo/categorias.ts` — as categorias de fator saíram do resolvedor
  para um módulo sem dependência de banco, porque são usadas dos dois lados: por
  quem grava o fator e por quem calcula com ele.
- `scripts/seed-fatores.ts` e `scripts/seed-fatores-mobilidade.ts` — gravam por
  ID determinístico, com validação antes da escrita.
- `scripts/ingest-viagens.ts` — um documento por trecho, ligado pelo
  `reservaId`. A recarga usa o escopo `fonte = agencia`, então regravar o
  histórico não enxerga nem apaga o que vier do formulário.
- `scripts/verificar.ts` — agrega lendo a coleção e reduzindo em JavaScript.

**Decisões da fase**

- **Os alertas da reserva são copiados para cada trecho dela.** O documento
  agora é o trecho, e é nele que a consulta por código de alerta vai procurar.
- **O multiplicador de classe ganhou campo próprio no trecho.** O cálculo aéreo
  tem dois termos, e o envelope carimba um só. Com o fator por faixa em `fator`
  e a cabine com o multiplicador ao lado, a emissão do trecho volta a ser
  reproduzível a partir do próprio documento. A §9.6 foi atualizada.
- **Três conferências novas**, que substituem o que o banco garantia: trecho sem
  fator carimbado, ordem repetida dentro da mesma reserva e mês diferente do mês
  da data do voo. Na mobilidade entrou também a comparação entre o fator
  carimbado no documento e o fator vigente — é o que denuncia carga que ficou
  para trás de uma troca de fator.

**Divergência encontrada na base, que teria virado falha falsa**

- O cadastro de pessoas da base é maior que o número de pessoas que viajaram: a
  diferença aparece **apenas como aprovador de passagem**. A conferência de
  pessoas comparava contra o total declarado e teria acusado erro numa carga
  correta. Agora ela compara contra a recontagem dos passageiros, e o script
  imprime uma nota explicando a diferença quando ela existe. A regra da §7.2 —
  para emissão vale quem viajou, não quem aprovou — já estava no cálculo; o que
  estava errado era a conferência.

**Critério de aceite: cumprido**

A cadeia inteira foi refeita com os módulos de produção — montagem dos fatores,
resolvedor de vigência, cálculo do trecho e validação de escrita — trocando
apenas o Firestore por um duplo em memória, e comparada com o valor de
conferência da própria base. **Distância e emissão bateram exatamente**, com o
mesmo número de trechos, de reservas contabilizáveis e de meses do modelo
relacional. Todos os IDs saíram únicos. O ensaio era temporário e foi apagado.

**Validação**

- `tsc --noEmit`, `npm test` (20 testes) e `next build` passam.
- Nada foi escrito no Firestore: falta banco provisionado e credencial.

**Restam ligados ao Postgres**: `scripts/ingest-mobilidade.ts`, o
`src/lib/calculo/fatores.ts` antigo, `src/db/schema.ts` e os pacotes
`drizzle-orm` e `postgres`. Todos morrem na Fase E.

#### 2026-09-14 — Migração, Fase E: mobilidade e demolição do Postgres

**Portado**

- `scripts/ingest-mobilidade.ts` — um documento por resposta, recarga pelo
  escopo `anoBase`. A leitura da planilha, a geocodificação, o descarte do
  endereço, a normalização de lugar e a deduplicação por matrícula não mudaram
  uma linha: a migração nunca encostou na parte que já estava conferida contra o
  arquivo real.
- Os alertas viraram os dois campos do documento, com severidade por tipo: erro
  no que impede o cálculo, atenção no que merece revisão, informativo no resto.
- O fator aplicado passou a ser carimbado no registro, como nas viagens.

**Demolido**

- `src/db/schema.ts`, `src/lib/calculo/fatores.ts`, a `conectar()` antiga e
  `databaseUrl()`.
- Os pacotes `drizzle-orm` e `postgres`. **Não sobrou nenhuma referência a
  Postgres no repositório** fora deste log, que é registro histórico.

**Decisão da fase**

- **O vínculo de funcionário entre bases sobreviveu à troca de banco.** Quem tem
  matrícula ganha ID próprio; quem já existia por outra base, sem matrícula,
  é reaproveitado quando o nome normalizado identifica um documento só — e o
  documento existente é atualizado no lugar, mantendo o ID que as viagens já
  apontam. Homônimo continua não sendo fundido.

**Conferência**

- Os documentos de mobilidade foram montados a partir do arquivo real com os
  módulos de produção — leitura, deduplicação, normalização, ID e validação de
  escrita — trocando apenas a distância, que dependeria de rede, por um valor
  fixo. **Todas as respostas viraram documento válido, com ID único**, e a
  contagem de cidades, de bairros e de modais de emissão zero ficou idêntica à
  apurada quando o módulo foi escrito. O ensaio era temporário e foi apagado.
- Para permitir essa conferência sem rede e sem banco, a leitura da planilha e a
  deduplicação passaram a ser exportadas.

**Validação**

- `tsc --noEmit`, `npm test` (20 testes) e `next build` passam, agora sem
  nenhuma dependência de banco relacional.
- Nada foi escrito no Firestore: falta projeto provisionado e credencial.

**Migração encerrada.** O que falta para o inventário rodar de ponta a ponta não
é código de migração: é o projeto no Firebase, a service account, o arquivo de
fatores da mobilidade e a execução das cargas.

#### 2026-09-14 — Fase F: camada de consulta agregada

Última fase da migração. Nenhuma tela construída.

**Entrou — `src/server/consultas/`**

- `agregacao.ts` — primitivos puros, sem Firestore: agrupamento com supressão,
  série mensal, somas e a conversão de taxa mensal para total anual.
- `acesso.ts` — autorização por perfil, conferida antes de qualquer leitura.
- `inventario.ts` — mobilidade, viagens, marítimo, visão geral e método.
- `programa.ts` — submissões do próprio viajante e visão de adesão.
- `agregacao.test.ts` e `porta-unica.test.ts` — 13 testes novos; 33 no total.

**As três garantias, agora em código testado**

- **Supressão conta pessoas, não documentos.** Um destino com dez viagens de uma
  pessoa só continua identificando essa pessoa. O balde de suprimidos não
  carrega rótulo de lugar nenhum: é a soma de recortes distintos e, por
  construção, não diz onde ninguém mora.
- **Nulo é fatia própria.** "Sem empresa", "Sem bairro", "Sem cidade" aparecem
  com rótulo em vez de sumirem.
- **O total bate com a contagem de documentos.** A soma dos grupos é conferida
  contra o que entrou e **estoura erro** se divergir. Era a regra escrita na
  §9.10; virou invariante executável.

**Decisões da fase**

- **A mobilidade não entra na série mensal da visão geral.** Ela é taxa mensal
  do ano-base (§9.3); somada à série de eventos, apareceria como se tivesse
  acontecido doze vezes num mês qualquer. Entra no total anual, com a conversão
  explícita, e a resposta da consulta carrega a observação para a tela declarar.
- **O identificador de pessoa é lido e morre na camada.** Ele serve para contar
  pessoas distintas na supressão e nunca entra no que é devolvido. A única
  exceção é o programa de viagens, onde o nome sai — e só para quem pode.
- **Para o `gestor`, o nome nem é lido.** A coleção de funcionários só é
  consultada quando o perfil pode ver quem registrou; não é filtro depois da
  leitura.
- **Nenhum índice composto foi criado.** Todas as consultas são de igualdade
  pura, que o Firestore atende com os índices automáticos. Índice especulativo
  custa escrita e armazenamento sem contrapartida; se algum dia uma consulta
  precisar de um, o próprio erro do Firestore traz o link para criá-lo.

**Guarda arquitetural**

A regra "nenhuma tela lê coleção por fora da camada" passou a ser testada: o
teste varre as telas procurando acesso direto ao banco. Foi conferido que ele
**falha** quando a violação existe e passa quando não existe — guarda que não
morde não é guarda.

**Validação**

- `tsc --noEmit`, `npm test` (33 testes) e `next build` passam.
- Nada foi lido ou escrito no Firestore: os testes da camada são sobre funções
  puras e sobre arquivos.

**Migração concluída.** O código está inteiro em Firestore, com as garantias de
privacidade e de integridade em código testado. O que falta para o inventário
existir de verdade é infraestrutura e dado: projeto no Firebase, service account,
arquivo de fatores da mobilidade e execução das cargas.

#### 2026-09-14 — Primeira carga real e conferência contra o Firestore

**Viagens: o critério de aceite da migração foi cumprido contra banco de verdade.**
Reservas, trechos, pessoas, aeroportos, distância, emissão total e os doze meses
da série bateram com diferença zero, e as três conferências de integridade —
trecho sem fator carimbado, ordem repetida na reserva, mês diferente do mês da
data do voo — voltaram zeradas. O número que o modelo relacional produzia em
simulação é o mesmo que o Firestore produz carregado.

**Mobilidade não foi carregada**, apesar de os comandos terem sido dados. A
coleção está vazia porque três pré-requisitos ainda não existem: o arquivo de
fatores da mobilidade, a coordenada real da fábrica e a chave do provedor de
rota. A conferência detectou e reportou a ausência em vez de passar batido.

**Risco evitado, que vale ficar registrado.** Se a carga tivesse rodado com a
coordenada da fábrica ainda no valor de exemplo, toda distância sairia medida a
partir de um ponto no oceano. Como distância acima do limite vira exceção, e
exceção fica fora da média por desenho, o resultado seria um módulo inteiro em
exceção com média válida e vazia — um erro que não estoura em lugar nenhum. A
carga não rodar foi melhor que rodar assim, mas a lição é que o limite de
distância não protege contra origem errada: ele só transforma o erro em exceção.

**Correção de operação**

- `npm run rules:deploy` falhava com "No currently active project". O caminho
  convencional seria um `.firebaserc` versionado, que carregaria o id do projeto —
  identificador de infraestrutura que não entra no git (§2.1). O script passou a
  ler o projeto do `.env` e passar em `--project`, mantendo fonte única e nada
  novo para ignorar.

**Incidente contido, sem vazamento**

- As credenciais foram preenchidas no `.env.example`, que é versionado e já está
  publicado, em vez do `.env`. Conferido que a chave real não entrou em nenhum
  commit nem no repositório remoto: ela existia apenas na cópia de trabalho. Os
  valores foram movidos para o `.env`, que é ignorado, e o `.env.example` voltou
  ao placeholder. Recomendada a rotação da chave, por ela ter passado por um
  arquivo cujo propósito é ser público.

#### 2026-09-14 — Fator ausente: falha por registro, não por carga

**Pedido do Gustavo.** Combinação sem fator precisa sinalizar o registro e deixar
o processamento seguir, em vez de quebrar a importação inteira. Moto a diesel e
moto elétrica não têm fator de propósito: indicam erro de preenchimento e têm que
aparecer como alerta, nunca receber valor aproximado.

**Como estava.** O resolvedor lançava, ninguém capturava no laço da mobilidade, e
o erro subia até o encerramento do script. Como a gravação acontece depois do
laço, **uma única linha com combinação inválida derrubava a carga toda e não
gravava nada** — nem as respostas boas.

**Como ficou.** A recusa do fator é capturada por registro na mobilidade. A
resposta vira exceção com motivo, recebe alerta de severidade erro, fica com
fator nulo e emissão zero, e a carga continua. A validação de escrita já exigia
que fator nulo viesse com emissão zero, então a combinação é coerente por
construção; e exceção fica fora da média por desenho, o que impede o registro de
puxar o indicador para baixo como se fosse emissão zero legítima.

**A política ficou assimétrica entre os módulos, de propósito**, e está escrita
na §9.8: na mobilidade a ausência é erro de uma linha; nas viagens o fator vem do
próprio arquivo da base, então ausência é sinal de seed não rodado ou base
inconsistente, e continuar subestimaria o inventário em silêncio.

**O caso não é hipotético.** A planilha da pesquisa tem uma resposta com
exatamente uma das combinações que não têm fator. Antes desta correção, ela
sozinha impediria a carga do módulo inteiro.

**Validação**

- `tsc --noEmit` e `npm test` (39 testes, 6 novos) passam.
- Os testes novos cobrem o resolvedor pelos dois lados: fator vigente é devolvido;
  combinação sem fator, fator fora de vigência e coleção vazia são recusados, e
  nenhum deles vira zero ou aproximação. Um teste garante que a recusa de um
  registro não interrompe o processamento dos demais.

#### 2026-09-14 — Trava contra credencial em arquivo versionado

O `.env.example` foi preenchido com a credencial real duas vezes — é o arquivo
mais perigoso do repositório, porque existe para ser público e tem exatamente o
formato de um arquivo de segredos. Nas duas vezes nada foi commitado, mas a
terceira poderia ser a que escapa, e histórico público não se apaga (§2.4).

Duas guardas foram instaladas:

- `src/server/segredos.test.ts` — varre os arquivos versionados procurando o que
  tem cara de credencial: PEM com corpo real, chave de API do Google, client
  secret do OAuth, token do GitHub, chave da AWS. Os padrões são estreitos de
  propósito, para não disparar em placeholder: teste que dá alarme falso é teste
  que se aprende a ignorar.
- Um gancho de pré-commit, local e não versionado, que roda a mesma varredura
  sobre o que está sendo commitado e recusa o commit. Removível apagando o
  arquivo; pulável com `--no-verify`, conscientemente.

Ambas foram conferidas colocando a credencial de volta no arquivo: o teste falha
e o commit é bloqueado. Guarda que não morde não é guarda.

#### 2026-09-14 — Limite de taxa do provedor de rota

A carga de mobilidade parou com 429 do provedor de rota depois de algumas
dezenas de respostas. Duas falhas, não uma:

1. **O código não respeitava o limite.** O geocodificador já tinha intervalo
   entre chamadas; o provedor de rota não tinha nenhum, e disparava tão rápido
   quanto o geocodificador liberasse — muito acima do que o plano gratuito
   aceita por minuto.
2. **Uma recusa transitória derrubava a carga inteira.** Como a gravação
   acontece depois do laço, dezenas de respostas já processadas se perdiam por
   causa de uma chamada recusada. Mesmo padrão do fator ausente, corrigido
   antes, em outro ponto do mesmo laço.

**Como ficou**

- A calculadora de distância passou a declarar o próprio intervalo entre
  chamadas, como o geocodificador já fazia, com padrão abaixo do limite do plano
  gratuito e ajustável por variável de ambiente.
- 429 virou erro tipado, separado dos demais: a espera segue o `Retry-After` que
  o provedor manda e, na ausência dele, cresce a cada tentativa.
- Esgotadas as tentativas, a resposta vira exceção com alerta próprio, fica fora
  da média e a carga continua. O alerta diz que uma recarga pode trazê-la de
  volta — é falha de infraestrutura, não de dado, e não deve parecer permanente.
- O script passou a estimar e anunciar a duração da carga a partir dos intervalos
  declarados pelos dois provedores, para a espera não parecer travamento.

**Decisão**

- **Não há cache de rota na mobilidade**, e isso é deliberado. A §7.4 manda
  cachear rota por sequência de códigos IBGE, mas ali a chave é município; aqui
  seria a coordenada da residência, e guardar isso é guardar endereço, o que a
  §6.1 proíbe. O custo é uma recarga refazer o trabalho — aceitável no volume
  desta pesquisa.

**Validação**

- `tsc --noEmit` e `npm test` (47 testes, 7 novos) passam.
- Os testes novos cobrem a leitura do `Retry-After` em segundos, em data HTTP,
  ausente e no passado, além da simetria e da ordem de grandeza da distância
  ortodrômica.

#### 2026-09-15 — Mobilidade carregou, conferiu e o número não presta

A carga rodou inteira e **todas as conferências passaram**. Mesmo assim o módulo
está inválido, e o motivo é instrutivo.

**O achado.** A esmagadora maioria das respostas ficou com exatamente a mesma
distância, e essas pessoas se espalham por dezenas de bairros diferentes. Isso é
fisicamente impossível: significa que o provedor de geocodificação devolveu a
mesma coordenada — a do município — para a maior parte dos CEPs. A distância
deixou de medir deslocamento e passou a medir "centro da cidade até a fábrica".

**Por que nenhuma conferência pegou.** Todas as que existiam checavam *coerência
interna*: a emissão gravada bate com distância × dias úteis × fator, o fator
carimbado é o vigente, a contagem de registros bate com a de respostas do
arquivo. Tudo isso continua verdadeiro com uma distância errada. Faltava uma
conferência de **plausibilidade** — a pergunta não é "a conta fecha?", é "o
insumo faz sentido?".

**O que isso invalida:** a distância média do módulo, o radar da §10.2 (que
desenharia quase todos os pontos no mesmo raio) e a emissão por pessoa, que fica
idêntica dentro de cada modal. O total do módulo é igualmente sem sentido.

**Duas guardas novas, uma em cada ponta**

- Na carga: depois de calcular as distâncias, o script mede a fração de respostas
  que compartilham a mesma distância. Passando do limite, avisa em destaque,
  explica a causa provável e **marca cada resposta afetada com alerta próprio**,
  para o problema aparecer na tela de método e não só no terminal.
- Na conferência: a mesma medida virou item que falha. Foi conferido contra o
  estado atual do banco e **falhou**, como devia.

O limite é parâmetro, com padrão conservador: com geocodificação de CEP,
distâncias idênticas até o centímetro são raras.

**Lição que vale além deste caso.** Conferência de coerência e conferência de
plausibilidade são coisas diferentes. A primeira responde se o sistema calculou
certo; a segunda, se o que entrou no cálculo era crível. Este módulo passou na
primeira por dias enquanto falhava na segunda.

**Pendente, e é decisão de método**: trocar o provedor de geocodificação por um
com precisão de CEP e recarregar o ano-base. Enquanto isso não acontece, o número
da mobilidade não deve ser publicado nem somado ao painel.

#### 2026-09-15 — Carga 100% em exceção passou em todas as conferências

A cota diária do provedor de rota esgotou e ele passou a responder 403 em toda
chamada. O resultado: **nenhuma das respostas obteve distância**, o módulo foi
gravado inteiro em exceção, com emissão zero — e a conferência disse que estava
tudo certo.

**Dois defeitos, e o segundo é o mesmo que eu tinha acabado de criticar**

1. **Erro de credencial e de cota era tratado como falha transitória.** O 429 já
   tinha tratamento próprio, mas 401 e 403 caíam no caminho genérico: quatro
   tentativas inúteis e depois exceção por resposta. Repetir não resolve cota, e
   transformar isso em exceção espalha uma falha de ambiente por todos os
   registros, disfarçada de problema de dado.
2. **Toda conferência do módulo é calculada sobre as respostas que estão na
   média.** Com o módulo inteiro em exceção, não sobra nada para conferir e tudo
   passa — inclusive a conferência de plausibilidade adicionada no dia anterior,
   que mediu concentração de distâncias sobre um conjunto vazio e devolveu zero.
   É exatamente o ponto cego que aquela conferência existia para cobrir,
   reproduzido dentro dela.

**Como ficou**

- 401 e 403 viraram erro fatal próprio, que não é repetido e interrompe a carga
  dizendo para conferir chave e cota.
- A carga recusa gravar quando **nenhuma** resposta obteve distância: seria
  substituir o ano-base por um módulo de exceções com aparência de sucesso.
- A conferência ganhou a fração de respostas em exceção como item que falha.
  Conferido contra o banco atual: **falhou**, apontando o módulo inteiro em
  exceção.

**Lição, agora em duas camadas.** Não basta separar conferência de coerência de
conferência de plausibilidade: a de plausibilidade também precisa de uma guarda
sobre o próprio conjunto que ela mede. Indicador calculado sobre conjunto vazio
não devolve erro, devolve zero — e zero passa em quase todo teste de limite.

**Estado do módulo de mobilidade**: inválido e sem número publicável, agora por
dois motivos acumulados — geocodificação grosseira, que exige trocar de provedor,
e cota de rota esgotada, que exige esperar a renovação ou outro plano.

#### 2026-09-15 — Atualização da especificação (Gustavo)

Sem código. Quatro pontos fechados no documento:

- **§7: a data de corte não está definida.** O `30/09/2026` era exemplo, não compromisso, e
  estava sendo lido como prazo real. Passa a ser parâmetro de ambiente até o Gustavo
  decidir, junto do anúncio do programa aos colaboradores.
- **§7.4: provedor de rota decidido — Google.** Junto com a geocodificação, pelo motivo já
  registrado no log de 15/09. A decisão que estava pendente no texto foi fechada.
- **§10: a tela de Método ganhou lista mínima** do que precisa declarar. A troca de
  provedor muda o número e não podia continuar existindo só no log.
- **§11: duas regras novas de credencial** — exposição sem commit ainda exige rotação, e
  chave de provedor pago é restrita por API e por IP ou compensada com teto de faturamento.

#### 2026-09-15 — Troca de provedor e mobilidade válida pela primeira vez

**Decisão metodológica do Gustavo:** geocodificação e roteamento passam a ser do
Google. As alternativas gratuitas foram testadas contra a base real e reprovadas
por motivos diferentes, cada uma na sua ponta da cadeia:

- **Geocodificação** — o provedor gratuito devolve a coordenada do município
  para a maioria dos CEPs. Dezenas de endereços viram o mesmo ponto, e a
  distância deixa de medir deslocamento.
- **Roteamento** — a cota diária do plano gratuito não suporta recarregar a
  pesquisa mais de uma vez no mesmo dia, e cota esgotada derruba a carga.

Nenhuma linha de código mudou: os dois provedores já estavam implementados e a
troca é de configuração. O `.env.example` passou a recomendar o Google nos dois,
com o motivo escrito ao lado — a próxima pessoa não precisa redescobrir isso.

**A troca precisa ser declarada na tela de método.** A distância que sustenta o
número da mobilidade vem de roteamento rodoviário do Google, e o valor muda
conforme o provedor: não é detalhe de infraestrutura, é parâmetro do cálculo.

**Resultado da recarga**

A distribuição de distâncias passou a ter forma de gente morando em lugares
diferentes — quartis separados, cauda longa, quase tantos valores distintos
quanto respostas. Antes, um único valor cobria a grande maioria.

As exceções caíram para duas, e são exatamente as previstas: a combinação de
modal e combustível sem fator, e o respondente cuja distância não se sustenta
como deslocamento diário. Nenhuma falha de infraestrutura sobrou.

A emissão por modal ficou coerente com a física: o modal individual concentra a
maior parte, o transporte público emite bem menos por pessoa por usar fator por
passageiro-km, e os modais de emissão zero ficaram zerados.

**As duas conferências de plausibilidade aprovaram**, depois de terem reprovado
as duas cargas anteriores por motivos opostos — uma por concentração de
distâncias idênticas, outra por módulo inteiro em exceção. É a primeira vez que
o módulo de mobilidade passa por elas.

**Estado do inventário:** viagens e mobilidade válidos e conferidos. Marítimo não
começou; o painel consolidado segue parcial até ele existir.

#### 2026-09-15 — Fatia 1: sessão real e tela de Método

Primeira tela do sistema. A ordem foi escolhida pelo Gustavo: Método antes da Visão
geral, porque é a tela que consome o que a camada já entrega, é onde as escolhas que
mudam o número ficam registradas, e é a única tela do inventário que não exibe recorte
de pessoa nenhum — o lugar certo para estrear a camada de consulta sem que um erro de
supressão vire vazamento.

**Sessão — e não o atalho**

Foi oferecido um contexto de desenvolvimento travado por `NODE_ENV`, para abrir a tela
no navegador antes da autenticação existir. **O Gustavo recusou**, com três motivos que
ficam registrados porque valem para a próxima decisão parecida: o custo é o mesmo em
qualquer ordem, já que auth é pré-requisito das sete telas; trabalho adiado em projeto
de uma pessoa só tende a não acontecer; e um bypass guardado por uma única guarda é o
tipo de coisa que sobrevive mais do que devia.

- `src/server/sessao.ts` — o navegador entra por Firebase Auth com provedor Google e
  troca o ID token por um **cookie de sessão httpOnly** emitido no servidor. O SDK web é
  encerrado logo depois: sem isso o navegador guardaria um refresh token de longa duração
  que não serve para nada aqui.
- Três recusas antes de existir cookie: provedor diferente de Google, e-mail não
  verificado e domínio fora do Workspace corporativo.
- **O papel nunca vem do token.** Ele é lido de `usuarioPerfil/{uid}` a cada requisição,
  com `checkRevoked`. Token não carrega papel de propósito: token velho continuaria
  valendo depois de o acesso ter sido revogado.
- **Conta sem documento de perfil não recebe papel nenhum** — não há padrão, não há
  "colaborador por enquanto". Quem entra sem perfil vê um aviso e não vê dado. Perfil
  implícito é privilégio concedido por descuido.
- `scripts/definir-perfil.ts` (`npm run perfil`) é o único caminho para conceder acesso,
  e roda fora da aplicação, como as cargas.

**Correção do perfil `importacao`, decidida pelo Gustavo**

A proposta era fazer a visão geral não quebrar para esse perfil. **Foi recusada, e com
razão:** uma visão geral que soma um módulo e chama de total é exatamente o erro que a
§9.10 existe para impedir — total que não bate com o que existe, sem nenhum sinal.

A correção certa é de autorização, não de tolerância: `importacao` não recebe a visão
geral. A `acesso.ts` passou a ter três portas distintas — inventário, módulo e visão
geral —, a navegação não oferece a tela e a consulta recusa quem chegar pela URL.
`AcessoNegadoError` ali é o comportamento correto. A §5 foi atualizada.

**Tela de Método**

- `src/server/consultas/metodo.ts` — o que existia devolvia só a lista de fatores, um
  sétimo do que a §10 passou a exigir. Agora declara fontes, parâmetros, qualidade do
  dado, exceções com motivo, alertas por tipo e fatores com vigência, **tudo recortado
  pelo que o perfil pode ver**: para `importacao` a coleção de mobilidade nem chega a ser
  lida, não é filtro depois da leitura.
- **Decisão pendente é declarada, não deixada em branco.** Parâmetro sem valor aparece
  como "não definida", marcado, com a observação dizendo de que a decisão depende. Campo
  vazio parece bug ou dado perdido.
- **Descrição de alerta não chega ao cliente.** A descrição gravada na carga cita valor
  da linha — distância, matrícula, combinação recusada — e atravessaria a anonimização da
  §3.1 por uma porta lateral. A tela mostra tipo, severidade e quantos registros.
- A contagem de alerta é por **documento afetado**, não por ocorrência: é a pergunta que
  alguém realmente faz ao abrir a tela.

**Data de corte**

Nenhum literal em código, teste ou fixture: já era `VIAGENS_CORTE_FONTE`. O literal
estava no `.env.example`, que é versionado — o mesmo mecanismo pelo qual a data virou
compromisso. Agora vem vazia, com o motivo escrito ao lado.

A consulta de viagens passou a devolver `corteFonte`, lido do ambiente. Sem isso a tela
não teria como marcar a virada de fonte na série mensal nos primeiros meses do programa,
justamente quando a adesão é parcial e a marca mais importa: a série sozinha só mostra a
virada depois que existir submissão de formulário.

**`.env.example` varrido**

A regra que saiu do caso da coordenada da fábrica: **placeholder plausível é pior que
vazio.** Onde um valor de exemplo passaria por valor real e produziria número errado em
silêncio, o exemplo passou a ser vazio e o código recusa rodar sem o valor. Entraram
nessa regra a coordenada da fábrica, a data de corte, o ano-base da mobilidade, a
vigência dos fatores e a base de data do marítimo. `src/server/ambiente.test.ts` vigia
essa lista — placeholder plausível não volta por distração.

Saiu também `AUTH_SESSION_SECRET`, que nunca foi lido por ninguém: o cookie de sessão é
assinado pelo próprio Firebase. Segredo sem uso é credencial a mais para administrar.

**Decisões que não estavam no documento**

- **A camada de sessão lê `usuarioPerfil` fora de `src/server/consultas`.** Ela é
  anterior à camada de consulta, não uma exceção a ela: é quem produz o contexto que toda
  consulta exige, e depender da camada que depende dela seria circular. Ela lê o perfil de
  quem está pedindo, e nada mais.
- **A navegação é derivada do papel, e é promessa, não controle.** O controle está na
  consulta (§11.3). O menu apenas não oferece o que a consulta vai recusar: menu que
  mostra porta fechada ensina que existe porta. Tela ainda não construída aparece apagada,
  para o mapa do sistema ficar visível sem prometer link que não abre.
- **A raiz manda cada perfil para a primeira tela que ele pode abrir.** Mandar alguém
  para uma rota que vai recusá-lo transformaria autorização correta em erro aparente.
- **Os testes de autorização saíram de `agregacao.test.ts` para `acesso.test.ts`**, que é
  onde a regra agora mora.

**Bug encontrado durante a implementação**

- O ajudante que troca variáveis de ambiente nos testes restaurava o ambiente **antes** de
  a consulta assíncrona terminar, porque não esperava a promessa. O teste da data de corte
  definida lia o ambiente de fora e passava por acidente; o da data não definida passava
  pelo mesmo acidente, com o sinal invertido. Corrigido esperando a tarefa. Mesmo padrão
  das lições anteriores: indicador calculado sobre o conjunto errado não devolve erro.

**Validação**

- `tsc --noEmit`, `npm test` (62 testes, 22 novos) e `next build` passam. Nenhum servidor
  de desenvolvimento foi subido.
- A consulta de método foi exercitada contra o Firestore carregado, com um ensaio
  temporário que foi apagado em seguida: os três módulos respondem, os fatores voltam com
  vigência, os alertas voltam por tipo e severidade, e a checagem confirmou que nenhum
  identificador de pessoa e nenhuma descrição de alerta saem na resposta.
- Os testes novos cobrem a recusa da visão geral para `importacao`, a leitura que não
  acontece para o módulo que o perfil não vê, o parâmetro declarado como não definido, a
  exceção que sai como motivo e contagem, e o alerta que sai sem descrição.

**Pendência de operação, não de código**

O `.env` local tem valor preenchido em `VIAGENS_CORTE_FONTE`. Enquanto ele estiver lá, a
tela de Método vai declarar uma data de corte como se ela estivesse decidida. Se for o
valor de exemplo antigo, o certo é esvaziar a variável: a tela então diz "não definida",
que é o estado verdadeiro.

Feito em seguida, a pedido: a variável foi esvaziada no `.env` e a tela passou a declarar
a data como não definida. A §13 também foi corrigida — ela ainda dizia que nenhuma tela
tinha sido construída, o que deixou de ser verdade nesta etapa.

#### 2026-09-15 — Sessão endurecida e tela de Mobilidade

**Quatro perguntas do Gustavo sobre a sessão.** Duas já estavam resolvidas, duas não.
As quatro respostas viraram §11.9 a §11.12 — eram regra de segurança que só existia no
código, e regra que só existe no código é regra que some na próxima refatoração.

- **Atributos do cookie: já estava.** `httpOnly`, `secure` em produção, `sameSite: lax`
  e `path` na raiz. O `lax` é o que fecha o CSRF do caminho de escrita que a §10.6 vai
  ter, e o `secure` fica desligado em desenvolvimento porque o navegador recusaria um
  cookie `secure` em http e ninguém conseguiria entrar.
- **Validade: estava em cinco dias, virou doze horas.** O teto do Firebase é quatorze
  dias, e cinco já era conveniência cara num sistema que mostra dado de pessoa. Doze
  horas cobrem um dia de trabalho inteiro e expiram antes da manhã seguinte, então a
  sessão de um notebook esquecido aberto não amanhece válida. Um teste prende a duração
  entre o mínimo e o máximo que o Firebase aceita — estourar esse limite derruba **todo**
  login, e só apareceria na hora de entrar.
- **Sair não revogava nada: agora revoga.** O logout apagava o cookie do navegador, o
  que não invalida coisa nenhuma — quem tivesse copiado o valor continuaria entrando com
  ele até expirar. Passou a chamar `revokeRefreshTokens` antes de apagar o cookie, e a
  verificação da requisição seguinte recusa qualquer cookie emitido antes disso. O efeito
  alcança todas as sessões da pessoa, em todos os dispositivos: sair é sair.
- **Perfil revogado: o efeito imediato já existia, mas faltava como revogar.** O papel é
  lido de `usuarioPerfil/{uid}` a cada requisição, então rebaixar um perfil vale na
  requisição seguinte sem deslogar ninguém. O que não existia era o comando: o script só
  sabia conceder. Ganhou `npm run perfil -- alguem@dominio remover`, que apaga o
  documento **e** revoga o token, para a sessão aberta não continuar viva numa tela que
  não mostra mais nada. E `exigirSessao` passou a mandar para a tela de entrada quem
  tiver o perfil apagado no meio da navegação, em vez de devolver erro de servidor:
  quem precisa pedir liberação tem que entender o que houve.

**Fatia 2 — tela de Mobilidade (§10.2)**

Segunda tela. A camada de consulta já entregava tudo; nenhuma linha dela precisou mudar.

- Três indicadores — kg CO₂ por funcionário/mês, total do ano em toneladas e distância
  média —, radar, emissão por modal e os recortes por cidade e por bairro.
- **O radar recebe `number[]` e nada mais.** A assinatura é a garantia: nenhum
  identificador, bairro ou modal chega ao módulo que calcula as coordenadas, então não há
  o que vazar para o SVG por atributo, por ordem ou por descuido de quem mexer depois.
  Sem tooltip, sem clique, sem `title` — §3.1 ao pé da letra.
- **O ângulo não significa nada, e a tela diz isso.** A pesquisa não coleta direção e a
  distância é rodoviária; o ângulo só espalha os pontos. Sem o aviso, um radar convida à
  leitura de mapa onde não há mapa.
- A escala do radar é linear na distância, de propósito: comprimir a cauda esconderia
  exatamente quem mora longe, que é o que a tela existe para mostrar.
- O grupo que veio da supressão aparece **marcado**. Sem a marca, "outros" parece uma
  categoria da pesquisa em vez do balde que existe para não identificar ninguém.

**Conflito encontrado na especificação, e como foi resolvido**

A §1 diz que distância é insumo de cálculo e **não aparece na interface**. A §10.2 lista
"distância média" e "radar de onde o quadro mora" como conteúdo da tela de Mobilidade — e
o radar é, por construção, distância desenhada.

Segui a §10.2, por ser a mais específica: a regra da §1 mira as métricas de frete — peso,
volume, tonelada-quilômetro, intensidade por quilo —, que são o insumo que não pode ser
confundido com o resultado. **A decisão é do Gustavo**, e se ele quiser a §1 valendo
também aqui, sai um indicador e o radar precisa de outro desenho.

**Decisões que não estavam no documento**

- **`src/lib/formato.ts`**, com a formatação pt-BR num lugar só. Milhar e decimal
  espalhados à mão são como o mesmo número aparece de dois jeitos em duas telas do mesmo
  sistema.
- **`src/app/componentes.tsx`** com as peças compartilhadas. A tela de Método tinha cópia
  própria de duas delas; passou a usar as compartilhadas.
- **O teste passou a cobrir `scripts/`.** A regra de quem pode receber acesso mora no
  script de perfil, e regra sem teste é combinado.

**Validação**

- `tsc --noEmit`, `npm test` (76 testes, 14 novos) e `next build` passam. Nenhum servidor
  de desenvolvimento foi subido.
- A consulta de mobilidade foi exercitada contra o Firestore carregado, com um ensaio
  temporário que foi apagado em seguida: indicadores finitos, um ponto de radar por
  resposta na média, supressão de grupo pequeno atuando, radar sem NaN, e **nenhum
  identificador de pessoa na resposta**. A fração de distâncias distintas continua alta,
  como esperado depois da troca de provedor — a concentração que invalidou a primeira
  carga não voltou.
- Os testes novos cobrem a geometria do radar pelos casos que quebram: conjunto vazio,
  todo mundo na distância zero, distâncias iguais que não podem virar o mesmo ponto, e a
  forma do ponto, que não aceita campo além de coordenada.

#### 2026-09-15 — Fatia 3: tela de Viagens

Terceira tela. Foi a primeira que exigiu ampliar a camada de consulta: o mapa de rotas
precisa de coordenada de aeroporto, e a camada não lia essa coleção.

**Defeito encontrado antes da tela**

`serieMensal` prometia no comentário preencher mês ausente com zero, e não preenchia:
devolvia só os meses que tinham dado. Num gráfico de barras isso significa que um mês sem
viagem nenhuma some, o mês seguinte encosta no anterior e **a queda que houve desaparece**.
Mês sem emissão é informação; mês ausente é omissão. Passou a preencher entre o primeiro e
o último mês com dado — e só até aí, porque estender com zeros para a frente afirmaria que
não houve viagem em período que ainda não foi apurado. O teste que existia fixava o
comportamento antigo e foi corrigido junto: era o teste que carimbava o defeito.

**Mapa de rotas**

- A camada ganhou `mapa`, com as rotas aéreas já cruzadas com a coleção de aeroportos.
- **A supressão da §3.1 vale no mapa.** Rota voada por pouca gente não vira linha, porque
  a linha apontaria para essa gente. O mapa não pode ser a porta lateral que mostra o que
  a tabela esconde — é o mesmo limite, na mesma agregação. A tela diz quantas rotas
  ficaram de fora, e elas continuam somando no total.
- **Só trecho aéreo entra.** No carro, origem e destino são municípios, e a lista do IBGE
  ainda não foi carregada. A tela declara o recorte em vez de desenhar metade e calar.
- Projeção equirretangular, com uma escala só para os dois eixos — escalas separadas
  esticariam o desenho e fariam rota curta parecer longa por acidente de enquadramento.
- **Não há base cartográfica**, e a legenda diz isso: o desenho mostra a geometria das
  rotas, não navegação. Tile de provedor externo seria mais uma chave paga e mais um
  serviço para administrar; contorno embarcado é dado que ainda não vale o peso. Fica como
  melhoria possível, não como pendência.
- `coordenadaValida` recusa o ponto (0, 0): é coordenada legítima no Golfo da Guiné e é o
  que cadastro incompleto costuma trazer. Mesma lição da coordenada da fábrica, agora do
  lado do aeroporto.

**Troca de fonte marcada na série**

A marca sai da data de corte, não da série. Enquanto ninguém tiver registrado viagem pelo
formulário, a série sozinha não teria como mostrar a virada — que é justamente quando ela
mais importa, porque a adesão parcial faz a emissão parecer cair sem ter caído. Com a data
ainda não definida, a tela diz isso em texto em vez de deixar o gráfico mudo.

**Bug corrigido durante a implementação**

Na checagem de coordenadas eu havia cruzado a latitude de um aeroporto com a longitude do
outro. A condição era redundante com as duas seguintes, mas teria descartado uma rota cujos
dois extremos são válidos, na combinação em que a latitude de um e a longitude do outro
fossem zero.

**Validação**

- `tsc --noEmit`, `npm test` (85 testes, 9 novos) e `next build` passam. Nenhum servidor de
  desenvolvimento foi subido.
- Ensaio temporário contra o Firestore carregado, apagado em seguida: série sem buraco,
  emissão por viagem finita e positiva, **toda rota desenhada com pelo menos o número
  mínimo de pessoas**, coordenadas finitas, supressão atuando em destinos e rotas, e
  nenhum identificador de pessoa na resposta. Nenhuma rota caiu por falta de coordenada.
- Os testes novos cobrem a projeção pelos casos que quebram — ponto único, conjunto vazio,
  eixos com a mesma escala, norte em cima — e o preenchimento da série, inclusive na virada
  do ano.

#### 2026-09-15 — Dois tropeços na primeira execução no navegador

Nenhuma mudança de comportamento do sistema; as duas correções são de operação.

- **Não existia script `dev`.** A fundação foi montada sob a regra da §0 — eu não subo
  servidor de desenvolvimento — e o script acabou ficando de fora junto, então o Gustavo
  não tinha como rodar a aplicação. A regra é sobre quem executa, não sobre o projeto ter
  o comando. `npm run dev` existe agora.
- **Erro de hidratação vindo de extensão do navegador.** Uma extensão escrevia um atributo
  no `<html>` antes de o React hidratar, e o React acusava divergência entre servidor e
  cliente. Não era defeito do sistema. O elemento passou a declarar
  `suppressHydrationWarning`, que vale só para os atributos dele e não para a árvore
  abaixo: divergência dentro da aplicação continua sendo reportada. A supressão foi
  mantida estreita de propósito — cada uma delas é um pedaço a menos de diagnóstico.

#### 2026-09-15 — Levantamento do protótipo (sem aplicar nada)

**Lição sobre levantamento de repositório.** As três primeiras telas foram construídas sem
o protótipo, usando só a paleta da §4. O arquivo estava em `dados/`, que é ignorado pelo
git, e a varredura inicial procurou por extensão de **código** — `.ts`, `.tsx`, `.json` —,
não incluiu `.html`, e eu concluí que o protótipo não existia no repositório. A conclusão
errada entrou no plano e foi lida como fato verificado.

A regra que fica: **levantamento de repositório inclui os arquivos de referência, não só os
de código.** Protótipo, planilha de apoio, documento de especificação e diagrama moram fora
da árvore de código e às vezes dentro de pasta ignorada — pasta ignorada pelo git não é
pasta irrelevante para o trabalho. Quando o documento cita um arquivo pelo nome, o certo é
procurar aquele nome, não uma extensão que eu supus.

**Conflitos entre o protótipo e esta especificação.** O protótipo é referência visual, não
autoridade sobre o sistema: onde ele contradiz o documento, o documento vence. Foram
encontrados, e nenhum foi seguido:

- **Radar com direção.** O protótipo posiciona cada ponto por distância **e direção** em
  relação à fábrica. Direção não é dado que o sistema tenha — a §6.1 só permite persistir
  distância, bairro e cidade — e um ponto com raio e ângulo reais é um localizador quase
  único, o que a §3.1 proíbe justamente por permitir isolar um indivíduo. O radar
  construído usa ângulo sem significado, declarado na legenda.
- **Campo de motivo da viagem no formulário.** A §7.3 pede o mínimo que calcula emissão e
  diz explicitamente para não pedir justificativa; o campo já havia sido retirado na
  migração.
- **Métricas fora da lista da §10.** O protótipo tem cartões de "viagem mais longa" e
  "corredor mais pesado", que são registros extremos: além de não estarem na §10.3 nem na
  §10.4, um extremo isolado é um recorte de uma viagem só, contra a §3.1.
- **Equivalência em árvores** no indicador principal. Não é corte previsto na §10.1 e
  dependeria de um fator de conversão sem fonte na coleção de fatores — a §9.8 não admite
  fator embutido no código.
- **Alternância "Todos / Só as minhas"** na tela do programa. Em tela que mostra nome de
  viajante, "todos" só existe para `admin` e `sustentabilidade`; `gestor` não vê nome nem
  ali (§3.2), e `colaborador` só vê o próprio (§5.1). A alternância precisa nascer
  recortada por papel, não oferecida a todos.
- **Data de corte escrita como texto fixo** em dois lugares do protótipo. É a data de
  exemplo que a §7 retirou.

**Rótulos de interface que são dado de exemplo disfarçado.** A varredura pedida encontrou,
além de todos os números: o nome de um agente de carga real dentro de uma etiqueta de
estado; nomes de pessoas na lista de últimas viagens e no rodapé do menu; e uma lista de
portos e destinos nomeados em tabelas e nos mapas. Nada disso pode ser copiado como texto
de interface — §2.2 vale para rótulo igual vale para constante.

Nenhuma linha de tela foi alterada nesta etapa.

#### 2026-09-15 — Refinamento visual, do protótipo para as telas

Cinco passos, na ordem aprovada pelo Gustavo, com parada para revisão entre cada um.
Nenhuma mudança na camada de consulta e nenhuma mudança de conteúdo: o refinamento é de
linguagem visual.

**1. Fundação e casca.** As duas famílias tipográficas do protótipo, servidas pelo próprio
domínio — além de evitar o salto de layout, isso impede que o navegador de quem consulta o
inventário faça requisição a um provedor de fontes. Os seis tokens estruturais que a §4 não
nomeia entraram como token. A casca ganhou o menu lateral escuro, com as duas partes do
sistema rotuladas e separadas.

**2. Peças compartilhadas.** Painel, cartão de indicador em quatro camadas, etiqueta,
grades nomeadas, classes de tabela, seletor de período e cabeçalho. A abstração não foi
inventada: ela já estava escrita no protótipo, que define um sistema e não decoração por
tela.

**3. As três telas reaplicadas.** Método manteve o conteúdo, que é o da §10 e não o do
protótipo — este é anterior à lista mínima que a especificação passou a exigir.

**4. Gráfico de barras vertical.** Onde o protótipo usa barra, a lista horizontal deu
lugar a SVG. Onde ele usa tabela com colunas que a camada não entrega, a lista ficou.

**5. Acabamento de mapa e radar.** As rotas se desenham uma a uma; os aeroportos aparecem
depois; os pontos do radar entram do centro para fora.

**A decisão que atravessa os cinco passos: animação é de CSS, não de JavaScript.**

O protótipo anima adicionando classe pelo script — o bloco nasce invisível e só aparece
quando o JS roda. Isso significa que **script que não roda deixa a tela em branco com o
conteúdo presente no HTML**: extensão que atrapalha, erro de hidratação, navegador antigo.
Como animação de CSS, ela roda sozinha e termina no estado final de qualquer jeito, e o
atraso de cada bloco é calculado no servidor. O mesmo raciocínio no contador: o valor final
é o que está no HTML, e a contagem acontece depois — renderizar zero e contar até o valor
deixaria um relatório de emissão exibindo zero para quem tem JavaScript bloqueado.

Em `prefers-reduced-motion` a animação continua rodando, quase instantânea. Desligá-la
deixaria o conteúdo parado no primeiro quadro, invisível.

**Três divergências do protótipo, todas registradas com motivo**

- **O menu não desaparece em tela estreita.** No protótipo ele some abaixo de 1000px, o que
  deixaria quem abre no celular sem navegação nenhuma. Aqui vira faixa rolável no topo.
- **O radar não tem raios partindo do centro.** Eles desenham uma rosa dos ventos, e rosa
  dos ventos convida à leitura de direção que a §3.1 proíbe.
- **O radar não tem a varredura giratória.** É a animação mais bonita do protótipo e a que
  mais reforça a leitura errada: ela revela os pontos conforme gira, ou seja, **anima a
  dimensão angular** — justamente a que não carrega informação. Os pontos passaram a
  aparecer do centro para fora, na ordem da distância: a animação continua existindo e
  encena a única dimensão que o desenho de fato tem.

**Bug introduzido e corrigido dentro da etapa**

O cartão de indicador passava a função de formatar como prop para o contador, que é
componente de cliente. **Função não atravessa a fronteira entre servidor e cliente**, e
nem o typecheck nem o build acusam: a assinatura é válida em TypeScript, e páginas
dinâmicas não são renderizadas no build. O erro só aparece na primeira requisição. Agora o
que atravessa é o número de casas decimais, e os dois lados chamam o mesmo formatador.

**A lição vale além do caso:** neste projeto, `next build` passar **não quer dizer que a
tela abre**. Todas as páginas são dinâmicas, então o build só compila. Quem exercita a
renderização é quem carrega a página — e não há guarda automática honesta para essa classe
de erro. Foi procurada e não existe barata: a serialização só acontece na requisição.

**Outros defeitos corrigidos no caminho**

- O gráfico de barras localizava a marcação visual de cada barra por rótulo, num mapa.
  Dois rótulos iguais colapsariam numa barra só. Passou a ser por índice.
- Barra com valor pequeno e barra ausente ficavam idênticas na tela. Valor não nulo passou
  a receber altura mínima.

**Validação**

- `tsc --noEmit`, `npm test` (92 testes, 7 novos) e `next build` passam. Nenhum servidor de
  desenvolvimento foi subido.
- Os testes novos cobrem a geometria das barras pelos casos que estouram: série inteira
  zerada, valor mínimo que não pode sumir, barras que não podem se sobrepor e série longa,
  que rareia rótulo e esconde valor.

**Em aberto desta etapa**

- **O logo.** O protótipo traz um PNG embutido; ficou a marca tipográfica. Colocar a arte
  no repositório é decisão do Gustavo, porque é ativo de marca entrando em repositório
  público.
- **Contorno de continente no mapa.** Por último e separado: dado geográfico tem licença, e
  um contorno colado no repositório é coisa que entra sem ninguém olhar de onde veio. A
  opção será apresentada antes de qualquer arquivo entrar.
- **Tabelas com colunas que a camada não entrega.** Destinos com número de viagens e kg por
  viagem, contêineres por porto, e a barra empilhada de qualidade do dado. Ampliar a camada
  para preencher desenho é decisão de escopo, não de acabamento.

#### 2026-09-15 — Os três itens em aberto do refinamento, fechados

Decisão do Gustavo: entram os três. Dois deles eu tinha recomendado contra ou condicionado,
e ficam registrados com o argumento, porque decisão revertida sem motivo escrito volta a ser
discutida daqui a seis meses.

**Varredura do radar — volta, com a legenda pagando a conta**

Eu havia argumentado contra: a varredura revela os pontos conforme gira, ou seja, **anima a
dimensão angular**, que aqui não carrega informação nenhuma (§3.1). O Gustavo decidiu
mantê-la, e a contrapartida combinada era a legenda trabalhar mais — ela agora diz em duas
frases separadas que a direção não significa nada, com o exemplo de dois pontos vizinhos que
podem morar em extremos opostos da cidade, e que a varredura só escolhe a ordem em que os
pontos acendem.

Os raios partindo do centro continuam fora: eles desenham uma rosa dos ventos **permanente**,
enquanto a varredura passa e some. A diferença entre as duas coisas é essa.

A varredura é CSS puro, sem laço no navegador: `montarRadar` passou a devolver o ângulo de
cada ponto, e o atraso da revelação sai dele. O campo novo tem comentário dizendo que **não
é direção** — quem for consumi-lo depois precisa encontrar o aviso junto do dado.

**Defeito que a varredura expôs, e que já existia**

Em `prefers-reduced-motion` eu zerava a duração das animações e **não o atraso**. Como todos
os atrasos deste sistema são calculados no servidor e somam segundos — a cascata dos blocos,
o crescimento das barras, o desenho das rotas —, quem pede menos movimento estava recebendo
o conteúdo aos poucos, que é exatamente o que essa preferência pede para não acontecer. O
atraso passou a ser zerado junto.

**Logo — entra como arquivo em `public/`**

Extraído do protótipo, onde estava embutido em base64. É ativo de marca entrando em
repositório público, e por isso a decisão era do Gustavo. Dimensões declaradas no `img`
para o menu não pular enquanto ele carrega.

**Contorno dos continentes — por script, não por caminho colado**

O risco que eu havia levantado era procedência: um `path` gigante colado num arquivo entra
sem ninguém olhar de onde veio. A solução foi um gerador, `scripts/gerar-contorno.ts`, que
documenta a origem no cabeçalho e torna o resultado reprodutível — quem duvidar roda de novo
e compara. O dado é Natural Earth 1:110m, domínio público, chegando pelo pacote
`world-atlas`, sob licença ISC. O script descarta ilhas abaixo de um limite de área e
arredonda a coordenada, porque no tamanho em que o mapa é desenhado a precisão restante não
aparece.

**Medir antes de aceitar.** Com o contorno funcionando, a medição contra as rotas reais
mostrou o custo: dois anéis entravam no enquadramento e levavam **2.246 vértices** ao HTML,
cerca de 29 KB, quase todos fora da moldura — a América do Sul inteira desenhada para o
navegador recortar. Entrou o recorte de polígono (Sutherland–Hodgman), em grau, antes de
projetar: **2.246 vértices viraram 24**. O ganho não era óbvio no olho; era óbvio na medida.

**Validação**

- `tsc --noEmit`, `npm test` (99 testes, 7 novos) e `next build` passam. Nenhum servidor de
  desenvolvimento foi subido.
- Os testes do recorte cobrem os casos que quebram: anel todo dentro, todo fora, atravessando
  a borda, maior que a moldura — que precisa virar a própria moldura —, aresta paralela à
  borda, que é onde nasce divisão por zero, e anel degenerado.
- O ganho do recorte foi medido contra as rotas reais com ensaio temporário, apagado em
  seguida.

#### 2026-09-15 — Fidelidade visual ao protótipo, e o que a comparação revelou

O Gustavo comparou as telas com o protótipo e apontou duas coisas: as animações estavam
piores, e o mapa não mostrava rotas intercontinentais que aparecem no desenho. A segunda
não era problema de animação nenhum.

**Não há rota intercontinental na base.** A rota mais longa carregada é doméstica, com
folga. As rotas para Ásia, Europa e América do Norte que o protótipo desenha são **dado
inventado**, como a §0 avisa que todos os números dele são. Não há o que consertar no mapa:
ele desenha o que existe.

**A supressão está removendo a maior parte das rotas, e isso precisa ser uma decisão
consciente.** Medido contra a base: de cada dez rotas distintas, cerca de nove são voadas
por menos gente que o limite da §3.1 e viram "outras rotas"; quase um terço da emissão por
destino cai no balde de agrupados. O motivo é a natureza da viagem corporativa aqui — a
maioria é uma ou duas pessoas indo a um lugar —, e o efeito é um mapa com poucas linhas e
uma lista de destinos curta.

**Isto não é defeito: é a regra funcionando.** Uma rota voada por uma pessoa aponta para
essa pessoa, mesmo sem nome, para qualquer um que saiba quem viaja. Fica registrado porque
a magnitude não era evidente quando o limite foi escrito, e porque baixá-lo é decisão de
privacidade — não de layout.

**O que mudou no radar**

- **A escala passou a ser a raiz quadrada da distância**, como no protótipo. A linear era
  mais fiel ao número e ilegível com dado real: a maioria mora perto, todo mundo empilhava
  num borrão central e o resto do desenho ficava vazio. Com a raiz, a área de cada faixa
  fica proporcional a quantas pessoas ela costuma conter.
  O preço está declarado na legenda: **a distância se lê no anel, não no raio.** É por isso
  que os anéis aqui não são decoração.
- **Os anéis dobram de valor** a partir de uma escada de números redondos, e **sempre há um
  anel na borda**, na distância de quem mora mais longe. Sem ele, o limite do desenho não
  dizia nada — e era isso que acontecia com a base atual, em que o maior valor redondo caía
  bem antes da margem.
- Entraram os raios da grade, os pontos maiores e mais claros na faixa próxima, e a
  varredura já estava.

**O que mudou no mapa**

- **As rotas viraram arco**, como no protótipo. Além de parecido, resolve um problema real:
  duas rotas entre os mesmos pontos deixam de se sobrepor.
- O desenho progressivo do arco usa `pathLength`, que normaliza o comprimento do traço —
  obter o comprimento real de uma curva quadrática exigiria integração numérica.
- Entrou a legenda no canto.

**Validação**

- `tsc --noEmit`, `npm test` (102 testes, 3 novos) e `next build` passam. Nenhum servidor de
  desenvolvimento foi subido.
- Os testes novos cobrem a escada de anéis, a borda que nunca fica muda e a propriedade que
  motivou a troca de escala: quem mora perto continua ocupando área visível.
- Os anéis e a supressão foram conferidos contra a base com ensaio temporário, apagado em
  seguida.

#### 2026-09-15 — Três defeitos de animação, dois deles de origem de transformação

O Gustavo reportou erro de hidratação e animações que continuavam sem parecer as do
protótipo. Eram três defeitos distintos, e nenhum deles aparecia em typecheck, teste ou
build.

**`title` de SVG com mais de um filho quebra a hidratação.** O analisador de HTML trata o
conteúdo de `title` como texto cru; com vários filhos, o React insere marcadores de
comentário entre eles, o texto cru fica com lixo no meio e a hidratação falha. A correção é
montar a string antes e passar um filho só.

**`transform-origin` em SVG precisa de `transform-box`, e sem ele aponta para fora do
elemento.** Por padrão a referência é o quadro do SVG inteiro, não o elemento:

- na barra do gráfico, `bottom` virava a base do quadro, e a barra **esticava a partir de um
  ponto fora dela** em vez de crescer da própria base;
- na varredura do radar, `center` virava o meio do quadro. Como a cunha vive dentro de um
  grupo já centralizado, o eixo de rotação caía longe do centro e ela **varria de través** —
  era isto que fazia o radar não parecer um radar.

A lição é a que vale guardar: em SVG, `transform-origin` sem `transform-box: fill-box` quase
nunca significa o que se quer dizer. Onde a origem é o próprio ponto zero do elemento — o
caso da cunha, desenhada a partir da origem dentro de um grupo já posicionado —, o certo é
`0 0`, e não `center`.

**O contador piscava.** O valor final vem do servidor de propósito (§ entrada anterior), e a
volta para zero acontecia em efeito comum, depois da primeira pintura: o número aparecia
pronto, saltava para zero e só então subia. Passou a acontecer em efeito de layout, antes da
pintura. No protótipo o problema não existe porque lá o zero já está no HTML — aqui ele não
pode estar.

**Sobre as três, a mesma observação de método:** nenhuma seria pega por `tsc`, por teste ou
por build. Origem de transformação e ordem de pintura só existem quando há navegador
pintando, e quem pinta é quem abre a tela.

#### 2026-09-15 — Terceira fonte de viagens: a planilha do cartão

O Gustavo trouxe uma planilha de viagens pagas no cartão empresarial, suspeitando que não
estivessem na base. Estavam fora mesmo — e **eram justamente as viagens intercontinentais
que eu havia afirmado não existir**. A afirmação estava certa sobre o relatório da agência e
errada sobre a empresa: viagem paga no cartão não passa pela agência.

**A correção do meu erro de leitura:** eu concluí "não há rota intercontinental" olhando a
única fonte carregada. O certo seria dizer "não há na base da agência" — e perguntar se
existia outra fonte. Fonte única não autoriza afirmação sobre o todo.

**O que entrou**

- `src/lib/cartao.ts` — leitura da planilha, pura e testada. Ela é digitada à mão: código
  IATA e nome de cidade na mesma célula, erro de digitação, separador irregular, e data só
  na primeira linha de cada bloco. O módulo lê ao pé da letra e **sinaliza o que não
  entende**; linha ilegível é descartada com motivo, nunca em silêncio.
- `scripts/seed-aeroportos.ts` — quatro aeroportos internacionais não existiam no cadastro,
  e sem coordenada não há distância. O script resolve a coordenada por geocodificação, com o
  provedor já declarado no método, **imprime o que encontrou e não grava sem `--gravar`**:
  código mal resolvido põe o aeroporto do outro lado do mundo e a distância sai errada em
  silêncio. Digitar coordenada de memória seria inventar dado.
- `scripts/ingest-cartao.ts` — carga com escopo próprio, simulação por padrão.
- `FonteDaViagem` ganhou `cartao`, e a §7 passou a descrever as três fontes.

**Decisões da carga**

- **Bloco separado por linha em branco vira a viagem.** É a única estrutura que a planilha
  tem de fato. O efeito colateral está registrado: uma viagem partida em três blocos conta
  como três viagens, e isso puxa para baixo o indicador de emissão por viagem.
- **Nome de uma palavra não vincula ao cadastro.** Mesma regra da mobilidade: homônimo não é
  fundido. Vincular pelo palpite atribuiria a viagem à pessoa errada e estragaria a contagem
  de pessoas distintas que sustenta a supressão.
- **O uplift É aplicado aqui**, ao contrário da carga da agência — a distância é calculada
  do zero, então a regra da §7.2 vale no sentido inverso.

**O que a carga revelou, e é decisão do Gustavo**

Dezesseis trechos acrescentaram cerca de **um quarto da emissão total de viagens**. E, por
serem voados por uma pessoa cada, **todos caem na supressão**: as rotas que mais pesam no
inventário são exatamente as que o mapa não pode desenhar. A regra está certa — uma rota
voada por uma pessoa aponta para ela —, mas agora o custo de exibição ficou concreto.

**Validação**

- `tsc --noEmit`, `npm test` (117 testes, 15 novos) e `next build` passam.
- A carga rodou primeiro em simulação, trecho a trecho, e só depois gravou. As distâncias
  conferem com a ordem de grandeza esperada para cada par de aeroportos.
- Os testes novos cobrem o que a planilha tem de traiçoeiro: nome de lugar que precisa vir
  antes do código de três letras — senão "BOA VISTA" vira um código inexistente —, lugar
  repetido por extenso que não pode virar escala, separador irregular, bloco sem data e
  bloco com dois nomes.

#### 2026-09-15 — Conferência de cobertura, e a lição da fonte única

**A lição, que o Gustavo pediu para ficar registrada junto das outras.**

> **Fonte única não autoriza afirmação sobre o todo.** Eu olhei a única base carregada e
> concluí "não existe viagem intercontinental". A frase verdadeira era "não existe na base
> da agência", seguida de uma pergunta: existe outra fonte? A diferença entre as duas
> frases foi um quarto da emissão de viagens ficando fora do inventário — e quem percebeu
> foi o Gustavo, por acaso, notando que faltava China.

Ela se soma às duas anteriores, e as três são a mesma família:

- **coerência** responde "a conta fecha?" — e passou enquanto a distância estava errada;
- **plausibilidade** responde "o insumo é crível?" — e passou sobre um conjunto vazio;
- **cobertura** responde "chegou tudo?" — e é a que faltava.

**A conferência nova**

`verificar.ts` ganhou o bloco de cobertura: para cada fonte de viagens, **conta os trechos
no arquivo de origem e compara com o que está no banco**. Divergência falha, com esperado,
obtido e diferença.

Duas decisões dentro dela, que é onde mora o valor:

- **Ela imprime a lista das fontes que conhece.** Nenhuma conferência pode acusar um
  arquivo de que nunca ouviu falar; mas pode deixar visível o que cobre, para a ausência
  saltar aos olhos de quem lê. Foi exatamente por não existir essa lista que uma fonte
  inteira passou despercebida.
- **Fonte gravada no banco sem conferência que a cubra vira aviso.** É o mesmo ponto cego
  do outro lado: dado que entrou e não tem quem o confronte com a origem.

Arquivo de origem ausente não falha — diz quantos trechos ficaram sem conferência, porque
a máquina de quem roda nem sempre tem todos os arquivos.

**Conferido pelos dois lados:** com as duas fontes no lugar, as contagens batem. Com uma
linha removida de uma cópia da planilha, a conferência **falhou e o script saiu com
código 1**, apontando a diferença. Guarda que não morde não é guarda.

**Medição do corredor, pedida antes de implementar**

O Gustavo pediu para trocar a unidade do mapa de rota par-a-par para corredor por região,
e pediu os números antes. Medidos contra a base:

| Unidade | Grupos | Passam a supressão | Emissão visível |
|---|---|---|---|
| Rota par-a-par | 70 | 7 | 35% |
| Corredor por região | 12 | 5 | 66% |

**O corredor quase dobra a emissão visível, e mesmo assim não resolve o internacional.**
Os corredores para fora do país têm **uma pessoa cada**; agregando todos num único
"Brasil ↔ Exterior" dá duas. A restrição não é a granularidade do recorte — é que duas
pessoas na empresa inteira viajaram para fora no período. Agregar geografia não cria gente.

Nada disso foi implementado: a decisão é do Gustavo, e ficou registrada a alternativa que
não vaza — declarar o peso que não pode ser desenhado como número, sem lugar.

