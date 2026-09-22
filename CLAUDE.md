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

**Registre o que fizer** na seção 15.

---

## 0.1 A separação que governa tudo

**Este repositório abriga dois sistemas que compartilham casca, sessão e visual, e
nada mais.** Quem confundir os dois vai produzir número errado, e já produziu.

| | **Inventário** | **Programa de viagens** |
|---|---|---|
| O que é | Relatório de emissões da empresa | Registro voluntário de viagem pelo colaborador |
| Telas | Visão geral, Mobilidade, Viagens, Marítimo, Transportadoras | Registrar viagem, Emissões registradas |
| Origem do dado | Planilha, carga controlada, fora da aplicação | Formulário, escrita pela aplicação |
| Completude | Fonte administrativa completa do período | Adesão parcial e voluntária |
| Coleções | `mobilidade`, `viagemTrecho`, `embarque`, `entregaRodoviaria` | `viagemRegistrada` |

**Os dados do programa nunca entram no inventário.** Não somam, não aparecem em
série do inventário, não entram em indicador de inventário, não são comparados
lado a lado. Uma consulta do inventário que leia a coleção do programa é defeito,
não decisão de produto.

**Por que a separação é obrigatória, e não preferência.** Somar uma fonte
administrativa completa com uma autodeclaração voluntária produz série sem
significado: a variação mede quanta gente preencheu, não quanta emissão houve.
Uma queda seria lida como redução de emissão quando é queda de adesão. Em
relatório que alguém assina, isso é pior que não ter o dado.

**O que isso apaga da versão anterior deste documento.** O §7 dizia que agência e
formulário eram a mesma série separadas por uma data de corte. Estava errado, e
foi a origem da maior parte da complexidade acidental do sistema: contagem de
trecho por fonte, marca de virada na série mensal, data de corte como parâmetro,
declaração de fonte no método do módulo e o defeito da subtração. Nada disso tem
razão de existir depois desta separação.

---

## 1. O que este sistema é

Um inventário de emissões com quatro módulos e um painel consolidado.
**Somente relatórios de emissão** — sem cenários de redução, sem simulações, sem projeções.

| Módulo | Escopo GHG | Métrica exibida |
|---|---|---|
| Mobilidade casa-trabalho | Escopo 3, cat. 7 | kg CO₂ por funcionário por mês |
| Viagens corporativas | Escopo 3 cat. 6 / Escopo 1 | kg CO₂ por viagem |
| Transporte marítimo de importações | Escopo 3, cat. 4 | kg CO₂ por contêiner |
| Distribuição rodoviária às filiais | Escopo 3, cat. 4 e cat. 9 — ver §9.1 | kg CO₂ por filial |
| Painel consolidado | — | toneladas de CO₂e no ano-base do inventário (§11.0) |

**Regra de exibição:** peso, volume, distância, tonelada-quilômetro e intensidade por quilo
são insumo de cálculo e **não aparecem na interface**.

### 1.1 O sistema tem duas partes separadas

**Inventário** — retrospectivo, alimentado por bases fechadas. Telas: Visão geral,
Mobilidade, Viagens, Marítimo e Transportadoras.

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

### 3.1 Inventário — sem pessoa identificável

**Vale em todas as telas do inventário, sem exceção e sem módulo de fora:**

- **Nunca exibir nome, matrícula, e-mail ou qualquer identificador de pessoa.** Nem em
  tabela, nem em tooltip, nem em legenda, nem em exportação.
- O identificador interno existe no banco para cálculo e deduplicação, mas **não é enviado
  ao cliente**. Ele é lido na camada de consulta, serve para contar e agrupar, e morre ali:
  o agregado sai pronto do servidor (§10.10, §12.5).
- A base histórica de viagens contém nomes de passageiros. Eles são carregados para ligar a
  viagem ao funcionário e **não aparecem em tela nenhuma do inventário**.

**A supressão de grupos pequenos é outra coisa, e vale só na Mobilidade.** O que segue
explica por quê, e precisa ser lido antes de qualquer tentativa de uniformizar a regra
entre os módulos.

#### O raciocínio, que importa mais que a regra

**O objeto deste painel é a empresa, não as pessoas.** A pergunta que ele responde é quanto
a empresa emitiu, direta e indiretamente, pelos módulos do inventário. **Uma rota é fato da operação
da empresa**, não dado pessoal de quem embarcou: o voo aconteceu a serviço, foi pago pela
empresa e faz parte do que ela precisa relatar.

**Suprimir o que já é sabido não protege ninguém.** As viagens internacionais são feitas
pela diretoria, e isso é de conhecimento geral dentro da empresa. A supressão existe para
impedir reidentificação; onde não há o que reidentificar, ela não protege — só esconde.

**E o estado que ela produzia era o pior dos dois mundos.** A emissão das rotas suprimidas
**já estava no total** — a supressão nunca omitiu emissão, omitiu **de onde ela veio**.
Escondia exatamente a informação que explicaria o número grande, deixando quem lê com um
total que não se explica pelo mapa e sem meio de descobrir por quê. Um terço da emissão
aérea ficava sem lugar.

**A discrepância entre um voo curto e um intercontinental não é problema a esconder: é o
achado.** Um inventário existe para tornar visível que poucos deslocamentos concentram
muita emissão. Apagar a origem desse peso é apagar a conclusão.

**Nada disso vale para onde a pessoa mora.** Bairro e cidade de residência não são fato
operacional da empresa, não são de conhecimento geral e não foram escolhidos por ninguém a
serviço. É essa a distinção que separa os dois módulos, e é por ela que a regra difere.

#### 3.1.1 Mobilidade — suprime

- **Supressão de grupos pequenos:** não exibir recorte com menos de **5 pessoas**. Um bairro
  com um respondente identifica esse respondente mesmo sem o nome dele. O que ficar abaixo
  do limite é agrupado em "outros", e o grupo agrupado aparece marcado como tal.
- A contagem da supressão é de **pessoas distintas**, nunca de registros.
- No radar, cada ponto é um funcionário **sem nenhum dado associado**. Sem tooltip, sem
  clique, sem nada que permita isolar um indivíduo.
- **O que se clica no radar é a faixa entre dois anéis, nunca o ponto** — e a distinção é a
  regra inteira, não um detalhe de implementação. Clicar num ponto mostraria o modal e a
  distância de uma pessoa: com as distâncias quase todas distintas depois da troca de
  provedor (§15), esse par identifica tão bem quanto um nome, e é literalmente "isolar um
  indivíduo". A faixa responde à mesma pergunta — **quem mora a esta distância vai de
  quê?** — em agregado, com a supressão por cima: modal com pouca gente dentro da faixa cai
  no balde, e numa faixa pequena cai tudo. A contagem de pessoas da própria faixa não é
  informação nova, porque o radar já desenha um ponto por pessoa e contá-los é olhar o
  desenho; o que a supressão protege é o **atributo**.
- **A faixa sai dos mesmos limites que desenham os anéis**, de uma função só. Com um número
  em cada ponta, a tela ofereceria um recorte que o agregado não mediu — e o erro sairia
  como número plausível, nunca como falha.
- **O ângulo do radar não tem significado, e isso é decisão de privacidade, não preguiça de
  implementação.** O protótipo posiciona cada ponto por distância *e direção* em relação à
  fábrica. Raio e direção reais, juntos, formam um localizador quase único: apontam para uma
  casa mesmo sem nome, sem bairro e sem tooltip — é reidentificação por geometria. Direção
  também não é dado que o sistema possa ter, porque a §6.1 só permite persistir distância,
  bairro e cidade. O ângulo serve apenas para os pontos não se empilharem, e a tela declara
  isso em texto para ninguém ler um mapa onde não há mapa.

#### 3.1.2 Viagens — não suprime

Recorte por **rota, corredor e destino não é suprimido por contagem de pessoas.** Rota é
fato operacional, pelo raciocínio acima.

O que **continua valendo** aqui, e não é afetado:

- nenhum nome, matrícula, e-mail ou identificador de pessoa em tela — a mudança é sobre
  **rota**, não sobre **pessoa**;
- nenhum identificador trafega para o cliente. A supressão sair de Viagens não arrasta
  junto a regra do agregado sair pronto do servidor;
- nada que permita isolar um indivíduo dentro de um recorte: a tela mostra emissão por
  rota, nunca a lista de quem voou.

**Se um dia uma tela de Viagens precisar de um recorte que aponte para uma pessoa** — um
extremo isolado, "a viagem mais longa", um corte por pessoa —, o que o barra não é a
supressão: é a primeira regra desta seção, que continua absoluta.

#### 3.1.3 Marítimo — não há pessoa a suprimir

**Embarque não tem pessoa.** O documento tem agente, empresa, portos, navio, contêineres e
emissão; não há funcionário, não há passageiro, não há residência. Supressão por contagem de
pessoas **não se aplica aqui e não existe neste módulo** — não é omissão a corrigir quando o
módulo for construído.

Duas coisas para não tropeçar depois, porque as duas são fáceis de fazer por engano:

- **Não inventar uma supressão por contagem de documentos.** A função de agrupamento, quando
  não recebe identidade de pessoa, trata cada documento como uma pessoa distinta — é o lado
  seguro de errar num módulo que tem pessoas. Passar um limite ao marítimo nesse estado
  produziria uma supressão que **mede número de embarques e finge medir privacidade**:
  esconderia corredor pouco usado sem proteger ninguém, que é exatamente o erro que a
  §3.1.2 acaba de desfazer em Viagens.
- **Nome de agente, de navio, de cliente e de fornecedor é assunto da §2.2, não desta
  seção.** A restrição ali é sobre o **repositório**: esses nomes nunca viram constante,
  fixture, rótulo escrito à mão ou massa de teste. Chegar à tela vindo do banco em tempo de
  execução é outro caminho, e é o normal — o sistema é interno e o acesso é por perfil (§5).

#### Aviso a quem for mexer nisto

**A regra difere entre os módulos de propósito.** Se você chegou aqui achando que há uma
inconsistência a uniformizar, releia o raciocínio acima: a diferença não é acidente
histórico, é a distinção entre fato operacional da empresa e lugar onde uma pessoa mora.
Uniformizar para cima devolve a Viagens uma supressão que esconde um terço da emissão sem
proteger ninguém; uniformizar para baixo tira da Mobilidade a única coisa que impede
identificar um respondente pelo bairro.

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
credencial a mais para administrar. Ver seção 14.

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
fosse o inventário — o erro que a §10.10 existe para impedir. A navegação não oferece a tela
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
- Respostas marcadas como exceção não entram na média e são listadas no método do
  módulo (§11.5).

O campo de combustível só é válido para modais motorizados; preenchido em modal não
motorizado, ou vazio em modal motorizado, é erro de entrada e deve ser sinalizado.

---

## 7. Módulo Viagens corporativas (inventário)

Cobre **aéreo** e **carro**. Faz parte do **inventário** (§0.1) e tem **duas fontes,
ambas administrativas**:

| Fonte | Situação |
|---|---|
| Relatório da agência | Carga única, **imutável** |
| Planilha do cartão empresarial | Viagem que não passa pela agência |

**O formulário do viajante não é fonte deste módulo.** Ele alimenta o programa de
viagens (§7.5), que tem coleção e telas próprias. Não há data de corte, não há troca de
fonte na série, não há marca de virada: as duas fontes deste módulo são administrativas,
cobrem o mesmo tipo de registro e convivem sem ressalva.

O campo `fonte` (`agencia` | `cartao`) continua existindo, mas **por causa do escopo de
recarga**, não para dividir a série. Regravar uma fonte não pode enxergar nem apagar a
outra.

**A planilha do cartão é uma segunda fonte administrativa, não um complemento da agência.** São
viagens pagas no cartão empresarial, que por isso não aparecem no relatório da agência —
foi assim que as viagens intercontinentais entraram no inventário. Ela tem escopo de recarga
próprio (`fonte = cartao`), então regravá-la não enxerga nem apaga o que veio das outras
duas fontes.

Três coisas dela mudam o número e ficam declaradas no método do módulo (§11.5):

- **a distância é calculada na carga**, pela ortodrômica entre os aeroportos com o uplift
  aplicado, porque a planilha não traz distância — ao contrário da base da agência, em que
  ela já vem pronta e com o uplift embutido (§7.2);
- **a data vale para o bloco inteiro.** A planilha traz data só na primeira linha de cada
  viagem, e os demais trechos herdam. Para o total do ano não muda nada; para a série
  mensal, um trecho de volta pode cair no mês seguinte e ser contado no anterior;
- **o viajante vem só pelo primeiro nome.** Nome de uma palavra não identifica ninguém, e
  vincular pelo palpite atribuiria a viagem à pessoa errada — o vínculo com o cadastro é o
  que liga emissão a funcionário, e errá-lo corrompe o dado na origem. A ponte entre o
  primeiro nome e o cadastro é um mapa que mora fora do repositório, porque nome real não
  se versiona (§2.1).

  **Quem não casa com o cadastro para a carga, e ela diz quem falta.** Esta carga não cria
  pessoa. A versão anterior deste parágrafo mandava o contrário — entrar como registro
  próprio, com alerta no trecho —, e foi assim que uma companhia aérea virou funcionário:
  o texto abaixo do nome, dentro do bloco, é a companhia. Criar pessoa a partir de planilha
  é barato de fazer e caro de desfazer, e infla justamente a contagem de pessoas distintas
  que sustenta a supressão da mobilidade (§3.1.1) e o denominador de adesão do programa
  (§7.5).

**Não existe data de corte.** O `VIAGENS_CORTE_FONTE` e tudo que dependia dele saem: a
premissa que os justificava foi apagada pela §0.1. Variável de ambiente que ninguém lê é
armadilha esperando alguém encontrar.

**O inventário agrupa pela data do voo ou da viagem, nunca pela data de lançamento da
passagem.**

### 7.0 Ano-base: um relatório por ano

**O inventário de viagens relata um ano, declarado em `VIAGENS_ANO_BASE`.** O trecho entra
pelo **ano do voo**, não pelo da emissão da passagem — há passagem comprada num ano com voo
no seguinte, e ela pertence ao relatório do ano em que se voou.

Trecho fora do ano-base **não é carregado**. Não é dado perdido: é dado de outro período, e
uma carga com outro ano-base o traz.

**O escopo de recarga é fonte E ano.** A fonte protege o que veio de outra origem; o ano
protege os outros períodos. Sem o ano no escopo, carregar um ano apagaria o anterior
inteiro, porque a recarga remove do escopo tudo que não está na carga nova (§10.9) — e um
inventário que só consegue guardar um ano de cada vez não é um inventário.

A variável **não tem padrão**: ano de exemplo é placeholder plausível, que carregaria o
período errado sem nenhum erro aparecer. As cargas recusam rodar sem o valor, e a tela de
método declara qual é.

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
  é declarado no método do módulo (§11.5).
- Escalas contam como trechos separados e emitem mais que um voo direto equivalente.

Fatores: DEFRA/UK DESNZ, kg CO₂e por passageiro-km, **com forçamento radiativo**, por faixa
de distância. Os valores vêm do JSON da base, carregados para a coleção `fatorEmissao`.

Na base de origem, quem aprovou a passagem às vezes é a agência e às vezes o próprio
passageiro. **Para emissão, o que vale é quem viajou, não quem aprovou.**

### 7.5 Programa de viagens (não é inventário)

**Sistema separado, sob as mesmas casca, sessão e paleta.** Vale tudo o que a §0.1 diz:
coleção própria (`viagemRegistrada`), telas próprias, e **nenhum dado daqui entra em
consulta, indicador, série ou mapa do inventário**.

O objetivo é centralizar num lugar só a informação de deslocamento que hoje não está em
sistema nenhum, e dar ao colaborador o retorno imediato da própria emissão. Não é fonte
de relatório: é adesão voluntária, e tratar adesão como medição produz série que mede
preenchimento, não emissão.

O cálculo reaproveita os mesmos fatores e as mesmas funções de emissão do inventário —
o que não se compartilha é o **dado**, não a matemática.

Quem viajou preenche. **Não há fluxo de aprovação** — se a viagem aconteceu, já foi aprovada
antes. O viajante vê apenas as próprias submissões e pode editar enquanto o período não for
fechado.

**O que fecha um período: uma data no ambiente, `PROGRAMA_FECHADO_ATE`.** Viagem cuja ida
seja até ela, inclusive, fica somente leitura; a submissão continua visível para quem a
fez, continua contando e não se apaga. **Fechar é operação, não tela** — acontece fora da
aplicação, como conceder perfil e rodar carga (§5). Um botão que fechasse precisaria de
quem pode apertá-lo, de registro de quem apertou e de como desfazer, e nada disso se paga
num programa que não é fonte de relatório. Vazia, nada está fechado: é o estado inicial, e
a tela o declara. A trava está **na escrita**, não na interface (§12.3) — a tela deixa de
oferecer o botão, mas quem impede é a consulta.

**Reenviar a mesma viagem grava uma.** O identificador da submissão é derivado de quem
registrou e do que registrou — trajeto e datas —, então um clique repetido sobrevive sem
dobrar a emissão de ninguém. Duas viagens com o mesmo trajeto e as mesmas datas não são
duas viagens.

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

**A classe da cabine é perguntada, e é a outra exceção ao formulário mínimo** — pelo mesmo
critério dos três campos do carro: ela entra na conta. No inventário a econômica é
*assumida*, porque o relatório da agência não informa a cabine (§7.2); aqui quem preenche é
quem voou e sabe. Executiva multiplica a emissão do trecho por quase três, e assumir o que
se pode perguntar seria descartar informação de graça. O seletor vem em econômica, então
quem não tem o que dizer não precisa dizer nada.

**A faixa de distância não é perguntada**: ela é calculada, como no inventário.

**Carro:** lista ordenada de municípios — origem, paradas intermediárias, destino. Botões
"adicionar parada" e "retornar à origem". A distância é a soma dos trechos consecutivos.

Campos adicionais do carro — os três entram na conta, por isso são exceção à regra
do formulário mínimo:
- `propriedadeVeiculo`: `frota` | `proprio` | `locado`
  → **`frota` é Escopo 1; `proprio` e `locado` são Escopo 3.** Gravar o escopo resolvido.
- `combustivel`: `gasolina` | `etanol` | `diesel` | `flex`
- `ocupantes`: inteiro ≥ 1. A emissão é do veículo. Dividir pelo número de ocupantes ao
  atribuir por pessoa, e deixar a regra explícita na interface.

**O documento guarda a emissão do veículo; a divisão acontece ao atribuir.** Gravar já
dividido esconderia a conta dentro do número — o que distância e fator reproduzem é o
veículo (§10.1). E a divisão precisa acontecer em **toda** atribuição a pessoa, não só na
tela do viajante: sem isso, dois caronas que registrem a mesma viagem somam o mesmo carro
duas vezes no total do programa, e o total continua parecendo plausível.

**O fator do carro é o da mobilidade, reaproveitado.** Um carro a gasolina emite por
quilômetro o que emite, indo trabalhar ou indo a cliente, e a §7.5 já diz que a matemática
se compartilha. Não existe um segundo arquivo de fatores para o mesmo número físico: dois
arquivos são um que envelhece sem o outro. Sem o fator carregado, o cálculo falha
explicitamente (§10.8) — não há valor aproximado.

### 7.4 Distância rodoviária

Distância **rodoviária**, nunca ortodrômica. Em trajetos regionais a diferença passa de 25%,
é irregular e não se corrige com fator fixo.

- Provedor: **Google Routes API**, decidido em 15/09/2026. O OpenRouteService foi testado
  contra a base real e reprovado: a cota diária do plano gratuito não suporta recarregar a
  pesquisa mais de uma vez no mesmo dia, e cota esgotada derruba a carga. Geocodificação
  também é do Google, pelo mesmo teste — o provedor gratuito devolve a coordenada do
  município para a maioria dos CEPs. **A troca de provedor muda o número**, por isso está
  declarada no método do módulo (§11.5) e não é tratada como detalhe de
  infraestrutura.
- **Cachear toda rota no banco**, com chave = sequência ordenada de códigos IBGE. As rotas
  da empresa se repetem muito.
- Seleção de município via **lista do IBGE embarcada na aplicação**, não campo de texto
  livre. Elimina ambiguidade de grafia e é o que torna o cache eficaz.

  A lista vem de um **gerador versionado**, no mesmo padrão do contorno do mapa: o script
  baixa da API de localidades do IBGE, declara origem e licença no cabeçalho do arquivo, e
  o resultado é reprodutível — quem duvidar roda de novo e compara. **A coleção
  `municipio` da §10.2 não é criada enquanto o arquivo for a fonte**: duas cópias do mesmo
  dado é uma que diverge da outra em silêncio, e a que a tela lê não seria a que alguém
  corrigiu.

  **A lista traz o centroide de cada município, e ele serve para desenhar — nunca para
  rotear.** A distinção é a lição de 15/09 lida no sentido certo: lá se pedia precisão de
  CEP e o provedor devolvia o centro do município, o que arruinava a distância. Desenhar um
  ponto num mapa do país é outro uso, e o centro do município é exatamente a precisão que
  ele pede. **O roteamento continua mandando nome e UF**, porque é o provedor que sabe por
  onde a estrada entra na cidade; mandar a ele um ponto nosso seria escolher um lugar dentro
  do município e roteá-lo como se fosse o município.

  O centroide vem das malhas territoriais do IBGE, na qualidade mínima — mesma origem e
  mesma licença das divisas de região que o mapa já usa —, e é calculado pela fórmula do
  polígono, não pela média dos vértices: a média puxa o ponto para onde o contorno tem mais
  detalhe, e um litoral recortado deslocaria a cidade para o mar.

  **Município sem centroide fica na lista assim mesmo.** O IBGE cria o município no cadastro
  de localidades antes de refazer a malha, então há sempre alguns recém-criados sem
  polígono. Eles continuam escolhíveis e continuam roteando; o que lhes falta é o ponto, e
  quem desenha declara o que não pôde desenhar. Tirá-los da lista seria sumir do formulário
  um lugar que existe.

- **A chave do roteamento chamado pela aplicação é outra**, separada da das cargas
  (§12.8). O provedor passa a ser consultado por quem usa o sistema, e não só por quem roda
  carga: a chamada acontece **no envio do formulário, nunca enquanto alguém digita**, e o
  cache deixa de ser conveniência para ser o que segura a conta. A chave do cache é o **par
  ordenado** de códigos — uma sequência de dois —, e não o trajeto inteiro: por trajeto,
  uma parada a mais inutilizaria tudo que já estava guardado.

---

## 8. Módulo Transporte marítimo

Fonte: relatório do agente de carga, exportado de sistema de gestão de embarques, com abas
de detalhe por agente e uma aba de resumo montada manualmente. Estrutura, armadilhas e
números de referência em `CONTEXTO.md`.

### 8.1 Como o CO₂ é alocado

**O valor informado pelo agente é o dado primário, e não se recalcula.** Nem por
tonelada-quilômetro, nem por peso, nem por contêiner. Onde for preciso **estimar** o que o
agente não informou, a unidade é o **contêiner, por corredor** (§8.2).

**Por que contêiner e não peso.** O contêiner é a unidade que o agente de fato movimenta e a
única que existe em todo embarque marítimo; o peso dentro dele varia com o que foi embarcado
e não é escolha do transporte. Medido contra a base, nenhuma das duas unidades é
estável dentro de um corredor — a dispersão por contêiner e a dispersão por quilo são da
mesma ordem —, então **a escolha não se justifica por estabilidade, e sim por significado**:
estimar por peso importaria para dentro do inventário a mesma conta circular da aba de
resumo.

**Não reproduzir a metodologia da aba de resumo.** Ela deriva peso a partir de contagem de
contêiner com uma constante e depois deriva contagem a partir do peso — a conta é circular,
e a constante usada está acima da média real.

#### 8.1.1 Linha atípica e linha impossível são casos diferentes

Versões anteriores deste documento descreviam os dois como se fossem um: a §8.1 mandava
**sinalizar para revisão** e a §8.3 mandava **não importar**. São regras distintas, com
limiares distintos e consequências opostas, e confundi-las erra nos dois sentidos — ou um
número impossível entra e domina o total, ou emissão verdadeira é apagada por ser atípica.

**Linha atípica — entra, com alerta.** É a linha plausível que destoa da mediana do próprio
corredor: contêiner pouco carregado, carga solta, embarque partido. **Ela entra no total e
recebe alerta**, que aparece no método do módulo. Tirá-la seria remover emissão real do
inventário por ser incomum, quando é justamente o incomum que um inventário existe para
mostrar.

O limiar é **folgado, e isso é medido, não arbitrado**: a dispersão por contêiner dentro dos
corredores de maior volume é alta o bastante para que um limiar apertado marcasse uma fração
grande da base. **Alerta que dispara em boa parte das linhas é alerta que se aprende a
ignorar** — a mesma lição já registrada na §15 sobre teste com alarme falso. O limiar é
parâmetro declarado, não constante no código.

**Linha impossível — não é importada.** É a linha cuja ordem de grandeza não pertence ao
módulo: não destoa do corredor, destoa do inventário inteiro por ordens de grandeza. O
sintoma típico é fórmula errada na origem — peso multiplicado por distância, por exemplo.
**Ela não entra até ser conferida na origem**, porque um número desses sozinho domina o
total e torna todo o resto invisível.

A comparação aqui é contra a **mediana geral do módulo**, não contra o corredor: linha
impossível costuma estar sozinha no corredor dela, e um corredor de uma linha só tem essa
linha como mediana — o teste passaria justamente onde precisava morder. O limiar é separado
do anterior, muito mais alto, e também declarado.

**A carga recusada é anunciada, nunca silenciosa.** O script diz qual linha recusou e por
quê, e a conferência de cobertura (§8.4) conta a recusa como diferença entre origem e banco,
com motivo — senão o descarte vira exatamente o buraco que a cobertura existe para achar.

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
  todo o sistema e declarar qual é no método do módulo (§11.5).
- **Linha atípica entra com alerta; linha impossível não é importada.** São regras
  diferentes, com limiares diferentes — ver §8.1.1, que é onde elas moram.

### 8.4 Cobertura, desde a primeira carga

**O marítimo entra na lista de fontes conhecidas do `verificar` na mesma leva do script de
ingestão, nunca depois.** A conferência de cobertura responde *"chegou tudo?"*, que é a
pergunta que coerência e plausibilidade não fazem — e é a única que pega uma fonte inteira
ficando de fora. Ela custou duas vezes neste projeto (§15), e na segunda só apareceu porque
alguém notou por acaso.

A contagem é **por bloco de origem — agente e período —, nunca contra o arquivo inteiro.**
Comparar total de coleção com total de uma fonte é a premissa de fonte única disfarçada de
conferência, e já foi encontrada exatamente nessa forma. Bloco no banco sem conferência que o
cubra vira aviso; arquivo de origem ausente na máquina não falha, mas diz quantos embarques
ficaram sem conferir.

**O escopo de recarga é agente E bloco de origem, nunca agente e ano.** Um bloco do relatório
atravessa a virada do ano — o período dele não coincide com o ano civil —, então dois blocos
do mesmo agente contêm documentos do mesmo ano. Com o ano no escopo, recarregar um bloco
apagaria os documentos do outro que caíssem naquele ano (§10.9).

---

## 9. Módulo Transportadoras (distribuição rodoviária)

Fonte: relatório de entregas por filial, uma linha por entrega, com data, filial, cliente,
distância e peso. Estrutura, armadilhas e números de referência ficam em `CONTEXTO.md`
quando a base entrar em carga recorrente.

### 9.1 O que este módulo cobre, e o que não sabe

Cobre a distribuição rodoviária de produtos vendidos, entregue por transportadora
terceirizada, a partir das três filiais (§9.4). **A planilha não identifica qual
transportadora fez cada entrega** — só filial, cliente, distância e peso —, então o módulo
separa a emissão **por filial**, não por transportadora individual, mesmo o nome do módulo
se referindo à origem terceirizada da emissão (frete que a empresa não opera, mesma lógica
do marítimo em §8).

**Escopo GHG: Escopo 3, em duas categorias.** O levantamento do regime de frete fechou em
21/09/2026, e a resposta foi **os dois**: parte das entregas é CIF, frete pago pela FGV, que
é cat. 4 como no marítimo e nas viagens; parte é FOB, frete pago pelo cliente, que é cat. 9.
**Nenhuma das duas sai deste inventário** — as duas são Escopo 3, e a hipótese de o módulo
precisar sair do consolidado morreu com a resposta.

**O que não se resolveu é a separação, e a razão é de dado, não de método.** O relatório de
entregas tem seis colunas — data, filial, código do cliente, cliente, distância e peso — e
**nenhuma delas é a modalidade do frete**. Sem a coluna não há como dizer qual linha é cat. 4
e qual é cat. 9, então todo documento grava `regimeFrete: 'indefinido'`, **e esse valor quer
dizer "não separável nesta fonte", nunca "ninguém olhou"**. `cif` e `fob` continuam na união
(§10.11) para o dia em que a coluna vier: a modalidade é campo da nota fiscal, então o
sistema de faturamento a tem — o que falta é pedi-la no export, que é operação e não código.

**A mistura não é ressalva sobre o número, e por isso não aparece como aviso na tela.** Ela
não muda valor nenhum: total, filial e mês são os mesmos em CIF ou FOB. Onde ela decide
alguma coisa é na montagem do relatório final, que separa as categorias — e por isso ela é
**lastro, declarada no resumo do módulo** (§11.5), ao lado da fonte e do fator.

> **Não estimar a separação.** Mapear a modalidade por cliente é tentador, porque a emissão
> se concentra em poucos deles, e seria inventar dado: **um mesmo cliente pode ter as duas
> modalidades ao longo do ano**, e o mapa entraria no inventário como fato. Vale aqui o que
> vale para o agente sem detalhe no marítimo (§14): **a saída é pedir o dado à origem.**

### 9.2 Como o CO₂ é calculado

Toneladas-quilômetro: peso convertido de kg para toneladas, vezes a distância informada. O
sistema não sabe o modelo do caminhão, a carga de retorno nem a taxa de ocupação — a
exigência não é exatidão, é **"a fonte que chegue mais perto de um resultado coerente"**
(pedido do Gustavo), então o fator não pode ser específico de veículo.

**Fator: um fator médio de frete rodoviário de carga, por tonelada-quilômetro, de fonte
pública e citável.** **O valor não está fixado neste documento**, e não se hardcoda aqui nem
se inventa de memória: ele é buscado na fonte, gravado em `fatorEmissao` com `fonte` e
`vigência` — mesma regra de todo fator do sistema (§10.8) — e declarado na tela de método.
Sem fator carregado, a carga falha explicitamente, como em qualquer outro módulo.

**A fonte adotada é a ferramenta de cálculo do Programa Brasileiro GHG Protocol**, a mesma
de onde saem os fatores da mobilidade — o GLEC ficou de fora para não haver duas fontes e
duas vintages no mesmo inventário. Três coisas da adoção são decisão, e ficam registradas
porque mudam o número:

- **a linha da tabela é a média de toda a frota de carga**, sem distinguir rígido de
  articulado nem carga refrigerada. É a suposição que corresponde a não saber o veículo
  (§9.1); a linha de caminhão rígido quase dobraria o total do módulo;
- **a derivação é a das fórmulas da própria ferramenta**, e não a coluna de conveniência em
  CO₂e que ela traz ao lado: diesel fóssil e biodiesel entram separados, ponderados pela
  mistura média do ano, com os GWP da tabela da ferramenta;
- **o valor é CO₂e não biogênico** — o CO₂ da parcela de biodiesel fica fora, como já fica o
  da parcela de etanol nos fatores da mobilidade. Adotar a coluna de conveniência colocaria
  carbono biogênico dentro deste módulo enquanto o outro o mantém fora, e **duas convenções
  no mesmo inventário é a que ninguém revisa que sobrevive**.

### 9.3 Regras de ingestão

- **Distância é o trecho único filial → cliente**, sem ida e volta contabilizada — decisão
  do Gustavo, sem detalhe de rota na origem para calcular diferente.
- **Peso em kg**, convertido para toneladas no cálculo.
- **Linha internacional não entra.** Na base atual, a partir de um certo ponto do relatório
  a distância salta para a casa dos 13 mil km e o cliente passa a ser do exterior (China) —
  são entregas que pertencem ao módulo marítimo, não a este. Regra: **descartar toda linha
  cuja distância não seja compatível com entrega rodoviária doméstica.** O limiar é
  parâmetro declarado, não constante que muda sem registro — mesmo princípio da linha
  impossível do marítimo (§8.1.1). Referência da base atual: nenhuma entrega doméstica
  passa de ~5.000 km: um limiar nessa faixa já separa as duas populações sem ambiguidade.
- **Linha sem cliente é descartada, sem alerta.** É formato de exportação — linha em
  branco, rodapé com o resumo dos filtros aplicados do relatório —, não dado incompleto que
  precise virar exceção visível.

### 9.4 Filiais

| Código | Nome | Cidade |
|---|---|---|
| `01` | Matriz | Curitiba/PR |
| `02` | Filial Itajaí | Itajaí/SC |
| `03` | Filial Pernambuco | Cabo de Santo Agostinho/PE |

Nome de cliente não aparece em nenhuma tela deste módulo, só o agregado por filial — mesma
regra de identificação do resto do inventário (§3).

### 9.5 Tela

Mesmo padrão das outras telas do inventário (§11): kg CO₂ total, por filial, por mês. Peso
e distância são insumo de cálculo e não aparecem soltos na interface (regra de exibição da
§1). **Sem coordenada exata de cliente, não há mapa de rota** como em Viagens ou Marítimo:
**um mapa com as três filiais marcadas** (Curitiba, Itajaí, Cabo de Santo Agostinho), e ao
clicar em cada uma, os números daquela filial — total, número de entregas, peso
movimentado. O método do módulo (§11.5) declara a mistura de CIF e FOB (§9.1) e a
fonte do fator (§9.2). **Nenhuma das duas é aviso sobre o número** — as duas são lastro, e
nenhuma muda o que a tela desenha.

---

## 10. Modelo de dados

Firestore, coleções de topo e documentos rasos. **Nenhuma tela lê coleção direto:**
tudo passa pela camada de consulta agregada da seção 10.9, que é onde moram o
anonimato e a supressão de grupos pequenos.

### 10.1 Princípios

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

### 10.2 Coleções

```
funcionario/{matriculaOuChaveDeOrigem}
mobilidade/{anoBase}_{matricula}
viagemTrecho/{fonte}_{refOrigem}_{ordem}
viagemRegistrada/{uid}_{reservaId}_{ordem}
embarque/{agente}_{shipmentId}
entregaRodoviaria/{filial}_{data}_{ordem}
containerPortoMes/{ano}_{mes}_{porto}   -- prevista, NÃO criada: ver abaixo
fatorEmissao/{categoria}__{chave}__{versao}__{vigenciaInicio}
aeroporto/{iata}
porto/{locode}
municipio/{codigoIbge}    -- prevista, NÃO criada: ver §7.4
rotaCache/{chave}
usuarioPerfil/{uid}
```

**`containerPortoMes` não é criada, e o motivo é o da §10.1.5.** Contêineres por
porto por mês é **contador agregado**: sai de `embarque` com uma redução em
JavaScript, no volume deste módulo, e pré-calculá-lo é justamente o que
desincroniza em silêncio e trava a criação de cortes novos. Duas cópias da mesma
contagem é uma que diverge da outra, e a que a tela lê não seria a que alguém
corrigiu — mesmo raciocínio que deixou `municipio` fora na §7.4.

**A tabela de contêineres por porto da aba de resumo também não entra.** Ela usa
outra base de data (§8.3) e o total dela embute a contagem derivada dos agentes
sem detalhe, que é a conta circular que a §8.1 proíbe reproduzir. A tela monta a
dela a partir dos documentos.

### 10.3 Por que quatro coleções de emissão, e não uma

Mobilidade é **taxa mensal**; viagem, embarque e entrega rodoviária são **eventos**. Somar
os dois tipos num mesmo `sum(co2)` produz número errado sem nenhum sinal de erro. Coleções
separadas tornam a mistura impossível por descuido, e todo documento ainda carrega
`periodicidade` (`mensal` | `evento`) para que a consolidação seja explícita.

### 10.4 Envelope comum das coleções de emissão

Todo documento de `mobilidade`, `viagemTrecho`, `embarque` e `entregaRodoviaria` carrega:

```
modulo          'mobilidade' | 'viagens' | 'maritimo' | 'transportadoras'
modal           'aereo' | 'terrestre' | 'maritimo' | 'rodoviario'
escopo          1 | 3
periodicidade   'mensal' | 'evento'
ano             number             -- 2026
mes             'AAAA-MM' | null   -- null só onde não se aplica (ver 10.5)
empresa         string | null      -- nulo é categoria visível, ver 10.9
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

### 10.5 `mobilidade` — uma resposta da pesquisa

```
funcionarioId, anoBase, transporte, combustivel, distanciaKm,
bairro, cidade, diasUteisMes, co2KgMes, excecao, motivoExcecao
```

**Sem endereço.** Ver 6.1: só distância, bairro e cidade.

`periodicidade: 'mensal'` e o valor se chama `co2KgMes`, com a unidade no nome. `mes`
é nulo: a pesquisa é anual e o valor vale para todo mês do ano-base — na série
mensal o mesmo valor se repete nos doze meses, e isso é declarado no método do
módulo (§11.5).

### 10.6 `viagemTrecho` — um documento por trecho do inventário

```
reservaId, ordem, funcionarioId,
tipo('aereo'|'carro'), fonte('agencia'|'cartao'), contabilizar,
dataIda, dataVolta, origem, destino, companhia, voo, dataVoo,
distanciaKm, faixaDistancia, passageiros, co2Kg
aereo: classeCabine, multiplicadorClasse
carro: propriedadeVeiculo, combustivel, ocupantes
```

`fator` carimba o fator por faixa; o multiplicador de classe é o outro termo da
conta (§7.2) e fica em campo próprio, senão a emissão do trecho não é
reproduzível a partir do documento.

`reservaId` é o que liga os trechos da mesma viagem. `ano` e `mes` saem **da data do
voo**, nunca da data de lançamento da passagem (§7.2).

`fonte` só admite as duas fontes administrativas, e **a validação de escrita
recusa qualquer outra** — em particular `formulario`. Ela existe por causa do
escopo de recarga, não para dividir a série (§7).

**`criadoPorUid` não mora aqui.** Ele é campo do programa de viagens que tinha
ficado no lugar errado: nenhum documento desta coleção é criado por alguém
usando a aplicação — todos vêm de carga —, e enquanto o campo esteve aqui veio
nulo em todo documento gravado. Ele mora em `viagemRegistrada`, onde é
obrigatório.

### 10.6.1 `viagemRegistrada` — uma viagem registrada pelo colaborador

**Não é inventário** (§0.1, §7.5). Coleção própria, telas próprias, e nenhum
dado daqui entra em consulta, indicador, série ou mapa do inventário.

```
reservaId, ordem, criadoPorUid, funcionarioId,
tipo('aereo'|'carro'), dataIda, dataVolta, origem, destino,
distanciaKm, co2Kg
aereo: faixaDistancia, classeCabine, multiplicadorClasse
carro: propriedadeVeiculo, combustivel, ocupantes
```

**Por que duas coleções, e não um campo discriminador em `viagemTrecho`.** Um
campo deixaria a separação dependendo de toda consulta futura lembrar de
filtrar por ele. Uma consulta que esquecesse somaria autodeclaração voluntária a
fonte administrativa completa, e o resultado seria uma série cuja variação mede
quanta gente preencheu e parece medir emissão — erro que não estoura em lugar
nenhum. **Com duas coleções, esquecer o filtro não é possível: não há filtro
para esquecer.** A mistura passa de proibida a impossível, e é essa diferença
que a §0.1 pede.

O documento carrega o mesmo núcleo de emissão do inventário — modal, escopo,
ano, mês, fator carimbado com versão, alertas e `atualizadoEm` —, porque o
cálculo reaproveita os mesmos fatores e as mesmas funções: **o que não se
compartilha é o dado, não a matemática** (§7.5).

O que ele **não** tem diz o resto: sem `fonte`, porque não há série a dividir;
sem `contabilizar`, porque itinerário duplicado é coisa de relatório de agência;
sem `empresa`, que é dimensão de inventário; sem `passageiros`, porque quem
preenche é quem viajou e a divisão entre ocupantes de um carro é `ocupantes`; e
sem `modulo` nem `periodicidade`, porque não faz parte de módulo nenhum do
inventário.

`origem` e `destino` guardam o **identificador**, não o nome: código IATA no
aéreo e código IBGE no carro. É o que o inventário já faz com o aeroporto, e é o
que permite reabrir a viagem no formulário para editar — nome gravado não volta a
ser escolha de lista. O nome é resolvido na exibição.

`criadoPorUid` é **obrigatório** — é ele que permite ao `colaborador` ler apenas
as próprias submissões, na consulta e não na interface (§5.1). É também o que
entra no ID: o do inventário é derivado do arquivo de origem, porque é
recarregar o arquivo que precisa sobrescrever; aqui não existe arquivo, e a
origem é quem registrou. `funcionarioId` é o vínculo com o cadastro quando quem
registrou já existe nele, e pode ser nulo.

Além das regras da §10.9, que valem inteiras aqui, a validação exige que a data
de volta não anteceda a de ida: esta é a única coleção preenchida à mão por
gente usando a aplicação, e é onde erro de digitação chega.

### 10.7 `embarque` — um embarque do relatório do agente

```
agente, empresa, shipmentId, houseRef, trans, mode,
portoOrigem, portoDestino, navioPartida, navioTransbordo,
etd, eta, atd, ata, pesoKg, volumeM3, containers,
co2Kg, nivelDado, status, previsao
```

`ano` e `mes` saem da base de data escolhida na §8.3, e qual é fica declarado na
método do módulo (§11.5).

### 10.8 `fatorEmissao` e apoio

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
exceção com motivo, fica fora da média e aparece no método do módulo — e o restante
da carga continua. Uma linha ruim não derruba as outras, e nenhuma delas recebe
valor aproximado.

Nas viagens a política é outra, de propósito: o fator aéreo vem do próprio arquivo
da base e é carregado pelo seed. Ausência ali não é erro de uma linha, é sinal de
que o seed não rodou ou de que a base está inconsistente — e continuar
subestimaria o inventário em silêncio. Por isso a carga de viagens para.

`usuarioPerfil.empresa` existe para o perfil `importacao`, que pode ser filtrado por
empresa (§5).

### 10.9 O que o banco não garante mais

O modelo relacional recusava dado inválido. O Firestore aceita qualquer coisa, então
estas regras passam a ser **validação obrigatória na escrita**, num único ponto por
coleção — se não estiverem no código, não existem:

- `escopo` só pode ser 1 ou 3;
- `propriedadeVeiculo: 'frota'` obriga `escopo: 1`; `proprio` e `locado` obrigam 3;
- `ocupantes` inteiro ≥ 1; `passageiros` inteiro ≥ 1;
- `distanciaKm` ≥ 0; `pesoKg` ≥ 0;
- `regimeFrete` só pode ser `cif`, `fob` ou `indefinido`; `filial` só pode ser `01`, `02` ou
  `03`;
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

### 10.10 Agregação e camada de consulta

A agregação acontece no servidor, lendo a coleção e reduzindo em JavaScript, dentro
de **um único módulo de consulta**, em `src/server/consultas`. Nenhuma tela alcança
a coleção por fora dele — e isso é verificado por teste, não só combinado.
É esse módulo que garante, para as telas de inventário:

- nenhum identificador de pessoa no que sai (§3.1);
- supressão de recorte com menos de 5 pessoas **na mobilidade**, agrupada em "outros"
  (§3.1.1). Viagens não suprime e marítimo não tem pessoa a suprimir (§3.1.2, §3.1.3) — a
  camada é o lugar onde essa diferença fica explícita, não onde ela se apaga;
- **nulo é categoria visível, não registro ausente.** Ao agrupar por `empresa`, os
  documentos sem empresa aparecem como fatia própria, "Sem empresa". **O total
  geral sempre bate com a contagem de documentos da coleção; se não bater, é bug.**
  Inventário com registro sumindo de agregação é erro que só aparece em auditoria.

### 10.11 `entregaRodoviaria` — uma entrega do relatório de distribuição

```
filial, data, clienteCodigo, distanciaKm, pesoKg,
co2Kg, regimeFrete, nivelDado
```

`ano` e `mes` saem da `data` da entrega. `clienteCodigo` é o identificador do relatório de
faturamento, nunca o nome do cliente — nome real de cliente não se versiona (§2.1) e não
aparece em nenhuma tela do módulo, só o agregado por filial (§9.4).

`regimeFrete` (`cif` | `fob` | `indefinido`) grava `indefinido` em toda entrega **porque a
origem mistura CIF e FOB e não traz a modalidade por linha** (§9.1) — é ausência de coluna,
não pendência de decisão. Os outros dois valores existem para o dia em que a coluna vier,
e nesse dia eles chegam pela carga, sem migração.

**O agregado da tela não lê este campo.** Com um valor só em toda a coleção ele não recorta
nada e agruparia tudo num balde; quem o conta documento a documento é o `verificar`, que é
onde a chegada da modalidade apareceria sozinha.

O documento carrega o mesmo núcleo de emissão dos outros módulos do inventário — fator
carimbado com versão, alertas, `atualizadoEm` — pela mesma razão da §9.2: sem saber o
veículo, o fator é uma média declarada, não uma medição.

**`ordem` no ID existe porque a planilha não traz identificador de entrega.** É o índice da
linha dentro do mesmo par filial+data na carga — mesmo papel que `ordem` já cumpre em
`viagemTrecho` e `viagemRegistrada` (§10.1, princípio 7): recarregar o mesmo relatório
sobrescreve pelo ID determinístico em vez de duplicar.

---

## 11. Telas

**Inventário**

1. **Visão geral** — o inventário consolidado do ano-base. Definida inteira na §11.0,
   porque o que essa tela soma não é óbvio a partir dos módulos.
2. **Mobilidade** — kg CO₂ por funcionário/mês, total no ano, distância média, radar de onde
   o quadro mora, emissão por modal. Clicar numa faixa do radar abre os números dela — a
   faixa, nunca o ponto (§3.1.1).
3. **Viagens** — kg CO₂ por viagem, total, mapa de rotas, destinos mais frequentes, emissão
   por mês.
4. **Marítimo** — kg CO₂ por contêiner, total, mapa de rotas com navios em movimento, emissão
   por mês, contêineres por porto, tabela de corredores. **Relata o ano-base do inventário
   (§11.0), e só ele**: a coleção atravessa três anos civis, dois deles parciais, e não há
   seletor de período — ver §8.4.
5. **Transportadoras** — kg CO₂ por filial, total, mapa com as três filiais e os números de
   cada uma ao clicar, emissão por mês. A mistura de CIF e FOB (§9.1) é declarada no botão
   de método, como lastro — não como ressalva sobre o número.

**Programa de viagens** — sistema separado (§0.1, §7.5). Estas duas telas leem
`viagemRegistrada` e **nenhuma coleção do inventário**; as cinco de cima leem o inventário
e **nunca** `viagemRegistrada`.

6. **Registrar viagem** — formulário, com resultado imediato da emissão.
7. **Emissões registradas** — registradas no período, emissão acumulada, adesão, mapa dos
   trajetos, últimas viagens, participação de avião e carro.

   **No mapa daqui todo ponto é um lugar de verdade** — a cidade do aeroporto no voo, o
   município no carro —, ao contrário do mapa de Viagens, que agrega por região. Lá a
   agregação existe por legibilidade, com centenas de trechos; aqui não há volume que a
   peça nem supressão a satisfazer, e agregar esconderia de onde se foi sem ganhar nada.
   **O aeroporto de uma cidade e o município dessa cidade são o mesmo ponto**: dois pontos
   para um lugar diriam que se foi a dois lugares.

   O desenho é a mesma peça nas duas telas, e isso é a §7.5 outra vez — compartilha-se a
   matemática e o desenho, nunca o dado. A peça não conhece consulta nenhuma: recebe lugares
   e ligações prontos.

   **O `colaborador` tem a versão dele desta tela, "Minhas viagens"**, e não a agregada:
   ele não vê dado de terceiro nem agregado (§5.1). É a mesma sétima tela, recortada pelo
   uid na consulta — não é uma "Emissões registradas" com filtro de interface.

   A palavra na tela é **adesão**, não "cobertura" solta: o protótipo usava a mesma palavra
   para outra conta, e indicador com rótulo ambíguo é começo de discussão longa em reunião.

**Nenhuma tela mistura as duas origens**, nem lado a lado, nem como comparação, nem como
total somado. Se um dia alguém quiser os dois números na mesma página, isso é decisão nova
e exige rediscutir a §0.1 — não é ajuste de tela.

Comportamento visual, animações e detalhe de layout: seguir o protótipo.

### 11.5 O método mora no painel do número, não numa tela separada

**Não existe tela de Método.** Ela existiu até 19/09 e saiu: cada tela do inventário
ganhou **um botão fixo**, sempre no mesmo canto, que abre um resumo de tudo que produz os
números daquela tela. A tela lida fica curta e o lastro fica a um clique, em vez de numa
página separada que só quem já desconfiava do número abria.

**Um botão por tela, não um por painel.** A primeira versão desta mudança pôs um botão em
cada cartão e cada painel; oito botões numa tela são oito coisas disputando atenção, e
quem quer entender o número não sabe qual abrir. Um lugar previsível responde antes de ser
procurado.

**O resumo é rótulo e valor, e quase nada além disso.** A glosa de um parâmetro só existe
onde o valor não carrega a consequência — "21 dias úteis" e "econômica, assumida" já dizem
tudo, e uma frase abaixo de cada linha transforma o resumo na tela que ele substituiu. Sete
dos vinte e cinco parâmetros têm glosa; os outros são uma linha de duas colunas.

**O resumo pode recolher o lastro, e só ele.** Uma tela cuja pergunta cabe em duas linhas —
de onde vem o dado e como a conta é feita — abre com essas duas e guarda parâmetro, fator,
exceção e alerta atrás de um bloco que se abre num clique, em `<details>` nativo. **Recolher
não é remover**: a lista continua sendo a do módulo inteiro, parâmetro novo continua
aparecendo sozinho, e o que muda o número continua na página. O que sai da primeira olhada é
disputa de atenção, não declaração — e é a §14 outra vez, declaração se move de lugar e não
se apaga. **As quatro telas de módulo usam isso**; a Visão geral não, porque o resumo
dela já é curto — ela não tem módulo, e o que declara são as três frases da §11.0, que
moram na própria tela.

**O alerta aparece pelo próprio código, sem a regra ao lado.** Os códigos são descritivos —
`geocodificacao_falhou`, `embarque_previsto`, `fator_ausente` —, e o sublinhado vira espaço
na exibição. A regra que levanta cada um continua escrita junto do código e continua
conferida: o `verificar` recusa alerta no banco sem motivo declarado. **O que saiu foi a
frase na tela, não a explicação do sistema.**

**O que a tela declarava continua declarado, e isso não é detalhe de acabamento.** Um
inventário não é só o total: é o total mais as decisões que o produziram. A lista mínima
continua valendo inteira — provedor de geocodificação e de roteamento (§7.4), base de data
do marítimo (§8.3), classe econômica assumida no aéreo (§7.2), um ocupante por carro e por
moto na mobilidade (§6.2), repetição do valor anual da mobilidade nos doze meses (§10.5),
fatores com fonte e vigência, e a lista de exceções com motivo —, e o que mudou foi
**onde** cada uma aparece, nunca **se** aparece.

**Cada tela mostra todos os parâmetros do próprio módulo, e não uma lista escolhida a
dedo.** Perder o endereço de uma declaração era o risco desta mudança: uma escolha que muda
o número e não aparece em tela nenhuma deixa o número sem lastro, e nada quebra. Com a
lista vindo do próprio módulo, **parâmetro novo aparece sozinho** — não há lista para
alguém esquecer de atualizar, que é o mesmo argumento da §0.1. O que resta é conferido por
teste: todo parâmetro tem módulo, todo módulo tem tela, e cada tela tem um botão e só um.

**A divisão entre o que fica na tela e o que fica atrás do botão é de significado, não de
espaço:**

- **Ressalva que impede leitura errada fica visível** — o ângulo do radar não significar
  nada (§3.1.1), o ponto do mapa de Viagens não ser um aeroporto, a linha do mapa marítimo
  não ser a derrota do navio, o que não pôde ser desenhado, a proporção da cascata (§8.2) e
  as três declarações da §11.0. Quem precisa delas é justamente quem não vai clicar.
- **Lastro vai para o resumo** — fonte, situação da carga, parâmetro, fator com vigência,
  exceção com motivo e alerta com a regra que o levanta.

**A telinha é `popover` nativo do HTML, sem uma linha de JavaScript**, pela mesma regra das
animações: o que depende de script não pode ser o que sustenta o conteúdo. Num navegador
sem suporte ela aparece aberta — o pior caso é a declaração visível demais, nunca
inalcançável.

**O botão é fixo, e por isso a casca reserva o rodapé.** Botão flutuante que cobre a última
linha do último painel é botão que esconde dado.

**O piso do enxugamento é a declaração, não o tamanho.** O que pode sair é prosa que
explica uma decisão; o que não pode sair é o que muda o número — e a diferença entre as
duas é que a segunda some sem nada quebrar. Quando uma guarda prender a redação de uma
declaração em vez do fato dela, o conserto é prender o fato, nunca afrouxar a guarda.

### 11.0 Visão geral

**O ano-base do inventário é 2025, e é constante, não parâmetro de ambiente.** Não há
seletor de ano nesta tela. Viagens relata 2025; o marítimo tem 2024 e 2026 parciais
(§8.4), e um seletor convidaria a ler ponta parcial como ano cheio — que é a §0.1 com
outra roupa: queda de cobertura lida como queda de emissão. A constante é lida pela tela
e pelo método do módulo, nunca do ambiente, pelo mesmo motivo que a base de data do
marítimo passou a ser constante em 19/09: a escolha que mais move o número não pode
mudar por variável esquecida numa máquina.

**O total soma os quatro módulos.** Mobilidade, Viagens, Marítimo e Transportadoras. A
última entra **inteira**: o frete dela é CIF em parte e FOB em parte (§9.1), as duas são
Escopo 3, e a origem não separa as categorias — nenhuma parcela fica de fora por causa
disso.

#### A mobilidade entra por decisão declarada, não por coincidência de data

O levantamento de mobilidade é de 2026 e produz uma **taxa** de deslocamento
casa-trabalho, não um evento datado: `periodicidade: 'mensal'`, `mes` nulo, `anoBase`
2026, e o mesmo `co2KgMes` vale para os doze meses (§10.5). Essa taxa é aplicada a 2025
como padrão de deslocamento do quadro — prática corrente em inventário, porque pesquisa
de mobilidade quase nunca é do ano relatado.

**É a única parte do total que não é medição do período**, e por isso é a única que
carrega rótulo próprio na tela. A suposição embutida é que o quadro e o padrão de
deslocamento de 2025 e 2026 são comparáveis; quem assina o relatório assina isso.

> **A consulta da mobilidade não filtra por ano civil.** Ela lê o ano-base da pesquisa.
> Aplicar o filtro de 2025 aos documentos de mobilidade devolve coleção vazia, e o
> painel perderia um módulo inteiro **sem erro nenhum** — o total simplesmente
> apareceria menor. É a família dos defeitos que a §15 vem registrando: consulta que
> afirma um arranjo que o dado não tem. A guarda está na §11.0.1.

#### O que a tela mostra

- **Indicador principal** — total de 2025 em tCO₂e. O número e o ano, mais nada.
- **Faixa proporcional** — os quatro módulos, na proporção do total. As quatro fatias
  somam o indicador principal; se não somarem, é defeito, não arredondamento.
- **Quatro cartões de indicador** — um por módulo, com o total do ano em tCO₂e. O cartão
  da mobilidade carrega a etiqueta de ano-base 2026 aplicado a 2025 **no próprio
  cartão**. Não em rodapé: rodapé é onde a ressalva morre. O de Transportadoras nomeia as
  duas categorias do módulo e nada mais — a mistura de CIF e FOB não muda o número dele
  (§9.1), então ela é lastro e não etiqueta.
- **Emissão mês a mês — empilhada, nunca somada numa linha só.** A mobilidade é taxa
  repetida nos doze meses e aparece como banda constante; empilhada, a banda plana se
  declara sozinha. Numa linha única o mesmo dado viraria curva achatada e a variação de
  viagens e marítimo ficaria ilegível. **A soma dos doze meses bate com o indicador
  principal.**

A nota da série vem de quem chama, não da peça (lição de 19/09): esta tela declara que
cada módulo agrupa por uma data diferente — data do voo em viagens, base de data do
módulo no marítimo, data da entrega em transportadoras, e taxa mensal na mobilidade.

**Sem filtros.** Os quatro cortes da §11.1 ficam nas telas de módulo. A Visão geral é
uma leitura só, e é a tela que alguém abre para ver o número do ano.

#### Três declarações obrigatórias, curtas, na própria tela

1. **A mobilidade é ano-base 2026 aplicada a 2025** — no cartão dela.
2. **O marítimo de 2025 é o inventário de um agente.** Dois dos três não entregam
   detalhe linha a linha (§14); sem a frase, o total parece cobrir toda a importação do
   ano.
3. **Previsão está fora do total** — regra do módulo marítimo, que continua valendo no
   consolidado.

**Eram quatro até 21/09**, e a quarta era o regime de frete provisório de Transportadoras.
Ela saiu quando o levantamento fechou: a mistura de CIF e FOB não impede leitura errada de
número nenhum desta tela, e o que ela de fato decide — a separação por categoria no
relatório — é lastro, declarado no resumo do módulo (§9.1, §11.5). **Declaração que muda o
número não sai; esta não mudava.**

#### 11.0.1 O que a consulta desta tela tem de diferente de todas as outras

É a primeira consulta que atravessa os quatro módulos, e a §10.3 existe justamente porque
somar taxa com evento produz número errado sem sinal de erro. A consolidação é
explícita, e cada uma destas é guarda com teste que **liga a violação**:

- **Mobilidade pelo ano-base da pesquisa; viagens, marítimo e transportadoras pelo ano
  civil de 2025.** Quatro recortes, um total. Filtro único para os quatro é o defeito,
  não a simplificação.
- **O marítimo entra recortado em 2025.** A **coleção** do módulo é contínua e começa em
  novembro de 2024 (§8.4). Documento fora de 2025 não move o indicador desta tela — e,
  desde 21/09, também não move o da tela do módulo, que passou a relatar o mesmo ano-base
  pela mesma constante. **As duas telas mostram o mesmo número**, e é assim que deve ser:
  enquanto elas diferiam, quem abrisse as duas lado a lado ia procurar qual das duas
  cargas estava errada. O que sobra da série contínua é o que a conferência de cobertura
  (§8.4) vê, e ela continua olhando a coleção inteira, por agente e bloco.
- **Previsão fora do total, aéreo dentro do total.** Mesma regra do módulo, e pelo mesmo
  motivo: o aéreo é emissão do escopo e só não tem contêiner.
- **Nenhum identificador de pessoa sai na resposta** (§3.1), e a mobilidade não é
  recortada por bairro nem por modal aqui — é um número só.
- **Nada de `viagemRegistrada`** (§0.1). A tela lê `mobilidade`, `viagemTrecho`,
  `embarque` e `entregaRodoviaria`, e nenhuma outra coleção de emissão.
- **A soma dos doze meses é igual ao indicador principal**, e o total de cada módulo
  aqui é igual ao que a tela do módulo mostra para 2025.

### 11.1 Cortes que o painel oferece

São quatro, e só esses:

- **por período** — ano e mês;
- **por modal** — aéreo, marítimo, terrestre, rodoviário;
- **por rota ou destino**;
- **por empresa**, nos módulos onde essa informação existe.

Não há corte por centro de custo, por valor ou por qualquer dimensão financeira.

**A lista é o que o painel pode oferecer, não o que toda tela precisa mostrar.** Um corte
que, no módulo, tem uma categoria só não recorta nada: ele ocupa um painel para exibir uma
linha, ou a explicação de estar vazio. Em Viagens é o caso dos dois — as duas fontes
administrativas só trazem aéreo, e nenhuma informa a empresa por trecho —, e por isso os
dois painéis saíram da tela em 21/09. **Os cortes continuam na camada de consulta**, prontos
para voltar no dia em que a origem informar a empresa ou em que entrar trecho rodoviário:
o que saiu foi o painel, não o agregado.

**No marítimo o painel por modal saiu por outro motivo, e a diferença importa**: lá o corte
tem duas categorias de verdade — frete marítimo e frete aéreo de fornecedor —, e o que o
tornava dispensável é que **essa mesma divisão já é declarada em todo lugar da tela** que
precisa dela, porque o aéreo fica fora de tudo que é por contêiner. Um painel que repete
pela quinta vez o que quatro notas já disseram não acrescenta recorte, acrescenta ruído.

Em qualquer agrupamento vale a regra da §10.10: **nulo é categoria visível.** Agrupar
por empresa mostra "Sem empresa" como fatia própria, e o total geral bate com a
contagem de documentos da coleção.

---

## 12. Segurança e LGPD

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
   site e é o que fecha o CSRF do caminho de escrita da §11.6, sem quebrar quem
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

## 13. Fora de escopo

- Cenários de redução, simulações e projeções de qualquer tipo
- Tela de upload de arquivo
- Reconstrução do cálculo marítimo por tonelada-quilômetro
- Reprocessamento do relatório bruto da agência (o JSON consolidado já é o resultado)
- Separação de CO₂ biogênico do etanol
- **Qualquer campo de valor, custo, orçamento ou aprovação financeira.** Isto é
  inventário de emissões, não controle de gastos. Também não há centro de custo:
  o corte por área não é dimensão deste sistema
- **Firebase Storage** — não configurar, não criar regra, não adicionar dependência
- Contador agregado, saldo armazenado ou qualquer total pré-calculado (§10.1)
- Mecanismo de cobrança, validação cruzada ou fluxo de aprovação do registro de
  viagem do colaborador. Assume-se que os colaboradores vão registrar

---

## 14. Pontos em aberto

Coisas que provavelmente vão acontecer, mas não agora.

- **Storage voltará junto com uma tela de admin.** Hoje a ingestão das bases é por
  arquivo processado fora do sistema. No dia em que existir tela de administração
  para subir a planilha da agência ou o arquivo marítimo, o Storage entra — é
  provável que aconteça, só não agora.
- **`empresa` nasce parcialmente preenchida.** A base marítima já traz a empresa
  por embarque; mobilidade e viagens nascem com o campo nulo até a origem passar a
  informar. O campo existe desde já porque acrescentar campo depois, em base
  existente, é migração de backfill — e o nulo é tratado como categoria visível
  (§10.10), não como registro ausente.
- **Fatores da mobilidade** não vêm de nenhuma base do inventário: são escolha
  metodológica de quem assina o relatório e entram por arquivo próprio.
- **A data de corte deixou de existir** (§0.1, §7). Agência e formulário não são a mesma
  série, então não há o que cortar.
- **Dois dos três agentes de carga não entregam detalhe linha a linha**, e por isso não
  estão no inventário — nem como estimativa. A cascata da §8.2 estima o que falta **dentro
  de um embarque**; ela não inventa o embarque. Um deles entrega quatro números agregados,
  o outro entrega uma aba vazia, e os totais que a aba de resumo lhes atribui são a conta
  circular que a §8.1 proíbe reproduzir — o CO₂ de um sai do indicador dos outros e o peso
  é resíduo de subtração. **A saída é pedir detalhe por embarque à origem, que é operação,
  não código.** Enquanto não vier, o marítimo é o inventário de um agente, a cobertura
  conta os dois blocos ausentes e a tela declara quantos embarques ficam de fora.
- **Chaves do Google separadas por função e por destino** (§12.8). Já estão separadas por
  API — uma para geocodificação, outra para roteamento —, porque restringir uma chave única
  a uma API derrubaria a chamada da outra ponta. Falta a separação por **destino**: a chave
  usada nas cargas roda da máquina de quem opera e admite restrição por IP; a que o
  formulário vai usar sairá da Vercel, cujo IP de saída não é estável, e nessa ponta o
  controle é restrição por API mais teto de faturamento com alerta.

  **O lado do código está feito:** `GOOGLE_ROUTES_API_KEY_APP` existe e é a única chave que
  o formulário lê; as cargas continuam na antiga. Falta a **configuração no console**, que
  é operação: criar a segunda chave, restringir só à Routes API, pôr teto de faturamento
  com alerta e acrescentar a variável na Vercel.

  **Em produção não há queda para a chave das cargas, e a trava está no código** (22/09).
  Fora de produção a queda continua, para não exigir duas chaves na máquina de quem
  desenvolve; em produção, faltando a chave da aplicação, o envio do formulário falha
  dizendo o que falta. A alternativa era simplesmente não configurar a variável das cargas
  na Vercel, e ela foi recusada pelo motivo de sempre: dependeria de alguém lembrar disso
  daqui a seis meses, e no dia em que a variável aparecesse lá — por hábito, ou copiando o
  `.env` inteiro — o formulário passaria a queimar a chave restrita por IP **sem nada
  quebrar e sem nada avisar**. Guarda que depende de lembrança não é guarda.
- **O provedor de rota não fica carimbado no documento.** O documento de emissão carimba o
  fator (§10.1), não o provedor de geocodificação nem o de roteamento — então a tela de
  método declara a configuração **atual** do ambiente, e não necessariamente a que produziu
  a carga que está no banco. Enquanto a carga for manual e rara, a diferença é teórica;
  quando deixar de ser, o caminho é carimbar o provedor junto do fator.
- **São sete telas.** A Visão geral fechou a lista do inventário em 19/09 e a de
  Transportadoras entrou em 21/09. Visão geral, Mobilidade, Viagens, Marítimo e
  Transportadoras (§9) compõem o inventário; Registrar viagem e Emissões registradas
  compõem o programa — esta última com a versão do próprio viajante, "Minhas viagens",
  porque `colaborador` não vê agregado (§5.1). **A tela de Método saiu em 19/09** e o
  método passou a morar no botão fixo de cada tela (§11.5).

  O que fica em aberto daqui é de outra natureza: **a consolidação continua sendo a
  única consulta que atravessa os módulos**, e as guardas da §11.0.1 são o que a segura.
  Módulo novo, ano-base novo ou mudança de recorte em qualquer um deles passa por lá antes
  de passar pela tela.
- ~~**Regime de frete das entregas rodoviárias (§9.1).**~~ Fechado em 21/09/2026, e a
  resposta foi **os dois**: a operação usa CIF e FOB. Com isso **o módulo não sai do
  consolidado** — as duas modalidades são Escopo 3 —, e o que sobra é repartir o total
  entre cat. 4 e cat. 9.

  **O que fica em aberto é a coluna, e é operação.** O export de entregas não traz a
  modalidade por linha, e ela existe na nota fiscal: pedir a coluna à origem é o caminho, no
  mesmo molde do detalhe por embarque que falta no marítimo. Do lado do código não falta
  nada — `regimeFrete` já admite `cif` e `fob`, a validação já os aceita e a carga grava o
  que vier. Enquanto a coluna não vem, `indefinido` significa **não separável nesta fonte**,
  e a §9.1 diz por que a alternativa — deduzir a modalidade por cliente — seria inventar
  dado.
- ~~**Fator de frete rodoviário de carga ainda não tem fonte fixada (§9.2).**~~ Fechado em
  21/09/2026: a fonte é a ferramenta do GHG Protocol Brasil, na linha de média da frota de
  carga, com a derivação da própria ferramenta e em CO₂e não biogênico (§9.2). **O valor
  continua fora deste documento e fora do repositório**: ele mora em `fatorEmissao`, gravado
  por seed a partir de um arquivo que quem assina o relatório monta, no mesmo padrão dos
  fatores da mobilidade. O que fica em aberto é a **revisão anual**: a mistura de biodiesel
  muda por ano e por mês, então o fator tem vigência e o ano seguinte pede um valor novo —
  não uma edição do que está gravado.
- **O enxugamento tem um piso, e ele não é de gosto.** As telas foram encurtadas em
  19/09 junto com a saída da Método, e o que sobrou de prosa visível é o que impede leitura
  errada (§11.5). Abaixo disso a tela fica muda: um radar sem a frase do ângulo vira um
  mapa, um mapa com metade da emissão sem a frase do recorte vira falha de carga. **Cortar
  mais é cortar declaração**, e declaração se move de lugar, não se apaga.
- **O denominador da adesão do programa é parâmetro, e pode não estar definido.** Ele não
  sai de coleção nenhuma: o candidato óbvio, o tamanho da coleção de funcionários, inclui
  gente que só aparece como aprovador de passagem, e com ele a adesão nasceria menor do que
  é. Sem `PROGRAMA_QUADRO` no ambiente, a tela mostra a contagem e **declara que não há
  denominador** — indicador com denominador errado é pior que indicador ausente, porque
  parece funcionar. O que falta é o número, que vem de quem tem o quadro, não do código.
- ~~**Rotação da chave da service account**~~ — feita em 22/09, pendente desde 14/09. A
  chave nova está em uso e a antiga foi revogada no console; a varredura do histórico
  confirmou que nenhuma credencial real chegou a entrar em commit nenhum, então a §2.4 não
  se aplicava. **A rotação valeu mesmo assim, e é a §12.7**: chave que passou por arquivo
  versionado conta como comprometida, porque não há como provar por onde mais ela passou.

  O que fica em aberto daqui é a Vercel, que ainda não recebeu variável nenhuma — e é
  assim que devia ser: a chave antiga nunca chegou lá.

---

## 15. Registro de execução

**Seção mantida pelo Claude Code.** Registrar em ordem cronológica: o que foi implementado e
quando; correções pedidas pelo Gustavo e o que mudou; bugs encontrados e como foram
resolvidos; decisões técnicas tomadas durante a implementação que não estavam neste
documento.

**Sem dado real nas entradas** — descreva o que mudou, não os números que apareceram.

### Histórico

#### 2026-09-22 — Checagem pré-deploy: a rotação feita, e um fallback que valia em produção

Antes de publicar na Vercel. Nada de número mudou — o que mudou foi **quem pode
usar qual chave**, e uma frase deste documento que tinha envelhecido.

**A rotação da service account, pendente desde 14/09, foi feita.**

A varredura veio antes, por três ângulos independentes: `git grep` de padrões de
credencial em todos os commits, varredura objeto a objeto de todos os blobs
alcançáveis, e os commits soltos que sobraram de stash e amend — que **não** são
alcançáveis e por isso ficam de fora das duas primeiras. **Nenhum rastro de
credencial real em lugar nenhum**, e os únicos achados foram os placeholders
fictícios e o próprio regex da guarda aparecendo na busca.

> **A §2.4 não se aplicava, e a rotação valeu do mesmo jeito.** Como nada entrou
> em commit, não havia histórico a reescrever nem repositório novo a criar. O que
> sustenta a rotação é a §12.7: chave que passou por arquivo versionado conta como
> comprometida, porque **não há como provar por onde mais ela passou** — backup do
> editor, índice de busca, pasta sincronizada. A ausência de rastro no git prova
> uma coisa só, que é a ausência de rastro no git.

A ordem foi gerar, usar, conferir e **só então** revogar — e a conferência foi o
`verificar` inteiro, que inicializa o Admin SDK com a credencial nova e lê todas
as coleções. Ele fecha antes e depois da revogação, com as mesmas contagens: a
credencial mudou, o dado não. A Vercel não foi tocada, e é isso que garante que a
chave antiga nunca chegou lá.

> **Um defeito meu no meio, e é o de sempre com outra roupa.** A substituição no
> `.env` rodou embutida em `node -e`, e o shell comeu as barras invertidas: o PEM
> foi gravado com **quebras de linha reais** em vez de `\n` escapado. A escrita
> "funcionou" — nenhum erro, arquivo salvo, uma variável trocada. Apareceu na
> conferência seguinte, quando a chave deixou de ser parseável. Refeito com o
> script em arquivo, sem shell no meio do escape, e com backup fora do repositório
> antes de encostar no arquivo.

**O fallback da chave de rota valia em produção, e agora não vale.**

O código já lia `GOOGLE_ROUTES_API_KEY_APP` como a única chave do formulário, como
a §14 dizia. O que a §14 **não** dizia é que, faltando ela, a queda para a chave
das cargas acontecia em qualquer ambiente — a intenção estava declarada em
comentário e a trava não estava em lugar nenhum.

> **Por que isso importa mais do que parece.** As duas chaves existem porque os
> destinos são dois: a das cargas roda de máquina com IP estável e é restrita por
> ele; a da aplicação sai da Vercel, onde o IP não é estável. Bastava alguém
> acrescentar a variável das cargas no painel — por hábito, ou copiando o `.env`
> inteiro — para o formulário passar a queimar a chave restrita por IP. **Nada
> quebraria, nada avisaria**, o inventário continuaria certo, e o que mudaria é
> qual chave paga é consumida e por qual porta.
>
> A alternativa era instruir "não configure aquela variável lá", e ela foi
> recusada: depende da lembrança de alguém daqui a seis meses, que é exatamente o
> argumento da §0.1 para duas coleções em vez de um campo discriminador. **A trava
> ficou no código**, e fora de produção a queda continua, para não exigir duas
> chaves na máquina de quem desenvolve.

**Duas declarações foram corrigidas junto, e a razão é a de sempre.** O
`.env.example` e o §14 diziam que sem a chave o formulário cai na das cargas, sem
ressalva de ambiente. Era verdade quando foi escrito e deixou de ser — e o
`.env.example` é justamente o arquivo que alguém lê ao configurar a Vercel.
Especificação que descreve um arranjo que o código não tem é o defeito que este
log vem catalogando, e ele não muda de natureza quando é só uma frase.

**A varredura da §2 não achou nada**, e vale registrar o que foi procurado, porque
"nada encontrado" só significa alguma coisa com a lista à vista: nome de pessoa,
de agente, de cliente, de fornecedor e de navio; valor real de emissão, contagem
de contêiner e total de conferência; coordenada da fábrica em constante; e arquivo
que devia estar ignorado e não estava. Toda a massa dos testes continua declarada
e de fato fictícia — o que a entrada de 21/09 registra é que **a declaração não
torna a massa fictícia**, então a conferência foi no conteúdo, não no cabeçalho.

**O `.gitignore` ganhou cinco formatos de planilha** que faltavam ao lado dos que
já estavam. Conferido nos dois sentidos: os formatos passam a ser ignorados, e
**nada rastreado passou a ser ignorado** — a segunda metade importa mais que a
primeira, porque regra nova que esconde arquivo existente tira do próximo commit
coisa que ninguém decidiu tirar.

**Validação**

- `tsc --noEmit` e `npm test` (375 testes, 6 novos) passam. **`next build` não
  foi rodado**, por ser build de produção e a publicação depender do Gustavo.
  Nenhum servidor foi subido.
- **A guarda nova foi conferida ligando a violação:** com o fallback de volta em
  produção, dois dos seis reprovam — e os outros quatro continuam passando, que é
  a parte que importa. Eles prendem **produção**, não o fallback de
  desenvolvimento, que é o que se queria preservar. Guarda que reprovasse os seis
  estaria prendendo a coisa errada.
- O `verificar` fecha inteiro, antes e depois da revogação.
- As guardas do `.env.example` — placeholder plausível e credencial — continuam
  passando depois da reescrita do comentário.
- A varredura do histórico cobriu também os commits não alcançáveis, que nenhuma
  das duas varreduras normais enxerga.

**O que fica em aberto, e é operação:** a segunda chave do Google no console, com
restrição por API e teto de faturamento; as variáveis na Vercel; e a cópia solta
do JSON da service account na pasta de downloads, que serve para configurar o
painel e **precisa ser apagada depois** — credencial viva em pasta de download é
a mesma classe de problema que a §12.7 descreve.

#### 2026-09-22 — Transportadoras: o resumo no formato novo, e dois acertos de leitura

Quarta e última tela da leva. Três mudanças pequenas, e duas delas estavam
escondidas à vista — um ícone que não existia e uma linha de rótulos que se
sobrepunha.

**O resumo abre com fonte, o que entrou e uma frase de cálculo**, como as outras
três. Parâmetros, fator e mapa ficam recolhidos.

> **A mistura de CIF e FOB foi para dentro do recolhido, e é o lugar certo
> dela.** A §9.1 já dizia que ela é lastro e não ressalva — **não muda valor
> nenhum desta tela**, decide a repartição por categoria no relatório final —, e
> recolher não é remover: o parâmetro continua na página, nomeando as duas
> modalidades e as duas categorias. **A guarda de 21/09 continua passando pelo
> motivo certo**, porque ela prende o parâmetro, não o lugar dele na tela; foi
> escrita assim de propósito, para quem reescrevesse a frase continuar passando e
> quem apagasse a informação, não.

**O ícone do menu: a rota não tinha um, e caía no genérico.** O mapa de ícones
nasceu com as quatro telas que existiam, e a quinta entrou depois — sem entrada
no mapa, ela usava o traço de reserva, o mesmo das telas do programa. **Duas
coisas diferentes com o mesmo desenho no mesmo menu**, e nada acusava: não é erro
de código, é uma tabela que alguém precisa lembrar de completar. Um caminhão
entrou no lugar.

> **Ícone se escolhe olhando, no tamanho em que ele vive.** No menu ele tem 16px,
> e a diferença entre três desenhos que são iguais em 56px é enorme ali: a
> variante em que a roda fica **dentro** da caixa da carroceria vira borrão, e a
> que deixa a linha da base passar por cima das rodas as abre em dois ganchos. A
> escolhida apoia as rodas fora da caixa. Medido lado a lado, nos dois tamanhos,
> dentro de um item de menu de verdade.

**A série mensal: o ano saiu de doze rótulos e foi para um.**

Reportado pelo Gustavo, com a tela na frente: a linha de meses se lia como uma
palavra só. **Medido com a casca antes de mexer**, na coluna em que esta série
vive: o passo é de pouco mais de trinta e seis pixels e `jan/25` ocupa trinta e
quatro — a folga entre vizinhos ficava entre 0,1 e 3,5px, **e um par se
sobrepunha**. Não era impressão.

> **O que saiu é repetição, não declaração** (§13). O ano estava escrito doze
> vezes na mesma linha para dizer uma coisa só, e passou a estar escrito uma vez,
> na nota do gráfico. **E ele volta sozinho quando informa**: série que atravessa
> a virada do ano continua com o ano em cada rótulo, porque ali é ele que separa
> dois janeiros. Quem decide é o dado — a peça olha os meses que recebeu —, não
> quem chama.

**O vão entre as colunas virou número declarado.** Ele estava escrito duas vezes,
solto, na barra simples e na empilhada; virou constante única, e desceu de 0,62
para 0,56 de ocupação. **O que o olho usa para contar colunas é o vão, não a
barra.**

Medido depois, nas larguras em que alguém abre a tela: a menor folga entre dois
meses passou de −0,5px para 16,2px a 1440, 13,4px a 1280 e 19px a 1024, onde a
coluna é inteira. Sem rolagem lateral em nenhuma delas nem a 390.

> **O valor no topo da barra também não cabia, e a saída foi mudar a unidade.**
> Ele tem quase quarenta e nove pixels de largura contra trinta e seis de passo —
> **vizinhos se sobrepõem em cerca de doze pixels** —, e só não colidiam na tela
> porque as barras têm alturas diferentes e os números acompanham. Dois meses
> parecidos os encostam, e a série tem pares assim.
>
> **Não há tamanho de fonte que resolva**: abaixo de nove pixels o texto vira
> sujeira (18/09), e mesmo ali ele continua estourando. Então as duas saídas eram
> **deixar de escrever o valor** em série longa ou **escrevê-lo em outra
> unidade** — e a decisão do Gustavo foi preservar o número na tela. O topo passou
> a ser tonelada, que cabe em três glifos.
>
> **A escala sai do maior mês da própria série, nunca de constante**, porque a
> mesma peça desenha módulos de ordens de grandeza diferentes: casas decimais
> conforme a grandeza, e **abaixo de uma tonelada a unidade continua sendo o
> quilo** — ali é a tonelada que escreveria zero, e um mês de trezentos quilos
> vale "300" e não "0,30". A unidade é declarada na nota do gráfico, e **o valor
> exato, em quilo, continua no `title` de cada barra**: o que encolheu foi o
> rótulo, nunca o dado.
>
> Medido depois, com vizinhos de mesma altura de propósito, que é onde a
> sobreposição aparece: a folga entre dois valores passou de **−12,4px para
> 14,5px a 1440**, 11,8 a 1280 e 16,6 a 1024. Numa série uma ordem de grandeza
> menor — quatro glifos, com duas casas — ela fica em 8,7 e 6,9px, apertada e
> positiva.

**Uma frase da §11.5 tinha envelhecido**: ela dizia que só a Mobilidade recolhia o
lastro, e com esta tela são as quatro de módulo. Corrigida — especificação que
descreve um arranjo que o código não tem é o defeito que este log vem catalogando,
e ele não muda de natureza quando é só uma frase.

**Validação**

- `tsc --noEmit`, `npm test` (363 testes, nenhum novo) e `next build` passam.
  Nenhum servidor foi subido por mim; usei o que já estava no ar.
- Nenhum teste precisou mudar, e isso é informação: as guardas do resumo prendem
  que a tela peça o método do próprio módulo e mostre **todos** os parâmetros
  dele. Recolher não mexe em nenhuma das duas.
- A folha de comparação dos ícones foi servida pelo servidor que já estava no ar,
  a partir de um arquivo posto no `.gitignore` **antes** de existir e apagado no
  fim — sem dado nenhum dentro, só desenho.
- **O resumo e o ícone não pediram medição**: o bloco recolhido é a mesma peça
  que as outras três telas já usam, e o ícone ocupa o espaço que o anterior já
  ocupava. Nada cresceu, então nada pode passar a estourar.
- **A série mensal, sim, e foi medida antes e depois**, em rota temporária no
  `.gitignore` antes de existir e apagada no fim, com a casca e com massa
  inventada do zero: a folga entre dois meses vizinhos, a folga entre dois
  valores, a largura de cada rótulo e a do desenho, a 1440, 1280, 1024 e 390.
- **A guarda da escala é de largura, não de aparência**, e foi conferida ligando
  a violação: com o rótulo de volta em quilo, ela reprova **nomeando o rótulo
  que estourou** e quantos glifos ele tem. Um teste que só conferisse o número
  devolvido passaria com oito dígitos em cima da barra.

#### 2026-09-21 — Marítimo: a tela passa a relatar um ano, e o resumo encolhe

Terceira tela na mesma leva. Duas mudanças de forma e **uma de escopo**, que é a
que move número.

**A tela relata o ano-base do inventário, e só ele.** Pedido do Gustavo: nada de
2024 nem de 2026. O recorte é a mesma constante que o consolidado usa, e com ele
some o seletor de período — a §11.0 já tinha barrado esse seletor no consolidado
com o argumento de que **ponta parcial lida como ano cheio** é a §0.1 com outra
roupa; a tela do módulo era justamente onde ele tinha sobrado.

> **O melhor efeito é a coerência que veio de graça.** As duas telas mostravam
> números diferentes do mesmo módulo, e por isso o cartão do consolidado
> carregava uma frase explicando a diferença. **Agora o número é um só**,
> conferido contra o banco com diferença zero — e a frase saiu, porque deixou de
> ser verdade. Declaração que descreve um arranjo que a tela não tem é o defeito
> que este log vem catalogando; ela não vale mais só por já estar escrita.

**A varredura do que a tela puxa achou uma segunda consulta, e ela ficava de
fora do recorte.** O botão de resumo tem consulta própria, e ela lia a coleção
**inteira**: com a tela recortada e o resumo não, "o que entrou" passaria a
contar embarques de período que a tela não mostra. O lastro descreveria um número
que não é o da tela, **sem nada quebrar** — e lastro que descreve outro número é
pior que lastro ausente, porque parece conferir. O recorte passou a ser parâmetro
da consulta de método, e foi conferido contra o banco: o "o que entrou" e a
contagem da tela batem.

**Um campo morreu junto.** `anos` existia só para alimentar o seletor; sem
seletor, ninguém o lê — e, com a consulta fixada num ano, ele seria trivialmente
o próprio ano. Variável que ninguém lê é armadilha esperando alguém encontrar
(§7).

**O painel "Por modal" saiu, e o motivo é diferente do de Viagens.** Aqui o corte
tem duas categorias de verdade — frete marítimo e frete aéreo de fornecedor —,
mas **essa divisão já é declarada em todo lugar da tela que precisa dela**,
porque o aéreo fica fora de tudo que é por contêiner. Um painel que repete pela
quinta vez o que quatro notas já disseram não acrescenta recorte.

**O texto abaixo do mapa encolheu 37%, e o que saiu foi o porquê, não o fato.**

A frase do frete aéreo aparecia **quatro vezes na mesma tela** — nota do
indicador, legenda do mapa e sob as duas tabelas —, e cada cópia trazia a
explicação inteira: escopo, categoria, e por que frete aéreo não tem contêiner.
Quatro cópias de um parágrafo afogam o dado que elas qualificam.

> **A divisão é a da §11.5, aplicada dentro de uma frase.** O que fica visível é o
> **recorte** — estes embarques somam no total e não entram em nada que seja por
> contêiner —, porque sem ele o mapa soma menos que o número e é lido como falha
> de carga. O **motivo** é lastro, e passou a morar no resumo, uma vez só. A
> mesma tesoura na frase do que não pôde ser desenhado, que também fica.

O que **não** saiu da legenda: a linha não ser a derrota do navio, e o que ficou
fora do desenho. As duas estão na lista de ressalvas visíveis da §11.5, e as duas
continuam lá — encurtadas, não apagadas.

**Validação**

- `tsc --noEmit`, `npm test` (363 testes, nenhum novo) e `next build` passam.
  Nenhum servidor foi subido por mim; usei o que já estava no ar.
- Exercitado contra o Firestore carregado, por ensaio temporário apagado em
  seguida: **a coleção tem três anos civis e a tela mostra um**; a série sai com
  os doze meses do ano-base e nenhum fora dele; nenhuma data dos outros dois anos
  aparece em lugar nenhum da resposta; o total da tela do módulo e a parcela do
  consolidado **batem com diferença zero**; a contagem do resumo bate com a da
  tela; e nem peso, nem volume, nem intensidade por quilo saem na resposta (§1).
- **O layout foi medido com a casca**, em rota temporária no `.gitignore` antes
  de existir e apagada no fim, com dados inventados do zero. Tirar um painel da
  pilha **melhorou o equilíbrio em vez de piorar**: a 1440 a pilha fica 34px mais
  alta que o mapa, contra a folga que sobrava antes; a 1100 o vão da linha caiu de
  ~540 para ~350px, e ele fica sob a tabela de portos, não sob a pilha. Sem
  rolagem lateral em 375, 1024, 1100 e 1440.
- O resumo fechado cabe em ~560 caracteres e **não rola por dentro** a 1024.
- Uma concordância escapou ao encurtar a legenda — "embarques… continua" — e foi
  corrigida na releitura do texto renderizado, não no fonte: é no navegador que a
  frase montada por partes vira frase.

#### 2026-09-21 — Viagens: dois painéis que não recortavam nada, e o resumo no formato novo

Decisão do Gustavo, na sequência da Mobilidade. **Nada foi acrescentado à tela**:
saíram os painéis "Por modal" e "Por empresa", e o botão de resumo passou ao
formato que a Mobilidade estreou.

**Os dois painéis eram cortes sem recorte.** As duas fontes administrativas deste
módulo só trazem aéreo, então o primeiro mostrava uma linha; e nenhuma delas
informa a empresa por trecho, então o segundo mostrava um parágrafo explicando
por que estava vazio. Um painel que existe para exibir a própria ausência é ruído
ao lado de dado, não lastro.

> **O que saiu foi o painel, não o agregado.** Os dois cortes continuam na camada
> de consulta, com o nulo visível de sempre (§10.10), prontos para voltar à tela
> no dia em que a origem informar a empresa ou em que entrar trecho rodoviário no
> inventário. A §11.1 ganhou o parágrafo que diz isso, para a especificação não
> prometer painel que a tela não tem — que é o defeito que este log vem
> catalogando com outro sinal.

**O resumo abre com duas coisas**: de onde vem o dado e como a conta é feita, esta
última em uma frase — trecho como unidade, fator da faixa, multiplicador de classe,
escala contando separado, mês pela data do voo. Parâmetros, fatores, procedência de
região, exceções e alertas continuam na página, recolhidos.

> **A ressalva do mapa não entrou no recolhido, e não por descuido.** "O ponto não
> marca a posição exata de nada" é das que impedem ler errado, e ela é visível na
> legenda do próprio mapa — quem precisa dela é quem não vai clicar (§11.5). O que
> está atrás do botão é a versão curta, ao lado do resto do lastro.

**A saída dos painéis desequilibra a grade numa faixa de largura, e isso foi
medido em vez de suposto.** A pilha da direita tinha três painéis e acompanhava a
altura da tabela de destinos; com um só, ela termina antes.

- **De `xl` para cima está equilibrado**: a 1280 sobram 85px sob a série e 38px
  entre as duas tabelas; a 1440, 87px. Nada a fazer.
- **Entre 1024 e 1279 sobram cerca de 300px** de branco ao lado da tabela de
  destinos. É branco **fora** do painel, não dentro — `items-start` impede a
  esticada que a lição de 18/09 registra como o defeito de verdade —, então ele se
  lê como coluna que acabou, não como dado faltando.
- **Não mexi na grade**, e o motivo é que a troca não se paga sozinha: empilhar
  tudo naquela faixa fecha o vão e custa ~500px de altura, que é mais do que o vão
  que ele resolve. Fica registrado com o número, para a decisão ser de quem olha a
  tela.

**Validação**

- `tsc --noEmit`, `npm test` (363 testes, nenhum novo) e `next build` passam.
  Nenhum servidor foi subido por mim; usei o que já estava no ar.
- Nenhum teste precisou mudar, e isso é informação: as guardas do resumo prendem
  que a tela peça o método do próprio módulo e mostre **todos** os parâmetros dele,
  sem lista a dedo — recolher não é remover, então elas continuam passando pelo
  mesmo motivo de antes.
- O layout foi medido com rota temporária, no `.gitignore` **antes** de existir e
  apagada no fim, com a casca. Sem rolagem lateral em 375, 1024, 1100, 1280 e
  1440; as tabelas de cinco colunas rolam por dentro a partir de `xl`, como já
  rolavam antes desta mudança.

> **E a massa daquela rota não era inventada — era a base.** Enchi a série mensal
> e os cartões com os valores de conferência do módulo, por serem os que eu tinha
> à mão. É exatamente o que a entrada anterior deste log descreve: **massa que sai
> de uma medição da base passa por inventada justamente porque é plausível**, e
> quem a escreveu acabou de olhar o número real. O arquivo era temporário, estava
> ignorado antes de existir e foi apagado; a varredura confirma que nada dele
> chegou a arquivo versionado. Mas o que protege o repositório é a varredura, não
> a intenção — e desta vez quem falhou primeiro foi a intenção.

#### 2026-09-21 — Mobilidade: o radar deixa de ser mudo, e o resumo abre com duas linhas

Dois pedidos do Gustavo na mesma etapa, e os dois esbarravam em regra escrita
deste documento. **Nenhum dos dois foi feito como pedido, e nos dois a decisão
final é dele** — o que mudou foi eu ter levantado o conflito antes de escrever
código, em vez de descobrir depois que a tela contradizia a especificação.

**O pedido era clicar na bolinha; o que entrou foi clicar na faixa.**

O dado existe e sempre existiu: a distância já viaja por ponto, e o modal está no
documento. O que barrava era a §3.1.1 — *sem tooltip, sem clique, sem nada que
permita isolar um indivíduo*. E aqui a regra não é formalidade: depois da troca
de provedor de geocodificação (15/09), **as distâncias são quase todas
distintas**, então o par (distância, modal) identifica tão bem quanto um nome. Um
ponto clicável seria a §3.1.1 desfeita por uma porta que ninguém chamaria de
porta.

> **A faixa responde à mesma pergunta sem a pessoa**: quem mora a esta distância
> vai de quê? O recorte é o anel, o modal vem agregado e passa pela mesma
> supressão do bairro — numa faixa pequena cai tudo no balde, que é o resultado
> certo, e o painel diz por quê em vez de mostrar uma lista vazia. A contagem de
> pessoas da faixa não é informação nova: o radar já desenha um ponto por pessoa,
> e contá-los é olhar o desenho. **O que a supressão protege é o atributo.**

**Os limites da faixa e os dos anéis saem de uma função só**, e isso não é
arrumação. Com um número em cada ponta, a tela ofereceria um alvo onde não há
anel — e o painel que abrisse seria o de outra faixa. **Apareceria como número
plausível, nunca como falha**, que é a família deste log inteiro. `limitesDeAnel`
saiu de dentro do desenho e passou a ser lida também pela camada de consulta.

**Sem uma linha de JavaScript**, no padrão do clique da região em Viagens: a
faixa é uma âncora dentro do SVG, o recorte vai para o endereço, e recarregar
mantém a faixa aberta. O ponto recebe `pointer-events: none` para o clique
atravessar até o anel — é essa linha que garante, no desenho, o que a §3.1.1 diz
em texto. A faixa que vem na URL é conferida contra as que existem, senão
qualquer texto no endereço viraria título de painel.

**Dois acabamentos que não estavam no pedido e valem registro:**

- **A tela mostrava a chave técnica do modal.** O gráfico dizia `a_pe` e
  `onibus` ao lado de `carro` — chave de fator e de agrupamento vazando para
  onde ela não devia chegar. Ganhou mapa de rótulo, com a chave desconhecida
  voltando como veio, para o balde da supressão não ser reescrito.
- **O rótulo do anel ganhou contorno na cor do fundo.** Ele cai em cima da nuvem
  de pontos e dos raios da grade; um retângulo atrás apagaria pontos do desenho.

**O resumo da tela: recolher, não remover.**

O pedido era deixar "apenas de onde vem o dado e como é feito o cálculo". Fator,
exceção e alerta não são enfeite — a §11.5 os chama de lastro, e há teste
exigindo que a tela mostre **todos** os parâmetros do módulo, sem lista escolhida
a dedo. Removê-los deixaria o número sem lastro conferível, que é exatamente o
risco que a §14 nomeia nesta classe de mudança.

> **O que abre são três blocos curtos** — fonte, o que entrou, e uma frase em
> português dizendo como a conta é feita, com os dias úteis vindo do dado e não
> de constante. O resto vai para um `<details>` nativo que atravessa as duas
> colunas do resumo. **Declaração se move de lugar, não se apaga** (§14), e desta
> vez o movimento é de um clique para dentro.

**Validação**

- `tsc --noEmit`, `npm test` (363 testes, 6 novos) e `next build` passam. Nenhum
  servidor foi subido por mim; usei o que já estava no ar.
- **As duas guardas novas foram conferidas ligando a violação:** tirar a
  supressão de dentro da faixa faz o modal de quem está sozinho aparecer pelo
  nome e reprova; abrir um vão no piso do primeiro anel faz a cobertura estourar
  e reprova.
- **A segunda não mordia quando eu a escrevi**, e isso é o registro que importa
  desta etapa: a massa não tinha ninguém a distância zero, que é o único caso que
  aquele ramo cobre — a guarda existia, e passava sobre um conjunto onde o
  defeito não podia aparecer. É a lição de 15/09 outra vez, em miniatura. Com a
  massa corrigida, reprova.
- A faixa cheia **mostra o modal pelo nome** no mesmo teste, senão a asserção
  sobre a faixa pequena passaria à toa.
- Exercitado contra o Firestore carregado, por ensaio temporário apagado em
  seguida: todas as respostas caem em exatamente uma faixa, a soma das faixas
  reproduz a emissão do módulo com diferença zero, há um ponto de radar por
  pessoa contada, a supressão age dentro das faixas, e **nenhum identificador,
  bairro, cidade ou distância individual sai no que a faixa devolve** — a
  resposta inteira cabe em pouco mais de dois kilobytes.
- O clique, o realce e o resumo foram exercitados no navegador, que é o único
  lugar onde eles existem, com rota temporária no `.gitignore` **antes** de
  existir e apagada no fim, com dados inventados do zero e **com a casca** (lição
  de 21/09). Sem rolagem lateral em 375 e 1024; a faixa externa acende ao ser
  clicada e o endereço a sustenta; o resumo fechado cabe sem rolagem e aberto
  mostra os dez parâmetros, os fatores e as exceções.

**O que continua fora do alcance de teste automático:** a tela abrir com sessão
de verdade. A rota temporária exercita a árvore de componentes, não a sessão, e
`next build` compila sem renderizar (lição de 15/09).

#### 2026-09-21 — O regime de frete fechou em "os dois", e o aviso sai da tela

O Gustavo trouxe a resposta do levantamento que estava aberto desde o começo do
módulo: **os fretes são CIF e FOB juntos.** É a terceira opção, e é a que a §14
não tinha previsto — ela enquadrava a decisão como "ou um, ou outro".

**O melhor efeito é o que deixou de acontecer.** A §14 dizia que um resultado FOB
poderia tirar o módulo do consolidado, e o módulo é a maior parcela do
inventário. Com os dois, **nada sai**: CIF é cat. 4, FOB é cat. 9, e as duas são
Escopo 3. O que muda não é a presença da emissão, é a repartição dela entre duas
categorias na montagem do relatório.

**E aí a pergunta virou de dado.** Conferi o arquivo antes de propor qualquer
coisa: o export de entregas tem **seis colunas, e a modalidade não é nenhuma
delas**. Não há de onde deduzir qual linha é qual. O dado existe na origem — quem
paga o frete é declarado na nota fiscal —, então o caminho é **pedir a coluna**,
que é operação e não código, no mesmo molde do detalhe por embarque que falta no
marítimo. Do lado do código não falta nada: `cif` e `fob` já são valores válidos e
a carga grava o que vier.

> **Deduzir a modalidade por cliente foi medido e recusado.** A emissão se
> concentra em poucos clientes, então um mapa cobriria a maior parte dela com
> esforço pequeno — e seria inventar dado, porque **um mesmo cliente pode ter as
> duas modalidades ao longo do ano**. O mapa entraria no inventário com cara de
> fato, moraria fora do repositório e envelheceria sem ninguém perceber. É a
> mesma recusa da §8.2: a cascata estima o que falta dentro de um embarque, ela
> não inventa o embarque.

**A decisão do Gustavo: tirar o aviso da tela.** E ele está certo sobre a
redação — a etiqueta dizia *regime de frete indefinido*, no sentido de "ainda não
sabemos", e **isso deixou de ser verdade no instante em que o levantamento
fechou**. Mantê-la seria a tela afirmando ignorância que já não existe, que é o
defeito que este log vem catalogando com outro sinal.

> **O que saiu foi o aviso; o fato foi para o resumo.** A §11.5 separa as duas
> coisas pelo significado, e este caso cai limpo do lado do lastro: **a
> modalidade não muda número nenhum da tela** — total, filial e mês são os
> mesmos em CIF ou FOB. Ela decide a categoria no relatório final, e por isso
> vive ao lado da fonte e do fator, atrás do botão. Declaração se move de lugar,
> não se apaga (§14) — e desta vez o movimento é da tela para o resumo, com o
> texto passando de "não sabemos" para "são os dois, e a origem não separa".

**Três guardas ficaram órfãs, e nenhuma foi apagada em silêncio** — as três
prendiam a ressalva que saiu, e as três foram reapontadas para o que passou a
valer: o agregado **não** expõe o regime, toda entrega entra no consolidado seja
qual for a modalidade, e o resumo do módulo **nomeia as duas modalidades e as
duas categorias**. A última é nova e é a que importa: ela prende o fato e não a
redação, então quem reescrever a frase continua passando e quem apagar a
informação, não.

**O agregado parou de ler o regime, e isso é consequência, não otimização.** Com
um valor só em toda a coleção, o campo não recorta nada e agruparia tudo num
balde; ninguém mais o exibe. Ele saiu da projeção — que neste módulo é medida,
por ele ser uma ordem de grandeza maior que os outros — e a contagem por
modalidade ficou só no `verificar`, que lê a coleção por outro caminho. É lá que
a chegada da coluna vai aparecer sozinha.

**Validação**

- `tsc --noEmit`, `npm test` (357 testes, 1 novo) e `next build` passam. Nenhum
  servidor foi subido.
- **O typecheck foi quem achou as guardas órfãs**: tirar o campo do tipo
  reprovou exatamente os três pontos que dependiam dele, em vez de deixar teste
  passando sobre coisa que não existe mais.
- A varredura confirma que **não sobrou menção a escopo provisório no código** —
  só no §15, que é registro do que foi feito e não especificação vigente.
- Layout não foi remedido, e o motivo é que a mudança só **tira** elemento: o
  cartão perdeu uma etiqueta e a tela do consolidado perdeu um bloco do resumo.
  Nada cresceu, então nada pode passar a estourar.

#### 2026-09-21 — Varredura da §2 antes do commit: massa de teste que não era fictícia

O módulo inteiro foi para o primeiro commit — o quarto módulo e a saída da tela
de Método, juntos, porque a tela nova nasceu já no formato do botão fixo e o
estado intermediário não typecheca separado.

**A varredura achou três coisas, e as três são da mesma família: número real
disfarçado de massa de teste.** Nenhuma apareceria em typecheck, em teste nem
no gancho de pré-commit, que procura credencial e não dado.

- **Três distâncias do teste do leitor eram as medidas da base** — a maior
  doméstica, a menor internacional e a maior internacional, recortadas numa
  casa decimal. O cabeçalho do arquivo afirmava que toda massa era inventada do
  zero, e essas três não eram: eram exatamente os valores de conferência que a
  §2.1 proíbe versionar, no lugar que a §2.2 nomeia como o que ninguém revisa.
  **O que o teste precisa é do vão, não dos números que o mediram** — um valor
  abaixo do limiar, um acima e um bem acima provam a mesma coisa com massa
  inventada.
- **O rodapé de uma aba era a linha de rodapé do relatório real**, copiada para
  o teste do descarte. É linha da base, e a §2.2 diz que não se recorta nem "só
  uma para testar": o que o teste confere é que a linha não tem cliente, e isso
  qualquer texto prova.
- **O volume da coleção estava escrito por extenso em três comentários**, como
  argumento de custo — e volume real é volume real escrito em algarismo ou em
  palavra. O argumento não depende dele: "a coleção inteira duas vezes" diz a
  mesma coisa e não publica quantas entregas a empresa faz por ano.

Nenhum outro achado: o valor do fator não está em lugar nenhum do repositório,
o `.gitignore` cobre a base, o arquivo de fatores e a pasta de ensaio, e o
commit não levou nenhum dos três.

> **A lição, e ela é nova neste log:** o que protege o repositório público é
> varredura, não intenção. Os arquivos de teste deste módulo declaram no
> cabeçalho que a massa é fictícia — **e a declaração não torna a massa
> fictícia**. Massa que sai de uma medição da base entra como plausível e passa
> por inventada justamente porque é plausível; quem a escreveu acabou de olhar
> o número real.

#### 2026-09-21 — Transportadoras, passo 1: o leitor que o projeto não tinha, e o modelo do quarto módulo

Começo do módulo da §9. O passo é leitura, modelo de dados, simulação e
conferência de cobertura — **nada foi gravado no Firestore**: a carga depende de
duas decisões do Gustavo, o limiar da linha internacional e o fator da §9.2.

**O arquivo não abre no leitor das outras cargas, e isso foi medido antes de
decidir qualquer coisa.** O export do sistema de faturamento é um pacote OOXML
válido que escreve o XML com prefixo de namespace e grava as partes numa ordem
que o leitor de stream não espera. Com o arquivo cru ele lança antes de chegar às
abas; com o pacote reempacotado em ordem canônica ele **pendura o processo**, que
é pior que falhar — foram duas tentativas, as duas com tempo limite.

> **A saída óbvia era operacional, e foi recusada por um motivo só.** Reabrir e
> salvar pelo Excel produz um pacote que o leitor antigo lê — é o que o
> `.env.example` já manda fazer com o formato antigo do marítimo. Mas ali a
> conversão é de uma base congelada, e **esta é para carga recorrente** (§9): um
> passo manual por carga é um passo que se esquece, e o arquivo reaberto é uma
> chance a mais de alguém salvar em outro formato. O leitor entrou no
> repositório; a conversão à mão, não.

**`scripts/_xlsx.ts` lê o pacote com o que o Node já tem** — `zlib` para o zip e
expressão regular para o XML —, sem dependência nova. Ele interpreta o mínimo:
nome de aba, texto compartilhado e a grade. Formato de célula, estilo e largura
de coluna são ignorados de propósito, porque quanto menos do pacote ele
interpreta, menos ele tem para errar. **Tudo que ele não entende falha alto,
nomeando o que encontrou:** tipo de célula desconhecido, índice de texto
compartilhado fora da lista, zip64, compressão que não é deflate, CRC que não
confere e o sistema de data de 1904 — este último porque deslocaria o inventário
inteiro em quatro anos sem nada parecer quebrado.

**A data volta como número, e a conversão mora onde se sabe o que a coluna
significa.** Descobrir que uma célula é data exige interpretar o formato dela, a
parte mais frágil de ler xlsx. O leitor devolve o número de série cru; quem
converte é o leitor do relatório, que sabe que aquela coluna é a data da entrega.
A regra vale no sentido inverso também: nenhuma coluna vira data por acidente.

> **O defeito do leitor foi o primeiro, e é da família deste log: deslocamento
> silencioso.** A primeira versão casava a tag de abertura antes da forma vazia,
> então `<c />` era lido como abertura de célula e o corpo dela passava a ser tudo
> até o próximo `</c>` — **a célula vazia engolia a seguinte e a linha andava uma
> coluna**, sem erro nenhum. Ele não apareceu na primeira leitura do arquivo real
> por sorte: as células vazias daquele export estão no fim da linha, e no fim não
> há fechamento à frente para capturar. Apareceu ao conferir a contagem de linhas
> contra uma leitura independente do XML, que deu uma linha de diferença.
>
> O conserto é de forma — a forma vazia primeiro, e a forma com corpo recusando
> terminar em `/` —, e o teste que o prende tem **célula vazia no meio da linha e
> um par de vazias seguidas**, que são as duas maneiras de acertar por acidente.
> Conferido ligando o defeito de volta: as duas guardas reprovam, as outras nove
> passam.

**Os primitivos de planilha saíram do módulo marítimo para `src/lib/planilha.ts`,
e a razão é uma lição que já estava paga.** `texto`, `chave` e a conversão de data
carregam o caso da data inválida que derrubava a carga inteira e o do fuso que
jogava o dia primeiro para o mês anterior. Duas cópias delas seriam uma que
envelhece sem a outra — é o mesmo movimento que tirou o tipo do desenho de dentro
da pasta de Viagens. A mudança é de lugar, não de comportamento, e typecheck mais
suíte inteira provam isso.

> **E a função de número ficou com um aviso que virou teste.** A limpeza de
> separador brasileiro do marítimo remove o ponto seguido de três dígitos, o que
> é certo numa coluna de peso digitada à mão em quilos. **Nesta base ela
> multiplicaria a distância por mil:** um valor como "1.701" é um quilômetro e
> setecentos metros numa entrega urbana e mil setecentos e um na leitura da outra
> coluna, e não há como decidir qual é sem olhar a origem. Por isso o leitor de
> entregas **exige célula numérica e recusa texto em coluna de medida** — recusa a
> linha, com motivo, em vez de adivinhar. Adivinhar aqui inventa distância, e mil
> vezes a distância passa como número plausível.

**O que a leitura descarta, e a diferença entre os três casos**

- **Linha sem cliente sai sem alerta** (§9.3): é linha em branco e o rodapé com os
  filtros do relatório. Contada, porque descarte que não é contado é buraco na
  cobertura, mas não é exceção visível.
- **Linha internacional sai contada e anunciada**, com a faixa de distância que
  ela ocupa. O limiar é parâmetro sem padrão, no molde dos dois do marítimo:
  ele decide o que **não entra**, e número que muda sem registro muda o total sem
  registro.
- **Filial fora das conhecidas é recusada com o código no motivo.** Ela não é
  linha a ignorar: é a §9.4 desatualizada, e a decisão é de quem mantém a lista de
  filiais — não de um descarte silencioso.

**A ordem conta só as entregas aceitas, e isso é identidade, não estatística.** O
relatório não traz identificador de entrega, então o ID é filial, data e a ordem
da linha dentro desse par (§10.11). Se a linha descartada consumisse um número,
mudar o limiar deslocaria o identificador de todas as seguintes daquele dia — e a
recarga passaria a **gravar documento novo em vez de sobrescrever**, dobrando o
módulo em silêncio. Tem teste, e o teste tem descarte no meio da sequência.

**Três decisões de modelo que não estavam no documento**

- **`NivelDadoRodoviario` é união própria, e não o `NivelDado` do marítimo.** Lá
  os degraus dizem se o CO₂ foi informado pelo agente ou estimado, e por qual
  média; aqui não existe emissão informada — a atividade é medida e o fator é uma
  média declarada. Compartilhar a união deixaria `medido` escrevível numa coleção
  onde nada é medido. Um valor só hoje, e o segundo aparece no dia em que a origem
  trouxer dado por veículo.
- **O escopo de recarga é o ano da entrega, nunca a filial.** As três filiais vêm
  no mesmo relatório, e um escopo por filial faria uma carga apagar as entregas
  das outras duas. O export é filtrado por ano na origem — o rodapé do arquivo diz
  qual —, então o ano é o recorte que a recarga pode substituir inteiro.
- **O fator é obrigatório no documento, mesmo com emissão zero.** No envelope,
  fator nulo se sustenta onde a emissão é zero por definição — bicicleta, a pé.
  Aqui não existe entrega que não emita por definição: o zero vem de peso zero, e
  a conta continua sendo fator × atividade. Sem o carimbo, a linha deixa de ser
  reproduzível a partir do documento.

**A conferência de cobertura entrou na mesma leva da ingestão, nunca depois**
(§8.4). São duas identidades, cada uma respondendo a uma coisa: **por ano**,
documentos no banco contra entregas aceitas na origem, porque o ano é o escopo de
recarga e é nele que uma carga parcial apareceria; e **no arquivo inteiro**,
linhas com cliente contra aceitas mais internacionais mais recusadas com motivo —
sem o segundo termo, um descarte silencioso passaria por cobertura correta. Junto
vai a integridade do que está no banco, independente da origem, inclusive **o ID
recalculado pela regra de hoje**: documento gravado por outra regra de identidade
continuaria somando e deixaria de ser sobrescrito pela recarga.

**A simulação roda sem o fator; a gravação para.** Sem fator carregado, seguir
seria inventar o número do módulo, e a §10.8 é explícita. Mas parar a simulação
esconderia justamente o que se quer conferir antes de o fator existir: quantas
linhas entram, quantas saem e por quê. Então a ausência do fator é anunciada, a
emissão fica em branco e a carga com `--gravar` falha com o nome da categoria e da
chave que faltam.

**Validação**

- `tsc --noEmit`, `npm test` (333 testes, 43 novos) e `next build` passam. Nenhum
  servidor foi subido.
- O leitor de pacote foi exercitado contra as **duas formas** do mesmo arquivo:
  a do export, com prefixo de namespace e texto embutido, e a do Excel, com texto
  compartilhado e posição pela referência de célula. O pacote de teste é montado
  byte a byte pelo próprio teste, com massa inventada do zero.
- A simulação rodou contra o arquivo real e as contagens fecham por identidade:
  aceitas mais descartadas mais linhas sem cliente mais cabeçalho é o total de
  linhas do arquivo, conferido contra uma leitura independente do XML.
- Exercitado por ensaio temporário apagado em seguida: **todo documento montado
  passa pela validação**, nenhum identificador colide, a ordem máxima dentro de um
  par filial+data é coerente com a base, e os doze meses do ano aparecem.
- `verificar` fecha tudo o que já fechava; **a única conferência que falha é a de
  cobertura deste módulo**, com a diferença exata entre o arquivo e a coleção
  vazia. Falhar aqui é o comportamento correto enquanto a carga não roda — foi o
  mesmo estado do marítimo entre o passo 1 e o passo 2 dele.

**O que este passo deixa em aberto, e é decisão, não pendência técnica:** o valor
do limiar da linha internacional e o fator de frete rodoviário de carga com fonte
e vigência (§9.2). Os dois são parâmetros declarados, os dois vêm vazios no
`.env.example` e o segundo é o passo 2.

#### 2026-09-21 — Transportadoras, passo 5: o módulo entra no consolidado

O quarto módulo no total do ano. **O inventário de 2025 passou a ser somado com
quatro parcelas**, e a nova é a maior delas — o que é, por si, o achado desta
etapa: a distribuição rodoviária responde por cerca de dois terços do total, e o
número que a Visão geral mostrava antes era a fração do inventário que não a
incluía.

**Tudo que a §11.0 pede entrou junto, e cada peça no lugar que ela manda:** a
quarta fatia na faixa proporcional, a quarta banda na série empilhada, o quarto
cartão — e a **quarta declaração obrigatória no próprio cartão**, não em rodapé:
regime de frete `indefinido`, cat. 4 provisória. A ressalva sai do **dado**, e não
de uma constante na tela: no dia em que o levantamento de CIF/FOB fechar, ela
some sozinha, e se apontar FOB o módulo pode precisar sair deste total — é
reclassificação de escopo, não ajuste de tela (§14).

**A cor da quarta banda é a mais clara da paleta da §4, e o módulo novo entra no
topo da pilha.** Trocar a ordem dos que já estavam mudaria a leitura de um
gráfico que alguém já conhece, sem nada ganhar; a mobilidade continua embaixo,
porque banda constante só se lê como constante quando o que está sob ela não
varia.

**A coerência entre as telas foi estendida ao módulo novo**, e é ela que dá a
garantia que a §11.0.1 pede: a recontagem independente — feita direto da coleção,
sem passar por consulta nenhuma — bate com o consolidado, e o consolidado bate
com a tela do módulo. As duas invariantes que já estouravam continuam valendo com
quatro parcelas: a soma dos doze meses reproduz o indicador e as fatias reproduzem
o indicador, as duas com diferença zero.

**A correção do passo 4, que só apareceu ao medir com a casca**

> **A rota temporária do passo 4 desenhava a tela sem o menu**, e o menu tem
> 232px fixos a partir de `md`. Toda largura de coluna que eu medi saiu maior que
> a real, e a conclusão — "cabe uma coluna fixa de 824px, e acima de 1800 cabem
> três colunas" — era sobre um layout que não existe. Com a casca no ensaio, a
> mesma tela **rolava de lado a 1366**, com a coluna da direita espremida em
> 167px.
>
> É a lição de 18/09 outra vez, e agora pelo avesso: lá o erro foi deduzir em vez
> de medir; aqui foi **medir a coisa errada**. Um ensaio que não inclui a casca
> não é a tela — é uma tela mais larga que ela.

A grade voltou a ser proporcional e ganhou dois números medidos, cada um por um
motivo: **duas colunas só a partir de `xl`**, porque a 1024 cada coluna ficaria
abaixo do piso dos dois desenhos e os dois passariam a rolar por dentro; e a
razão **1,1 e não 1,2**, porque a 1280 — o degrau em que as duas colunas começam
— a de 1,2 deixava a série onze pixels abaixo do piso dela, e rolagem de uma
dezena de pixels é a pior que existe: ninguém percebe que ela está lá e ela leva
embora o último mês (19/09).

O degrau de tema criado no passo 4 saiu junto com a coluna fixa que o justificava:
**variável que ninguém lê é armadilha esperando alguém encontrar** (§7). A lição
sobre a ordem das media queries ficou escrita, porque vale para o próximo.

**Validação**

- `tsc --noEmit`, `npm test` (356 testes, 2 novos) e `next build` passam, com as
  oito rotas na lista. Nenhum servidor foi subido por mim; usei o que já estava
  no ar.
- `verificar` fecha inteiro, incluindo as duas linhas novas da coerência entre
  telas e as duas invariantes do consolidado, todas com diferença zero.
- As guardas do consolidado ganharam as duas que faltavam e **foram conferidas
  ligando a violação**: entrega de outro ano movendo o indicador, e a ressalva de
  regime provisório saindo de constante em vez de sair do documento. O banco
  falso daquele arquivo ganhou a projeção de campos que a consulta nova usa.
- **O layout foi medido com a casca**, em rota temporária no `.gitignore` antes
  de existir e apagada no fim, com dados inventados do zero. Sem rolagem lateral
  em 360, 390, 640, 1024, 1280, 1366 e 1920, e **sem rolagem por dentro de painel
  nenhum** em nenhuma delas. O branco ao lado do mapa ficou em 2px de 1280 a 1920;
  o que sobra ao lado da série mensal a 1920 são 167px, que é o teto do desenho
  compartilhado e não um excedente desta tela.
- A Visão geral foi medida com os quatro cartões: a 1920 a coluna da série
  continua com 2px de sobra e os cartões refluem, como em 19/09.

#### 2026-09-21 — Transportadoras, passo 4: a tela, e a ordem das media queries

A quinta tela do inventário. O menu passou a oferecê-la — e a oferecer **pela
lista de módulos da camada de acesso**, em vez da lista literal de três que
estava escrita ali: com a literal, um módulo novo nasceria fora do menu sem nada
acusar.

**O mapa deste módulo não é o mapa de rotas, e a diferença é do dado.** A
planilha não traz coordenada de cliente: traz a **distância** até ele. Não há de
onde tirar a outra ponta de uma linha, e desenhar uma linha para um ponto
inventado afirmaria um destino que o dado não tem. O que existe são três lugares
e os números de cada um, que é o que a §9.5 pede.

> **Compartilhar o desenho, não o dado** (§7.5, outra vez). Três peças do mapa de
> rotas — o contorno do mundo, o do Brasil e a marca de lugar — viraram públicas
> e o mapa novo usa as três. Elas não sabem o que é uma ligação: sabem projetar
> contorno e marcar ponto. Duplicá-las seria ter dois traçados do mesmo país
> envelhecendo separados.

**O enquadramento é o país inteiro, e não os três pontos.** Enquadrar pelos
pontos daria um retângulo entre o Paraná e Pernambuco, com o país cortado nas
quatro bordas — um mapa que parece truncado. Com o país inteiro, a distância
entre as filiais é a que é, e o Norte vazio também informa.

**Clicar numa filial abre os números dela**, por âncora e endereço, como o clique
na região do mapa de Viagens: recarregar mantém a filial aberta, o endereço pode
ser enviado, e o ponto continua clicável com script bloqueado. A filial que vem
na URL é conferida contra o que existe — sem isso, qualquer texto no endereço
viraria título de painel.

**O resumo da tela declara o que muda o número**: alocação por
tonelada-quilômetro, trecho único sem ida e volta, veículo médio assumido, o
limiar da linha internacional, o regime de frete provisório e o período. Mais o
fator, com fonte, versão e vigência.

> **E o "o que entrou" deste módulo vem do agregado da tela, não de uma segunda
> leitura da coleção.** Ela é uma ordem de grandeza maior que as outras três, e a
> tela acabou de lê-la para desenhar o número: relê-la no método seria vinte e
> cinco mil documentos duas vezes para a mesma pergunta. Vindo de onde veio o
> total, os dois números não podem divergir — são um só.
>
> Isso só se sustenta porque **esta carga não emite alerta**: o que a leitura não
> entende, ela recusa com motivo, e a recusa é contada na conferência de
> cobertura. É fato, não suposição, e virou teste — no dia em que a carga passar a
> emitir alerta, o teste reprova e o resumo precisa voltar a ler a coleção.

**Dois defeitos de layout, e o segundo é da família que este log vem
registrando**

- **Branco dentro do painel, outra vez.** Medido a 1920, o painel do mapa ficava
  233px mais largo que o desenho, e branco dentro de uma caixa com borda se lê
  como dado faltando (18/09). A coluna do mapa passou a ter medida fixa acima de
  `xl` — o teto do desenho mais o respiro do painel —, e o excedente foi para a
  coluna que reflui. Aí o mesmo branco reapareceu do outro lado, 464px na coluna
  da série: **excedente estrutural resolve-se com uma coluna a mais**, e a terceira
  coluna entrou.

- **A terceira coluna existia no CSS e não valia na tela, por ordem de media
  query.** Declarada como largura arbitrária — `min-[1800px]:` —, ela era emitida
  **antes** de todos os degraus de fábrica, e o `xl:`, que vem depois, desfazia a
  grade: a tela seguia com duas colunas a 1920 e nada acusava. Como degrau de
  tema ela entrou na ordem certa, **e só depois de ir para `rem`**: em pixels, o
  Tailwind continuava emitindo-a antes das outras, que são todas em `rem`.
  Medido no CSS construído: a ordem passou a ser 40, 48, 64, 80, 96 e 112,5rem.

  **A terceira coluna não sobreviveu ao passo 5**, quando a medição foi refeita
  com o menu: ela não cabe em largura nenhuma de monitor real. O degrau de tema
  saiu junto — variável que ninguém lê é armadilha (§7). **A lição sobre a ordem
  das media queries fica**, porque ela vale para o próximo degrau que alguém
  declarar.

  > **É a lição de 18/09 pela terceira vez, e agora com nome.** Coerência interna
  > passa em tudo — a classe existe, o valor está certo, o elemento a tem —, e o
  > resultado é layout, que só existe com navegador fazendo layout. O que pegou
  > foi medir a caixa renderizada, e depois ler a ordem das regras no arquivo
  > construído.

**Um deslize meu no meio do caminho, e ele custou uma medição inteira.** A rota
temporária de medição nasceu sem a classe de colocação que a tela real tinha —
duas substituições de texto, e uma não pegou. Medi uma árvore que não era a da
tela, e a primeira conclusão ("a grade de três colunas não está aplicando") era
sobre o ensaio, não sobre a tela. **É o mesmo erro de 19/09**: edição aplicada
sem conferir se pegou. O que o achou foi ler o `className` do elemento no
navegador em vez de confiar no arquivo.

**Validação**

- `tsc --noEmit`, `npm test` (354 testes, 5 novos) e `next build` passam, e
  `/transportadoras` aparece na lista de rotas. Nenhum servidor foi subido por
  mim; usei o que já estava no ar.
- **O layout foi medido com rota temporária**, no `.gitignore` **antes** de
  existir e apagada no fim, desenhando a árvore real da tela com dados inventados
  do zero. **A medição estava errada e foi refeita no passo seguinte**: a rota
  desenhava a tela sem o menu de 232px, então toda largura de coluna saía maior
  que a real, e a grade de colunas fixas que ela justificou fazia a página rolar
  de lado a 1366. O que vale é a medição do passo 5, com a casca.
- No celular o mapa **muda de forma em vez de encolher o texto**: os nomes das
  filiais saem do desenho e a legenda declara que saíram, como nos outros mapas
  (18/09).
- O método do módulo foi exercitado contra o Firestore carregado, por ensaio
  temporário apagado em seguida: os seis parâmetros saem definidos, o fator sai
  com fonte, versão e vigência, **nenhum alerta e nenhuma exceção**, e a consulta
  não encosta na coleção de entregas — 866ms, contra os dois segundos de quem a
  lê. `importacao` pedindo o módulo recebe zero parâmetros e zero fontes.
- `/transportadoras` sem sessão manda para a tela de entrada, que é o caminho da
  autorização funcionando.

**O que continua fora do alcance de teste automático:** a tela abrir com sessão
de verdade. A rota temporária exercita a árvore de componentes, não a sessão, e
`next build` compila sem renderizar — todas as páginas são dinâmicas (lição de
15/09).

#### 2026-09-21 — Transportadoras, passo 3: a consulta agregada

A camada ganhou o quarto módulo. Nenhuma tela ainda: o que entrou foi a porta de
autorização, o agregado por filial e por mês, e as guardas que dizem o que **não**
sai daqui.

**O que este módulo não tem, e por que é decisão e não omissão**

- **Não suprime** (§3.1.3, pelo raciocínio do marítimo): uma entrega não tem
  pessoa. Um limite por contagem esconderia filial pequena sem proteger ninguém,
  e mediria número de entregas fingindo medir privacidade. Tem teste: recorte de
  uma entrega só aparece pelo nome, e o agregado serializado não tem balde de
  suprimidos.
- **Não recorta por empresa**, e a ausência é deliberada. A origem não informa a
  empresa do grupo por entrega (§14), então todo documento tem o campo nulo — um
  filtro de igualdade devolveria coleção vazia e **esvaziaria o módulo em
  silêncio** para o perfil recortado. Esse perfil é o `importacao`, que não vê
  este módulo de qualquer forma.
- **Não expõe o cliente.** O agregado é por filial (§9.4) e o código do cliente
  nem é lido; há teste sobre a resposta serializada.

**`importacao` não vê o módulo.** O escopo dele é o marítimo (§5), e distribuição
às filiais é frete de saída, não importação. A `Modulo` da camada de acesso
passou a ter quatro valores, e os dois `Record` que ela indexa — o do menu e o
dos rótulos do consolidado — ganharam a entrada correspondente. **O item de menu
não foi ligado**: oferecer a tela antes de o arquivo dela existir é prometer
porta que não abre, e é o que o teste de navegação prende.

**As três filiais aparecem sempre, mesmo sem entrega no período.** Elas são o
mapa do módulo (§9.5), e filial que some num ano fraco é lida como filial
fechada — zero é zero medido, ausência é outra coisa (§10.10). E filial que
esteja no banco **sem estar na lista da §9.4 também aparece**, pelo próprio
código: se sumisse, o total geral deixaria de bater com a contagem de documentos,
que é exatamente o que a invariante do agrupamento impede. As duas pontas têm
teste.

**O ponto de cada filial sai do centroide do município, pelo código do IBGE** —
a mesma fonte que o programa de viagens usa para desenhar (§7.4). Não há
coordenada escrita à mão no código, e isso fecha uma porta que valia fechar: a
coordenada da fábrica é parâmetro de ambiente (§2.1), e "o ponto da matriz" seria
o disfarce perfeito para ela virar constante versionada.

**O peso movimentado entra no agregado, e a §1 diz que peso não aparece na
tela.** A §9.5 é mais específica e pede o número no painel da filial, como a
§11.2 pede a distância média na mobilidade — vale a específica, e o comentário no
tipo diz por quê. É a mesma decisão de 15/09, no módulo de mobilidade.

**A única otimização do passo, e ela foi medida antes de existir**

> Este módulo é **uma ordem de grandeza maior que os outros três**, e a consulta
> lê a coleção inteira para reduzir em JavaScript, como as outras (§10.1.5). Com
> a carga real, ler todos os campos custava treze megabytes e alguns segundos
> por abertura de tela. A consulta passou a **projetar só os campos que o
> agregado usa** — mesma leitura documento a documento, sem contador
> pré-calculado e sem cache: o que muda é não arrastar o que ninguém soma.
> Medido: menos de três megabytes e mais que o dobro da velocidade.
>
> A lista de campos é a **fonte do tipo** que a agregação enxerga, então usar um
> campo que não está nela **não compila**. Sem isso, o campo esquecido chegaria
> `undefined` e viraria `NaN` num total que ninguém confere — que é a forma
> silenciosa do mesmo erro.

**Validação**

- `tsc --noEmit`, `npm test` (349 testes, 9 novos) e `next build` passam. Nenhum
  servidor foi subido.
- O banco falso dos testes **respeita o `where`**, pela lição de 19/09: com um
  que o ignora, "com recorte de ano" e "sem recorte" devolvem a mesma coisa e o
  teste do filtro passa nos dois casos.
- Um teste antigo precisou mudar e a mudança é correta: ele prendia "os três
  módulos" que cada perfil enxerga. Virou quatro, e ganhou a recusa do
  `importacao` no módulo novo, que é decisão desta etapa.
- A guarda da §0.1 passou a conhecer a coleção nova: a consulta do programa não
  pode ler `entregaRodoviaria`, como já não pode ler as outras três.
- Exercitado contra o Firestore carregado, por ensaio temporário apagado em
  seguida: o total do agregado, o de cada filial e a soma dos doze meses
  reproduzem exatamente o que a carga relatou; os três perfis que podem abrir
  recebem o mesmo número; `importacao` é recusado **antes de a coleção ser
  tocada**; as três filiais saem com cidade e ponto; e a resposta inteira cabe em
  um kilobyte e meio, sem código de cliente, sem distância e sem ordem.

#### 2026-09-21 — Transportadoras, passo 2: o fator, e a carga rodando

**As duas decisões do Gustavo, e a segunda foi a que mudou o desenho.** O limiar
ficou no meio do vão medido entre a maior entrega doméstica e a menor
internacional — qualquer valor ali produz o mesmo resultado hoje, e o escolhido
é o que deixa folga para uma entrega doméstica mais longa aparecer sem ser
rotulada de importação. O fator ficou na média de toda a frota de carga da
tabela de caminhão da ferramenta do GHG Protocol Brasil.

**A bifurcação do fator não era entre fontes, era dentro do mesmo arquivo.** A
tabela traz uma coluna pronta em CO₂e ao lado das colunas por combustível — e
**a ferramenta não usa a coluna pronta nos cálculos dela**, o que foi conferido
lendo as fórmulas: ela procura as colunas de diesel fóssil e de biodiesel,
pondera pela mistura média do ano e manda o CO₂ do biodiesel para uma coluna de
biogênico à parte. As duas leituras do mesmo arquivo diferem em mais de dez por
cento, e a diferença é quase exatamente esse carbono biogênico.

> **O que decidiu não foi metodologia, foi consistência.** O arquivo de fatores
> da mobilidade, que já está em produção, declara a mesma ferramenta, o mesmo
> ano, a mesma mistura, o mesmo conjunto de GWP e — escrito na própria string de
> fonte — que os valores são **CO₂e não biogênico**. Pegar a coluna pronta aqui
> colocaria carbono biogênico dentro deste módulo enquanto o outro o mantém
> fora. **Duas convenções no mesmo inventário é a que ninguém revisa que
> sobrevive**, e a §9.2 ficou dizendo qual é a daqui.

A escolha da **linha** da tabela é suposição declarada, e pesa: a média da frota
inteira contra a linha de caminhão rígido quase dobra o total do módulo. Os três
candidatos foram medidos contra a base e apresentados com o total de cada um
antes de qualquer coisa ser gravada — a planilha não identifica o veículo, e
essa é a escolha que a §9.1 obriga a declarar em vez de embutir.

**O seed segue o padrão do de mobilidade: não traz valor nenhum.** Ele lê um
arquivo que quem assina o relatório monta, valida a forma e grava com fonte,
versão e vigência. A derivação inteira vai para o campo `fonte`, com as parcelas
e as entradas, para a tela de método declarar de onde o número veio. O arquivo
não é versionado, e o valor não está neste documento (§9.2).

**Uma guarda nova, e ela é sobre unidade.** A mesma tabela da fonte traz o fator
por quilômetro na coluna seguinte à do fator por tonelada-quilômetro. Trocar uma
pela outra produziria um número centenas de vezes errado **com tudo parecendo
funcionar**: a carga rodaria, o total fecharia com a soma das entregas e a tela
desenharia. Então o seed recusa arquivo cuja unidade não seja por
tonelada-quilômetro, e a recusa foi conferida contra a unidade por quilômetro.

> **Ela reprovou o arquivo certo na primeira execução, e o alarme falso era
> meu.** A normalização tirava espaço e ponto e não tirava hífen, então
> "tonelada-quilometro" não casava com a forma que a guarda procurava. Conserto
> de uma linha, e vale registrar pelo motivo de sempre: **guarda que dá alarme
> falso é guarda que se aprende a ignorar** — foi por isso que o conserto foi
> alargar a grafia aceita, e não afrouxar o que ela exige.

**Um defeito meu que teria travado a carga com o fator carregado**

> A carga sondava a existência do fator pedindo a vigência **numa data fixa e
> antiga**, antes de ler o arquivo. Como o fator vale a partir do ano relatado,
> a sondagem sempre dizia "ausente": a simulação nunca calcularia emissão e a
> gravação pararia reclamando de um fator que estava no banco. É a família deste
> log inteiro — **uma consulta afirmando um arranjo que o dado não tem** —, e
> apareceu na primeira execução depois do seed, porque o relatório continuou
> dizendo que o fator não estava carregado.
>
> O conserto é melhor que a sondagem: **quem descobre a ausência é a primeira
> entrega**, na data dela. Com isso a mensagem de erro passa a dizer qual data
> ficou sem cobertura, que é a falha de verdade — carregar um ano que o fator
> não alcança. Na simulação a ausência é capturada e a leitura segue sem
> emissão; na gravação ela sobe e para a carga (§10.8).

**A carga rodou.** Um documento por entrega, escopo de recarga o ano, nada
removido porque a coleção estava vazia. O `verificar` passou a fechar inteiro,
incluindo as duas identidades de cobertura deste módulo, que antes falhavam
justamente por a carga não ter rodado.

**Validação**

- `tsc --noEmit`, `npm test` (340 testes, 7 novos) e `next build` passam. Nenhum
  servidor foi subido.
- **As guardas do seed foram conferidas uma a uma, ligando cada violação:**
  unidade por quilômetro, unidade vazia, valor zero, valor negativo, vigência
  fora do formato e arquivo sem a chave que a carga procura. As seis reprovam, e
  as grafias legítimas da unidade passam. **O ensaio virou teste**, em vez de ser
  apagado com os outros: foi ele que pegou o alarme falso do hífen, e é ele que
  pegaria o próximo.
- **As guardas da cobertura foram conferidas com o banco já carregado**, que é
  onde elas têm mordida: sem o limiar no ambiente, a conferência falha dizendo
  que há entregas no banco e nenhuma conferência possível; com o limiar mudado
  para um valor que faria a origem aceitar as linhas internacionais, ela falha
  com a diferença exata entre origem e banco.
- Exercitado contra o Firestore carregado, por ensaio temporário apagado em
  seguida: a contagem de documentos bate com a da carga, **nenhum identificador
  colide**, a soma dos doze meses reproduz o total com diferença zero, e **a
  emissão de cada documento é refeita a partir do próprio documento com
  diferença zero** — distância, peso e fator carimbado bastam, que é o que a
  §10.1 pede.
- Conferido também o que não pode ter entrado: nenhum alerta gravado, nenhum
  documento fora do envelope do módulo, regime de frete `indefinido` em todos,
  nível de dado `calculado_tkm` em todos, nenhuma linha acima do limiar no banco
  e **nenhum código de cliente com forma de nome** — os distintos foram
  agrupados por forma, sem imprimir valor, e o mais longo tem oito caracteres.
- As conferências dos outros três módulos continuam fechando, o que é a prova de
  que nada fora deste módulo se mexeu.

#### 2026-09-19 — A tela de Método sai, e cada tela ganha um botão de resumo

Decisão do Gustavo, na etapa seguinte à Visão geral. A §14 avisava qual era o
risco, e não era apagar a tela: era **apagar o endereço das declarações**. Uma
escolha que muda o número e não aparece em lugar nenhum deixa o número sem
lastro, e nada quebra — o inventário continua somando certo e para de poder ser
conferido.

**O formato veio do Gustavo, em duas rodadas, e a segunda corrigiu a primeira.**
Eu havia oferecido rodapé por módulo, aberto ou recolhido, ou mandar parte para o
terminal. Ele pediu outra coisa — um botão de informações por painel —, e eu
construí assim: vinte e cinco botões, um em cada cartão e cada painel das quatro
telas. Vendo no ar, ele pediu o formato final: **um botão fixo por tela**, sempre
no mesmo canto, com tudo daquela tela **muito resumido**.

> **A segunda versão é melhor, e o motivo é de leitura.** Vinte e cinco botões são
> vinte e cinco coisas disputando atenção ao lado de vinte e cinco títulos, e quem
> quer entender o número não sabe qual abrir — o sistema ganhou um enfeite por
> painel e continuou sem um lugar onde a pergunta é respondida. **Um lugar
> previsível responde antes de ser procurado.** A primeira versão não chegou a
> commit; o que sobreviveu dela foram os três defeitos abaixo, que são da
> mecânica e valem para qualquer formato.

**A telinha é `popover` nativo do HTML, sem uma linha de JavaScript.** `Esc`,
clique fora, foco e camada de cima são do navegador. É a mesma regra das
animações (15/09): o que depende de script não pode ser o que sustenta o
conteúdo. Num navegador sem suporte ela aparece **aberta**, porque quem esconde
um popover fechado é a folha de estilo que vem junto do suporte — o pior caso é a
declaração visível demais, nunca inalcançável.

**O que impede a declaração de se perder, e como ele mudou entre as duas versões**

Na primeira versão cada painel listava as **chaves** que mostrava, e uma guarda
conferia que nenhuma das vinte e cinco tinha ficado órfã. Com o botão único a
lista deixou de existir: cada tela mostra **todos os parâmetros do próprio
módulo**, então parâmetro novo aparece sozinho e **não há lista para alguém
esquecer de atualizar**. É o argumento da §0.1 outra vez — a falha passa de
guardada a impossível quando não há filtro para esquecer.

A chave ficou, porque é ela que identifica um parâmetro sem depender do rótulo, e
o que resta é conferido por teste: todo parâmetro tem módulo, todo módulo tem
tela, cada tela tem um botão e só um, e o botão fica na raiz da tela.

**Três defeitos, e o primeiro derrubava a página inteira**

> **A telinha é um bloco, e bloco não entra em `<p>` nem em título.** A primeira
> versão passava o botão e o painel como filhos do `<h2>` do painel e do `<p>` do
> cartão. O analisador de HTML fecha o parágrafo antes do bloco, o DOM deixa de
> bater com o que o React renderizou e **a hidratação falha** — e hidratação que
> falha não é um aviso no console: é a página inteira parando de hidratar, com
> todo botão virando enfeite. É o sintoma de 18/09 outra vez, por outra porta.
>
> No formato final o botão e a telinha ficam **na raiz da tela**, fora de painel e
> de cartão, e isso virou teste — conferido pela indentação, depois de a primeira
> versão do próprio teste quebrar contando tags: um `>` dentro de um atributo JSX
> encerra a tag para qualquer expressão regular honesta.

- **O preflight do Tailwind matava a centralização.** O navegador posiciona um
  popover com `inset: 0` mais `margin: auto`; o preflight zera a margem de tudo,
  e a telinha nascia colada no canto superior esquerdo da janela — medido em
  x=0, y=0. Uma linha de `margin: auto` devolve o comportamento.
- **O alvo de toque era menor que o mínimo**, enquanto o botão era um círculo ao
  lado do título: 24px no celular, contra os 44px que esta base adotou em 18/09.
  O formato final resolveu isso por construção — o botão fixo é uma pílula de
  150×42px, com texto, e é o contrário de pequeno demais.

**O que ficou na tela e o que foi para o resumo**

A divisão é de significado, não de espaço, e está escrita na §11.5:

- **Ressalva que impede leitura errada fica visível.** O ângulo do radar não
  significar nada, o ponto do mapa de Viagens não ser um aeroporto, a linha do
  mapa marítimo não ser a derrota do navio, o que não pôde ser desenhado, a
  proporção da cascata e as três declarações da §11.0. **Quem precisa delas é
  justamente quem não vai clicar.**
- **Lastro vai para o resumo.** Fonte, situação da carga, parâmetro, fator com
  vigência, exceção com motivo e alerta com a regra que o levanta.

O resumo abre em **duas colunas a partir de `sm`, por fluxo e não por grade**: os
blocos têm alturas muito diferentes — uma fonte de duas linhas ao lado de uma
lista de dez parâmetros —, e numa grade isso vira linha com buraco. Nenhum bloco
se parte entre as colunas.

**O enxugamento, medido, dos dois lados**

A prosa que a tela mostra **sem clicar** caiu de 10.982 para 7.160 caracteres, 35%
a menos, com todo painel em uma linha de descrição. O que sobrou é quase todo
frase construída a partir do dado — contagem, proporção, o que não coube no
desenho — e as ressalvas acima. **Cortar mais é cortar declaração**, e isso ficou
escrito na §14: declaração se move de lugar, não se apaga.

**E o resumo encolheu em duas rodadas, que era o pedido.** As vinte e cinco
observações de parâmetro caíram de uma média de 236 caracteres para 84 na
primeira, e depois **a maior parte delas deixou de existir**: sobraram sete, e o
total de glosa foi de cerca de 5.900 caracteres para 254. O resto é rótulo e
valor em duas colunas — "21 dias úteis", "econômica, assumida" —, que é o que o
Gustavo pediu por "apenas o extremamente necessário".

**Duas coisas saíram da tela e continuam no sistema**, e a diferença importa: a
regra que levanta cada alerta, que agora aparece só pelo código descritivo e
continua conferida pelo `verificar`; e o ponteiro para a conferência de cobertura
na fonte do marítimo, cuja afirmação — agente sem detalhe por embarque não está
no inventário — ficou. **Medido:** o resumo inteiro de uma tela cabe em cerca de
900 caracteres, sem rolagem, em duas colunas a 1366px.

> **Duas guardas reprovaram no corte, e as duas estavam certas em reprovar.**
> Elas prendiam a **redação** de uma declaração — a palavra "administrativas"
> numa, a frase "não inventa o embarque" na outra — e o texto encurtou. O
> conserto foi prender o **fato**: as duas fontes pelo nome, e a afirmação de que
> agente sem detalhe não está no inventário. Afrouxar a guarda teria sido o
> caminho errado pelo mesmo motivo que a §14 aponta: é assim que uma declaração
> sai da tela sem ninguém decidir que ela saía.

**A consulta do método passou a ser por módulo.** Não é otimização: cada tela pede
o método do próprio módulo, e sem o recorte abrir o marítimo leria as coleções de
mobilidade e de viagens para jogar fora. Ler o que não se vai usar é como um
recorte errado começa a existir. A autorização continua por cima — pedir um
módulo que o perfil não vê devolve vazio.

**Três peças morreram junto com a tela**, e vale registrar que foram procuradas em
vez de esquecidas: o bloco de seção sem superfície, que só a Método usava; a
largura mínima da tabela de sete colunas, que era a de fatores; e o ícone da rota,
que deixou de ter rota. A tela de entrada mandava para `/metodo` e passou a mandar
para a raiz. **A casca ganhou rodapé maior**, porque botão fixo que cobre a última
linha do último painel é botão que esconde dado.

> **Um deslize meu no meio do caminho, e ele é da família deste log.** Uma das
> edições de texto foi aplicada com uma substituição **sem conferir se tinha
> pegado**, e não pegou — a indentação do arquivo tinha mudado num passo
> anterior. O arquivo seguiu com o texto antigo e nada acusou: typecheck passa,
> teste passa, build passa. Apareceu ao medir a prosa e ver o número não se
> mexer. As edições seguintes passaram a falhar alto quando o alvo não existe.

**Validação**

- `tsc --noEmit`, `npm test` (290 testes, 5 novos) e `next build` passam, e a rota
  `/metodo` não existe mais na lista de rotas. `verificar` fecha inteiro. Nenhum
  servidor foi subido por mim; usei o que já estava no ar.
- As guardas do resumo prendem o que a forma não garante: parâmetro sem módulo,
  módulo sem tela, tela com lista de chaves em vez da lista do módulo, mais de um
  botão por tela, e botão aninhado dentro de painel — esta última é a forma que
  resolve o defeito de hidratação.
- Exercitado contra o Firestore carregado, por ensaio temporário apagado em
  seguida: cada módulo recebe **só os parâmetros dele**, nenhum pendente; nenhum
  alerta sem motivo declarado; nenhuma descrição gravada de alerta e nenhum
  identificador de pessoa na resposta; e **as vinte e cinco chaves do banco têm
  tela**. O perfil `importacao` recebe o método do marítimo e, nos outros dois
  módulos, não chega a ler coleção nenhuma.
- O botão fixo e o popover foram exercitados no navegador, que é o único lugar
  onde eles existem. A 1366px: pílula de 150×42 no canto, **sem cobrir a última
  linha do último painel** com a página rolada até o fim, e o resumo abrindo
  centrado em duas colunas. A 390px: o mesmo botão, resumo em coluna única
  rolando por dentro, **sem a página rolar de lado**. Medido com rota temporária,
  no `.gitignore` **antes** de existir e apagada no fim, com dados inventados do
  zero.


#### 2026-09-19 — Visão geral: as sete telas fechadas, e o que a consolidação cobra

A última tela do sistema. Ela não tem número próprio — todo o conteúdo dela sai
das três consultas de módulo —, e mesmo assim foi a etapa em que mais guarda
nova precisou existir. O motivo é a §10.3: **somar taxa com evento produz número
errado sem nenhum sinal de erro**, e todo defeito possível aqui é silencioso —
nenhum quebra a tela, todos só fazem o total aparecer maior ou menor.

**Passo 0 — os números antes do código**

Medido contra o banco carregado, antes de qualquer linha de tela: os três totais
do ano-base, a soma dos doze meses contra o indicador, e quanto da série do
marítimo fica fora do ano. Três coisas que a medição destapou e que mudaram o que
foi construído:

- **não existe embarque previsto no banco**, então a guarda da previsão nasce sem
  nada a excluir e só morde com massa sintética — mesma situação das duas de
  18/09;
- **o frete aéreo existe e pesa**, então a guarda de que ele fica *dentro* do
  total tem mordida contra dado real;
- **o marítimo mostra dois números em duas telas**, e a diferença não é pequena:
  a série dele é contínua e atravessa os anos (§8.4), enquanto a Visão geral
  relata um ano. Sem uma frase no cartão, quem abrir as duas telas lado a lado
  vai procurar qual das duas cargas está errada. A frase foi decidida antes de
  desenhar, no padrão curto das outras declarações.

**Passo 1 — a consulta, e o defeito que já estava escrito nela**

`consultarVisaoGeral` existia desde a Fase F, nunca tinha rodado, e **carregava
dentro de si exatamente o defeito que a §11.0 avisa** — pedia a mobilidade pelo
ano civil do filtro. A mobilidade é taxa com `anoBase` próprio e `mes` nulo
(§10.5): filtrada por ano civil, a coleção volta vazia e o painel perde um módulo
inteiro **sem erro nenhum**. Foi a primeira guarda a ser escrita e a primeira a
ser conferida ligando a violação.

A consulta saiu para módulo próprio. Três decisões:

- **O ano-base do consolidado é constante, não ambiente**, ao lado da base de
  data do marítimo e pelo mesmo motivo: a escolha que mais move o número não pode
  mudar por variável esquecida numa máquina. O teste **planta um ano diferente em
  variáveis de ambiente** e exige que a resposta continue com a constante.
- **A consulta reusa as três consultas de módulo em vez de recalcular.**
  Recalcular seria uma segunda implementação de "previsão fora", "aéreo dentro" e
  `contabilizar` — duas cópias da mesma regra, e uma que envelhece sem a outra.
  Reusando, a coerência entre esta tela e a do módulo passa a ser estrutural: não
  há filtro para esquecer, que é o argumento da §0.1 para duas coleções em vez de
  um campo discriminador. O preço é ler os cadastros de apoio dos mapas e
  descartar.
- **Zero e ausência ficaram separados no tipo, não só na tela.** Cada módulo
  carrega quantos documentos entraram e qual recorte produziu o número; recorte
  nulo é ausência. Sem ano-base de pesquisa declarado, a mobilidade não relata
  nada — um zero ali passaria por medição de emissão que não houve (§10.10).

**Duas das guardas não são teste: são invariante que estoura**, no molde do
`conferirTotal` da §10.10. A soma dos doze meses contra o indicador, e as fatias
da faixa contra o total. Um documento cujo mês caia fora do ano-base sumiria do
gráfico e continuaria no total, e a tela desenharia doze colunas somando menos
que o número grande em cima delas — sem nada estourar.

**As oito guardas foram conferidas ligando a violação, uma a uma.** Mobilidade
pelo ano civil, marítimo sem recorte de ano, previsão de volta no total, aéreo
fora do total, série com um mês a menos, faixa desenhada sobre outro denominador,
inventário lendo a coleção do programa e recorte de pessoa saindo na resposta:
**as oito reprovam.** Guarda que não morde não é guarda.

> **O banco falso deste arquivo respeita `where`, e sem isso metade delas não
> existiria.** Os bancos falsos dos outros arquivos ignoram o filtro — bastava
> para eles, porque testam agregação. Aqui as guardas são justamente sobre *qual
> recorte cada módulo recebe*: com um banco que ignora `where`, "pelo ano-base" e
> "pelo ano civil" devolvem a mesma coisa e o teste passa nos dois casos, que é o
> pior resultado possível para uma guarda.

**A conferência de coerência entre telas** entrou no `verificar`. Ela é da
família da cobertura (§8.4): não pergunta se a conta fecha, pergunta se **as duas
telas contam a mesma coisa**. A recontagem dela é **independente das duas** — sai
das coleções e aplica as regras na mão —, porque comparar as duas telas só entre
si não provaria nada enquanto uma reusa a outra. E o ano-base da mobilidade dela
sai **da coleção, não do ambiente**: é isso que denuncia a variável apontando
para o ano errado.

Ela também foi conferida ligando a violação, contra o banco carregado: com a
mobilidade filtrada por ano civil, três linhas reprovam e o script sai com erro;
com o marítimo sem recorte, o `verificar` **para antes de imprimir**, porque a
invariante da série estoura primeiro.

**Passo 2 — a tela**

Indicador principal, faixa proporcional, três cartões e a série empilhada. A
faixa mora **dentro do painel do indicador**: são a mesma afirmação em duas
formas, e separá-las em dois painéis faria procurar a relação entre dois números
que são um.

**As três declarações da §11.0 moram cada uma junto do número que qualifica**, e
nenhuma em rodapé — rodapé é onde a ressalva morre. Ano-base da pesquisa no
cartão da mobilidade, com etiqueta; agente único no cartão do marítimo, junto da
frase do recorte; previsão fora do total junto do indicador, que é o total de que
ela está fora.

**A série empilhada não tem altura mínima por segmento, ao contrário da barra
simples, e a diferença é de significado.** Na barra simples o fio de dois pixels
existe para barra pequena não se confundir com barra ausente, e não custa nada
porque a barra não é parte de nada. Aqui a altura da coluna **é** o total do mês:
um mínimo por banda faria a pilha somar mais que a própria coluna, e o desenho
afirmaria um total que o número acima dele não tem.

**Três defeitos que só o desenho mostrou**

- **A mesma chave de cor aparecia em duas ordens na mesma tela.** A legenda da
  série nasceu invertida, para ler de cima para baixo como a pilha é vista, e a
  da faixa lia da esquerda para a direita. Duas ordens para um assunto só, a três
  centímetros de distância, é o leitor conferindo a legenda duas vezes. Ficou uma
  ordem.
- **Os rótulos dos meses se tocavam no celular.** Medido pela caixa do texto, e
  não pelo passo da coluna: com o ano no rótulo, a folga entre vizinhos chegava a
  **−0,2px**; sem ele, a menor folga é **9,8px**. Rarear o rótulo resolveria
  escondendo metade dos meses; encurtar resolve mostrando todos — e aqui o ano é
  redundante, porque a série cobre sempre os doze meses de um ano só, declarado
  no título da tela.
- **O branco migrou para dentro do painel, de novo.** Com a série em largura
  inteira, sobravam **438px** ao lado do desenho a 1366 e **992px** a 1920 — o
  defeito de 18/09 em pessoa, porque `viewBox` é escala e alargar o desenho
  multiplicaria o texto junto. Excedente estrutural resolve-se com uma coluna a
  mais: a série foi para a coluna larga e os três cartões para a de ao lado, e
  acima de `2xl` a coluna da série ganha medida fixa, exatamente o teto do
  desenho mais o respiro do painel. O que sobra vai para os cartões, e **é lá que
  ele não incomoda** — a nota do cartão reflui e o cartão encolhe em altura.

**Um piso mais baixo que o da barra simples, e o motivo foi medido.** Na coluna
larga desta tela, a 1024px, o desenho fica a 0,88 da escala; com o piso de 0,9 o
painel passaria a rolar por dentro **oito pixels**, que é a pior rolagem
possível — ninguém percebe que ela existe e ela leva embora o último mês.

**Um defeito de texto que o ensaio destapou, e que valia para quatro telas.** A
mensagem de recusa saía como "não tem acesso **a ao** inventário": o molde
acrescentava uma preposição que os chamadores já traziam contraída. Ficou
invisível enquanto a mensagem só aparecia em terminal — e ela é o texto da tela
de "Sem acesso", que é a única coisa que um perfil recusado lê.

**Um teste antigo precisou mudar, e a mudança é para melhor.** Havia um que
prendia a Visão geral como "ainda não construída" — verdade até ela existir, e
mentira depois. Com as sete telas no ar, o que ficou prendendo é mais forte e não
envelhece: **todo item que o menu oferece tem arquivo de tela**, conferido em
disco, para todos os perfis.

**Validação**

- `tsc --noEmit`, `npm test` (285 testes, 23 novos) e `next build` passam.
  `verificar` fecha inteiro, incluindo as dez linhas novas da coerência entre
  telas. Nenhum servidor foi subido por mim; usei o que já estava no ar.
- **As oito guardas da §11.0.1 foram conferidas ligando a violação, uma a uma, e
  as duas silenciosas também contra o banco carregado** — a da mobilidade
  reprovando pelo nome do módulo, a do marítimo derrubando o `verificar` com a
  diferença impressa.
- Exercitado contra o Firestore carregado, por ensaio temporário apagado em
  seguida: os três perfis que podem abrir recebem o mesmo total, **a soma dos
  doze meses e a soma das fatias reproduzem o indicador com diferença zero**, a
  banda da mobilidade sai constante nos doze meses, nenhum identificador de
  pessoa e nenhum recorte de bairro ou de modal saem na resposta, e
  `viagemRegistrada` não é lida. **`importacao` e `colaborador` são recusados
  antes de qualquer coleção ser tocada** — não é filtro depois da leitura.
- Os dois estados de borda foram desenhados e conferidos: sem ano-base de
  pesquisa, a mobilidade aparece como ausente e não como zero; sem documento
  nenhum, a tela diz que é ausência de carga.
- O layout foi medido com rota temporária, no `.gitignore` **antes** de existir e
  apagada no fim, desenhando a árvore real da tela com dados inventados do zero.
  Sem rolagem lateral em 360, 390, 640, 768, 1024, 1366, 1536 e 1920; o rótulo do
  mês entre 6,6 e 12,5px, sem nenhuma colisão em nenhuma largura; e o branco ao
  lado do desenho em no máximo 35px em todas elas.

**O que continua fora do alcance de teste automático:** a tela abrir com sessão
de verdade. A rota temporária exercita a árvore de componentes, não a sessão, e
`next build` compila sem renderizar — todas as páginas são dinâmicas (lição de
15/09).


#### 2026-09-19 — Marítimo, passos 2 e 3: a tela, e o que só aparece desenhando

O último módulo do inventário ganhou tela e chegou à tela de Método. Nenhum
número mudou de valor nestes dois passos — o que mudou foi o que a tela **diz**
sobre eles, e foi aí que os defeitos apareceram.

**Passo 2 — a tela do módulo**

Os três cartões, o mapa de corredores, a série mensal, os contêineres por porto,
a tabela de corredores e o rodapé de qualidade da §8.2. As exclusões que o
Gustavo decidiu estão na camada, não na tela, e cada uma tem teste que **liga a
violação** — as duas nascem sem nada a excluir, então sem isso seriam guardas
sem mordida:

- **previsão fora de todos os totais** — emissão, contêineres, série, corredores
  e mapa —, contada à parte. Com a regra desligada, o total sobe exatamente o
  que a previsão vale;
- **aéreo no total e fora de tudo que é por contêiner**: indicador, tabela de
  portos, corredores e mapa. Com a regra desligada, o indicador sobe e a tabela
  de portos ganha dois "portos" que são aeroporto e ponto interior;
- **nada de supressão** (§3.1.3): corredor de um embarque aparece pelo próprio
  nome, e não há balde. A declaração do aéreo é **uma string só**, usada na nota
  do indicador, na legenda do mapa e sob as duas tabelas — texto duplicado seria
  garantir que uma das cópias envelhecesse.

**A peça neutra de mapa serve para rota porto a porto, com dois ajustes, e os
dois são sobre este módulo ter algo que o outro não tem**

- **A ligação tem sentido, porque importação tem sentido.** A carga sai de um
  porto e chega no outro, e isso está no documento; em Viagens ida e volta são a
  mesma ligação, e um ponto percorrendo a linha inventaria direção. Virou prop,
  desligada por padrão.
- **Sem divisas de região.** Em Viagens a região *é* a unidade, e clicar num
  ponto acende a divisa. Aqui o ponto é um porto e não há recorte por região:
  desenhar as divisas convidaria a procurar um agrupamento que a tela não tem.

**Os navios do protótipo: a direção é dado, o resto não**

Ao contrário do ângulo do radar (§3.1.1), aqui o movimento não é vazio. O que o
protótipo inventa é tudo em volta dele: a duração de cada arco sai do **índice da
linha**, que é a ordem por emissão, então corredor mais pesado parece mais lento;
e a animação **repete para sempre**, o que afirma que há navio navegando agora
num período fechado. Ficou uma passagem só, mesma duração para todas,
sincronizada com o traçado da linha, e o ponto se dissolve ao chegar. Em CSS com
`offset-path`, e **não em SMIL**: `animateMotion` ignoraria o bloco de movimento
reduzido, que é quem zera duração e atraso.

**Três defeitos que só o desenho mostrou, e o terceiro é da família deste log**

- **O inserto do Brasil não aparecia.** Ele era montado das **ligações**
  domésticas, e numa importação nenhuma ligação tem as duas pontas no Brasil —
  então ele nunca apareceria justamente no mapa em que os portos de desembarque
  ficam a poucos pixels uns dos outros. Passou a ser montado dos **lugares**
  domésticos. Em Viagens não muda nada, e isso foi conferido, não suposto.
- **Os dois extremos são aglomerados, e só um deles tem inserto.** Medido: uma
  dezena e meia de rótulos com dezenas de sobreposições. Entrou regra geral —
  **rótulo que colide não é escrito, e a legenda declara quantos ficaram sem
  nome**. A medida é a **caixa do texto**, não o raio, que é a correção do alarme
  falso de 18/09: um limiar em pixels da moldura grande acusava colisão dentro do
  inserto, que tem um terço da largura.
- **A série mensal declarava as fontes de Viagens dentro do marítimo.** A nota
  estava escrita **dentro da peça compartilhada** — as duas fontes
  administrativas daquele módulo —, e a tela nova herdou a frase. Cada módulo
  agrupa por uma data diferente e soma fontes diferentes: a nota passou a vir de
  quem chama, e as três telas declaram a sua.

> **Compartilha-se o desenho, não a declaração.** A peça sabe desenhar uma série;
> o que a série significa é sempre do módulo. É a mesma família dos defeitos que
> este log vem pegando — tela afirmando um arranjo que ela não tem.

**Passo 3 — a tela de Método**

O módulo passou de duas linhas para sete no painel de parâmetros, e cada uma é
uma decisão que muda o número: base de data, os dois limiares, previsão fora do
total, aéreo dentro do total e fora do indicador, e o período sem ano-base.

- **A base de data tem fonte única, e o defeito era exatamente o contrário.** A
  tela perguntava ao ambiente uma variável já removida, e declararia "não
  definida" justamente a escolha que mais muda o número do módulo. Ela passou a
  ler a constante. O teste **planta um valor diferente na variável de ambiente** e
  exige que a tela continue declarando a constante: quem reintroduzir a leitura
  do ambiente vê o valor plantado aparecer e reprova.
- **Os dois limiares saem com o valor em vigor**, em linhas separadas de
  propósito — um mede contra a mediana do corredor e deixa entrar, o outro mede
  contra a mediana do módulo e recusa. A amostra mínima do corredor viaja junto
  do primeiro, porque é ela que decide quando a comparação vale.
- **A cascata da §8.2 aparece degrau a degrau**, com a proporção da emissão e a
  contagem de embarques. "Estimativa" sozinho não diz se a média era do corredor
  ou geral, e a diferença é entre um número específico daquela rota e uma média
  do módulo inteiro. O degrau que não aconteceu aparece zerado, não some.
- **A cascata é medida sobre o total, e previsão está fora dele.** Medir os dois
  juntos diria que tal proporção do número vem do agente para um número que não é
  o do módulo. Conferido ligando a violação: com a previsão de volta no
  denominador, o teste reprova.
- **A fonte declara o agente que falta sem inventar o embarque.** Quantos agentes
  o inventário tem é fato do banco; quantos ficaram de fora é fato do arquivo, e
  quem responde isso é a conferência de cobertura. A tela diz onde procurar em
  vez de fingir que sabe.

**O alerta passou a dizer o quê, não só quantos — e isso destapou quatro
alertas mudos**

A tabela de alertas mostrava o identificador e uma contagem. Um código como
`co2_por_container_atipico` só se entende de dentro do código, e **alerta que não
se entende é alerta que se aprende a ignorar**, que é a lição que este log já
registrou duas vezes. Cada tipo ganhou o **motivo**: a regra que o levanta,
escrita junto do código. A descrição gravada na carga continua fora da tela —
ela cita valor do registro e atravessaria a anonimização por porta lateral
(§3.1).

> **A guarda estática passou, e o defeito estava lá.** Escrevi um teste que varre
> o fonte exigindo motivo para todo código de alerta, e ele passou. Rodando a
> tela **contra o banco carregado**, quatro alertas apareceram sem explicação:
> eles moravam como **chave de um `Record` de severidade**, e a varredura só
> procurava a constante exportada. A guarda existia, mordia, e mordia no lugar
> errado.

O conserto foi em três camadas, e a terceira é a que importa:

1. os quatro códigos viraram constante exportada, no formato das outras cargas;
2. a varredura do fonte ganhou uma segunda rede, para o código escrito direto na
   emissão do alerta — conferida com um código inline inventado, que **reprova
   nomeando o arquivo**;
3. **entrou conferência no `verificar`, que varre o banco**: todo código de
   alerta gravado tem motivo declarado. É a família da cobertura (§8.4) —
   coerência pergunta "a conta fecha?", esta pergunta "chegou explicação para
   tudo que está lá?". Conferida tirando dois motivos: reprova, **nomeando os
   dois códigos**.

**Um rótulo que não cabia, medido e encurtado**

A primeira versão da cascata escrevia a fórmula no rótulo. Medido a 1024px, onde
o painel vive numa coluna de 294px dividida com os outros dois módulos, **dois
degraus quebravam em duas linhas**. A unidade da estimativa é decisão declarada
no parâmetro de alocação, que é onde ela se explica inteira; no degrau basta qual
mediana produziu o número. Encurtados, nenhum rótulo quebra.

**Validação**

- `tsc --noEmit`, `npm test` (262 testes, 7 novos) e `next build` passam.
  `verificar` fecha inteiro, incluindo as duas conferências de cobertura do
  marítimo e a nova dos motivos. Nenhum servidor foi subido por mim; usei o que
  já estava no ar.
- **As quatro guardas novas foram conferidas ligando a violação**: a tela lendo a
  base de data do ambiente reprova; um motivo removido reprova, nomeando o código
  e o arquivo; um código de alerta inline sem motivo reprova; a previsão de volta
  no denominador da cascata reprova. Guarda que não morde não é guarda.
- Contra o banco carregado, por ensaio temporário apagado em seguida: os sete
  parâmetros do marítimo saem definidos, nenhum pendente; a cascata fecha em cem
  por cento medido; **nenhum dos dezesseis tipos de alerta fica sem motivo**;
  nenhuma descrição gravada e nenhum identificador de pessoa saem na resposta; e
  o perfil `importacao` recebe só o marítimo, com a mobilidade e as viagens nem
  chegando a ser lidas.
- O layout foi medido com rota temporária, no `.gitignore` **antes** de existir e
  apagada no fim, desenhando o recorte **verbatim** da tela real com dados
  inventados do zero. Sem rolagem lateral em 360, 390, 640, 1024, 1280 e 1366; as
  tabelas viram lista abaixo de 640, com as células nomeadas; nenhum bloco vaza
  por fora do envoltório de rolagem.

**O que continua fora do alcance de teste automático:** a tela abrir. `next
build` compila e não renderiza — todas as páginas são dinâmicas (lição de 15/09),
e a rota temporária exercita a árvore de componentes, não a sessão.

#### 2026-09-18 — Marítimo, passo 1: o código que já estava lá, e as sete decisões que ele não conhecia

Início do último módulo do inventário. Antes de escrever qualquer linha, o
levantamento encontrou o módulo **meio construído e não registrado**.

**De onde veio o que já estava no diretório.** Seis arquivos — a leitura do
relatório, a cascata de qualidade, a carga, o cadastro de portos, a leitura da
lista oficial de códigos de porto e o bloco de cobertura da conferência — foram
escritos entre 16 e 18/09, ficaram fora de todo commit, **não têm entrada neste
log** e a §14 continuava afirmando que o módulo não tinha começado. Nunca
rodaram: as duas coleções do módulo estavam vazias.

> **Código sem entrada no log é rascunho, não base.** Ele foi escrito antes de
> qualquer uma das decisões desta etapa existir, então passou por revisão contra
> o documento em vez de ser aproveitado como pronto — e nada dele entra em commit
> antes de o módulo ter rodado. O que sobreviveu à revisão sobreviveu por
> argumento, não por já estar escrito.

O que a revisão confirmou vale registrar, porque é o que permitiu decidir com
número em cima da base: **a leitura reproduz os valores de conferência
exatamente** — embarques, contêineres, emissão e peso dos dois blocos de detalhe,
sem diferença. O que não sobreviveu está nos dois defeitos abaixo e nas decisões.

**As sete decisões do Gustavo, medidas antes de propostas**

- **Base de data: a partida.** A §8.3 manda escolher entre a base do detalhe e a
  do resumo, e a medição mostrou que **não são duas opções**: a do resumo é
  registro aduaneiro, que existe só na aba agregada — não há coluna por linha, e
  a §10.1 pede um documento por embarque. A escolha real é entre partida e
  chegada, e aí o número decidiu: **partida prevista e partida efetiva concordam
  no mês em todos os embarques que têm as duas**, enquanto a chegada mudaria de
  mês a maior parte da base e de ano uma fração dela. Fica a partida prevista,
  que é a que existe em quase toda linha.
- **Os dois limiares, com a fração da base que cada um marcaria.** O de linha
  atípica ficou no **pé de um patamar**: o valor escolhido e o seguinte marcam
  exatamente as mesmas linhas, e escolher o menor dos dois mantém os alertas de
  hoje e morde se uma linha nova cair no meio. Abaixo dele a contagem sobe
  depressa — o valor mais apertado que eu medi marcaria quase um terço da base, e
  alerta assim se aprende a ignorar. O de linha impossível ficou com **uma ordem
  de grandeza de folga sobre a maior linha legítima da base**, e não no valor
  altíssimo que eu tinha proposto no exemplo: alto demais só pega o absurdo, e
  fórmula errada em embarque pequeno passaria por baixo.
- **Previsão fora do total**, e aéreo **fora do indicador por contêiner e dentro
  do total do módulo**.
- **`containerPortoMes` não é criada**, com o motivo escrito na §10.2 no molde do
  que foi feito com `municipio`: é contador agregado, que a §10.1.5 proíbe.
- **A tabela de contêineres por porto da aba de resumo fica de fora** — outra base
  de data, e o total dela embute a contagem derivada dos agentes sem detalhe.
- **O módulo não tem ano-base.** Diferente de viagens (§7.0): ele cobre uma série
  contínua que atravessa três anos civis, dois deles parciais, e o escopo de
  recarga é agente e bloco, nunca ano (§8.4).

**A previsão parou de depender de uma ausência ambígua, e essa foi a correção
mais importante da etapa**

A derivação que estava escrita marcava como previsão quem não tivesse partida
efetiva. Ela reproduz exatamente a classificação da própria origem — e **erra em
seis de oito**, porque a coluna de partida é de navio: no frete aéreo ela nunca é
preenchida, por construção. Metade dos marcados eram aéreos que já tinham
chegado, com data de chegada registrada.

> **Ausência de coluna significa coisas diferentes em cada modal, e por isso não
> serve de prova.** O pedido do Gustavo foi direto: declarar o modal em vez de
> depender do vazio. O conserto que saiu disso é melhor que o pedido, porque não
> usa ausência nenhuma para decidir o que sai do total.

Ficaram **três graus, e só o primeiro sai do total**: sem itinerário nenhum — sem
data, sem porto, só a reserva e o CO₂ lançado — é previsão, e é conclusivo sem
olhar o modal, porque não há coluna a interpretar. Itinerário com data prevista e
nenhuma data de fato vira **alerta próprio e continua no total**: pode ter partido
e não ter sido lançado, e descartar emissão real por falta de digitação é erro
maior que incluir uma previsão. É nesse grau que o modal é declarado, porque a
força da prova difere — no marítimo há três colunas de fato possíveis, no aéreo há
uma só.

**Dois defeitos de leitura, e os dois eram de forma**

- **Uma aba de template estava sendo lida como detalhe.** O sistema de origem
  guarda a configuração de ordenação numa aba cuja primeira célula é o nome do
  campo identificador — rótulo, não cabeçalho. A regra que localiza o cabeçalho
  pelo conteúdo mordia nela e produzia um bloco fantasma, com linhas cujos
  identificadores eram nomes de campo. Nenhuma virava documento, mas todas viravam
  **recusa declarada num bloco falso dentro da conferência de cobertura** — ruído
  exatamente onde a conferência precisa ser lida com atenção. A correção continua
  sendo por forma e não por lista de nomes de aba: além do identificador, a aba
  precisa trazer um mínimo de outras colunas conhecidas. Uma aba de detalhe traz
  duas dezenas; a de template trazia três. Template novo nasce ignorado e agente
  novo nasce lido, que era a propriedade que a regra original buscava.
- **A tela de método lia uma variável de ambiente que já tinha sido removida.** A
  base de data virou constante no código, e a tela continuava perguntando ao
  ambiente — declararia "não definida" justamente a escolha que mais muda o número
  do módulo. **A decisão do Gustavo foi fonte única:** a tela passa a ler a
  constante. Reintroduzir a variável daria duas fontes para a mesma decisão, e é
  assim que uma delas envelhece sem a outra.

#### 2026-09-18 — No celular nada rola de lado: o que não cabe muda de forma

Reportado depois da correção anterior: no telefone ainda era preciso **arrastar a
tela para ver o mapa**, e arrastando o cabeçalho ficava cortado. O pedido veio
como regra, e é ela que governa esta entrada:

> **Tudo tem de estar visível a partir do momento em que a tela é acessada.**

**Isso derruba a premissa da etapa anterior.** Lá eu troquei *encolher* por
*rolar de lado*, tratando as duas como as únicas saídas. São três, e só a
terceira serve num telefone:

| | o que acontece | serve no celular? |
|---|---|---|
| Encolher | o texto encolhe junto — rótulo de mês a 6,7px | não |
| Rolar de lado | o conteúdo existe fora do quadro | **não** |
| **Mudar de forma** | o mesmo dado, em outro arranjo | sim |

E rolar de lado era pior do que eu tinha medido: nas tabelas de cinco colunas,
**período e emissão nasciam fora da tela**. Numa tabela de emissão, esconder a
emissão por padrão é o pior corte possível, e exigir arrasto para chegar nela é
pior ainda.

**O que mudou de forma**

- **A tabela vira lista.** Abaixo de 640px cada linha é um bloco e cada célula um
  par rótulo–valor; o cabeçalho some e o rótulo da coluna passa a vir colado ao
  valor, de `data-rotulo`. **Nada é escondido** — o que era coluna virou linha. A
  primeira célula, que nomeia a linha, fica sozinha em destaque.
- **O mapa perde o que não se lê.** Na largura do telefone o nome de cada ponto
  sairia com pouco mais de quatro pixels e o inserto com três — sujeira, não
  texto. Os dois somem, o traçado fica, **e a legenda declara o que sumiu**, com
  a frase aparecendo só nessa largura.
- **O gráfico de barras perde o valor no topo.** Doze meses dividem 26px cada; os
  números sairiam encavalados. Barra e rótulo do mês ficam.
- **O piso de largura do `Rolavel` passou a valer só a partir de `sm`.** Abaixo
  disso ele é zero e não há o que rolar.

**Medido, antes e depois, num aparelho de 390px**

| | antes | depois |
|---|---|---|
| Página rola de lado | sim | **não** (390 = 390) |
| Algum bloco rola de lado | sim | **não** |
| Mapa visível | 57% | **inteiro** |
| Tabelas visíveis | 62% | **inteiro** |
| Altura da página | 3666px | 4723px |

**O preço, aceito e declarado: a página ficou ~29% mais alta.** Tabela empilhada
gasta altura, e é a troca que a regra pede — rolar para baixo é o gesto natural
do telefone; rolar para o lado dentro de uma página que rola para baixo não é.

Conferido também que **nada disso alcança o desktop**: a 640px a tabela já volta
a ser tabela, e a 1366 o cabeçalho está de volta, os rótulos do mapa também, e os
blocos voltam a ter piso e a rolar por dentro quando a coluna é estreita.

**Como foi medido, e o que isso destravou**

A rota temporária foi a virada: uma página que desenha a árvore de Viagens com os
**componentes reais e dados inventados do zero**, sem tocar em Firestore e sem
exigir sessão, servida pelo servidor de desenvolvimento que já estava no ar. Com
ela deu para medir caixa renderizada em várias larguras sem a sessão de ninguém —
que era a limitação registrada nas duas entradas anteriores. A rota entrou no
`.gitignore` **antes** de existir e foi apagada no fim, com o `.gitignore`
voltando ao que era.

> **A lição desta sequência inteira, em uma linha:** as três rodadas de erro
> saíram de deduzir layout em vez de medir. Layout não é aritmética — depende de
> min-content, de ordem de media query e do que o navegador faz com uma tabela.
> **Enquanto não havia como medir, cada correção era um palpite informado**, e
> palpite informado acerta a causa com a frequência que este log registra.

**Validação**

- `tsc --noEmit`, `npm test` (228 testes, 2 novos) e `next build` passam. Nenhum
  servidor foi subido por mim; usei o que já estava no ar.
- Sem vazamento e sem rolagem lateral em **360 e 390**; comportamento de desktop
  intacto em **640 e 1366**.
- As duas guardas novas foram conferidas desligando cada uma: tirar o rótulo de
  uma célula numérica reprova, nomeando a célula; tirar o mínimo de uma grade
  reprova, nomeando o arquivo.


#### 2026-09-18 — A rolagem que nunca rolou: o mínimo do item alargando a grade

Reportado ao testar no celular e num notebook: a tela de Viagens ruim e **a
página inteira precisando ser arrastada de lado** — exatamente o defeito que a
rolagem por bloco da etapa anterior existia para impedir.

**O envoltório de rolagem não falhou em rolar: ele nunca precisou rolar.** O
mínimo automático de um item de grade é o min-content dele, e um item que contém
algo com largura mínima declarada arrasta esse mínimo para a coluna. A coluna
cresce, a grade passa do contêiner, e o que deveria rolar por dentro passa a
caber — porque tudo em volta cedeu.

Medido num aparelho de 390px, antes e depois de `min-width: 0` no item:

| | antes | depois |
|---|---|---|
| Largura rolável da página | **640px** (viewport 390) | 390px |
| Largura do painel | **622px** | 354px |
| Envoltório de rolagem | não rolava | 352 visíveis para 620 de conteúdo |

**`grid-cols-1` não resolve, e testar isso foi o que fechou o diagnóstico.** O
problema é o mínimo do item, não o número de colunas — três variantes foram
medidas lado a lado na mesma página, e só a do `min-width` mudou alguma coisa.
Todas as grades passaram a zerar o mínimo dos próprios itens.

**Por que a etapa anterior não pegou isto.** Ela mediu o que é aritmética —
escala de `viewBox`, tamanho efetivo de texto, altura de alvo de toque — e
deduziu o resto. **Largura resolvida por grade não é aritmética: depende de
min-content, que depende do conteúdo.** A dedução dizia que um contêiner de
rolagem contém o que está dentro dele, e isso é verdade **só quando a largura de
quem contém é definida**. Dentro de uma coluna que se ajusta ao conteúdo, o
contêiner de rolagem vira o que empurra.

> **A lição, e ela é da mesma família das outras deste log.** Coerência interna
> — o envoltório está lá, a classe é emitida, o mínimo é o certo — passava em
> tudo. O que faltava era medir o resultado, e o resultado é layout: só existe
> com navegador fazendo layout.

**Como foi medido, já que layout não sai de typecheck nem de teste**

A etapa anterior registrou que o navegador embutido não executa script em arquivo
local, o que deixava caixa renderizada fora de alcance. A saída foi servir a
reprodução **pelo próprio servidor de desenvolvimento que o Gustavo já tinha no
ar**: um arquivo estático com a folha de estilo construída embutida e a mesma
árvore de classes, servido por HTTP em vez de `file://` — e aí o script roda e a
caixa se mede. A reprodução e o arquivo servido foram removidos em seguida.

Uma tentativa antes dessa não valeu e vale registrar: o mesmo arquivo aberto como
`file://` carregou **sem estilo nenhum**, porque a política do painel bloqueia
folha externa. Embutir o CSS resolveu a aparência, mas continuou sem script — foi
o HTTP que destravou a medição.

**Validação**

- `tsc --noEmit`, `npm test` (227 testes, 1 novo) e `next build` passam. Nenhum
  servidor foi subido por mim; usei o que já estava no ar.
- Sem vazamento em **360, 390, 753, 1280 e 1366px** — `scrollWidth` igual ao
  viewport em todas, e os blocos rolando por dentro onde precisam.
- A guarda nova foi conferida desligando-a: tirar o mínimo de uma grade reprova,
  nomeando o arquivo e a string de classes.


#### 2026-09-18 — Entrar pelo IP da máquina: origem bloqueada e falhas mudas

Surgiu ao tentar abrir o sistema pelo IP da máquina — que é o que permite conferir
o layout num celular de verdade, e a única forma de exercitar o que emulação de
dispositivo não reproduz. O botão de entrar não fazia nada.

**A causa não era autenticação, e levou três rodadas para aparecer.** O Next
recusa servir os recursos de desenvolvimento (`/_next/*`) para origem que não
esteja em `allowedDevOrigins`. Com isso **o JavaScript não carregava, a página
não hidratava e a tela virava HTML inerte**: o clique não chegava a executar
nada. Firebase, domínio autorizado e popup nunca foram exercitados — o que
parecia falha de login era ausência de aplicação.

> **O sintoma não se parece nada com a causa**, e é o que torna este caso digno
> de registro: botão que não responde, sem erro em lugar nenhum, com o servidor
> servindo a página normalmente e o mesmo botão funcionando em `localhost`.

**A variável é de ambiente, não constante.** É IP de máquina, e IP de máquina
versionado é a mesma classe de erro da coordenada da fábrica (§2.1): entra como
constante, segue no repositório público e deixa de valer no dia em que o roteador
entrega outro endereço. `DEV_ORIGENS_PERMITIDAS` entrou no `.env.example` vazia,
**com o sintoma descrito ao lado** — porque ninguém deveria precisar descobrir
duas vezes que "botão inerte" quer dizer "origem bloqueada". Vale só em
desenvolvimento; em produção o Next ignora.

**Dois defeitos meus, achados no caminho, que transformavam qualquer falha de
entrada em silêncio**

- **`authWeb()` estava fora do `try`.** Ele lança quando falta configuração, e
  ali a rejeição escapava da função inteira: o React não espera o `onClick`,
  então o `finally` nunca rodava. O botão travava em "Entrando…", sem mensagem na
  tela e sem nada no console. **Falha silenciosa num botão é o pior lugar para
  ela estar** — e enquanto ela existiu, nenhuma melhoria de mensagem era sequer
  alcançada.
- **Popup que fecha sozinho se passava por desistência.** `popup-closed-by-user`
  era silenciado de propósito, porque fechar a janela é desistir, não falhar — só
  que um popup recusado pela origem fecha sozinho e chega pelo mesmo código.
  Calados, os dois casos ficam idênticos: clicar e não acontecer nada. **O que os
  separa é o relógio**, e ninguém lê a lista de contas do Google e desiste em
  menos de dois segundos.

**E as falhas do SDK deixaram de cair na mensagem genérica.** A generalidade do
lado do servidor é deliberada e continua: não distinguir token inválido de
expirado nega pista a quem está adivinhando. As do SDK são outra coisa — vêm do
navegador de quem clicou, já estão no console dele e não dependem de quem é a
pessoa. Domínio não autorizado, popup bloqueado e ambiente sem suporte passaram a
ser ditos pelo nome; o resto leva o código entre parênteses, porque **quem abre o
sistema num celular não tem console para abrir**.

**Duas lições de diagnóstico, e as duas são minhas**

> **Sintoma descartado como ruído era o mesmo defeito por outra porta.** Na
> primeira vez que o console foi colado, o WebSocket de hot reload aparecia
> falhando e eu disse que não tinha relação com o login. Era o mesmo bloqueio de
> origem, visto do outro lado. Três rodadas foram gastas no Firebase por causa
> dessa frase.

> **Passo de operação que eu passo adiante não é passo executado.** Dei um
> comando de shell para acrescentar a variável e segui assumindo que tinha
> rodado. O que resolveu foi **conferir o estado em vez de confiar no passo**: um
> ensaio temporário carregou o ambiente como o Next carrega, importou o
> `next.config.ts` e imprimiu o que de fato chegava lá — e a resposta foi que a
> variável não existia. Era para eu ter medido na primeira vez.

**Validação**

- `tsc --noEmit`, `npm test` (226 testes) e `next build` passam. Nenhum servidor
  de desenvolvimento foi subido por mim; quem sobe e derruba é o Gustavo.
- O caminho de configuração foi conferido por ensaio temporário, apagado em
  seguida: carregar o ambiente, importar o config e imprimir o que chega —
  primeiro acusando a ausência, depois confirmando o valor.
- Entrada pelo IP confirmada funcionando pelo Gustavo.


#### 2026-09-18 — Largura, altura e celular: a casca deixa de ser a medida

Ajuste fino de layout, em três passos com revisão entre cada um. Nenhuma mudança
na camada de consulta, em número ou em conteúdo — com uma exceção de duas
palavras, declarada no fim.

**O defeito que abriu a etapa, e a comparação que ele exigia.** O conteúdo tinha
largura máxima fixa e ficava ancorado à esquerda: num monitor de 1920 sobrava
508px de branco à direita, num de 2560 sobrava 1148. A primeira coisa pedida foi
comparar com o protótipo — e a comparação deu **divergência zero**. O protótipo
faz exatamente isso, `max-width` sem `margin: 0 auto`, e o código o copiava
fielmente. Não era a omissão de 16/09; era limitação herdada, e corrigi-la é
divergir do protótipo de propósito, que a §0 autoriza.

> **A casca é contêiner, não medida.** Ela cresce com a tela; quem declara
> limite é cada peça, pelo motivo dela. Teto na casca seria um número arbitrário
> que devolveria o mesmo branco um monitor adiante.

**O inventário do que fica sem medida foi exigido antes de aplicar**, com a
conclusão escrita para cada peça, e foi ele que mudou o desenho da solução:

- **Cartões:** não precisam de medida, e dar medida à nota pioraria. O cartão não
  abre vazio — a nota reflui e ele encolhe em altura. É a única prosa do sistema
  sem medida de leitura, e a exceção está escrita onde mora: **prosa dentro de
  uma caixa que já é o limite.**
- **Tabelas:** a maior ganhadora até ~1920 e a pior infratora acima disso. A
  distribuição de excedente em `table-layout: auto` é definida pelo navegador,
  não pelo CSS — o único número do levantamento que não dá para derivar.
- **Gráfico de barras:** **eu tinha dito que não precisava de teto, e estava
  errado.** `montarBarras` decide rarear rótulo e mostrar valor **só pelo número
  de barras**, nunca pela largura renderizada — então largura a mais não
  acrescenta nada, só multiplica, texto incluído.
- **Grades:** não têm largura intrínseca e não produzem branco; entregam largura
  aos filhos. O que elas decidem é a razão, e é a razão que quebra em tela larga.

**O que entrou no passo 1.** A casca perdeu o teto e ganhou um degrau de respiro
acima de `xl`. O sistema de medidas de leitura — 62ch para descrição, 70ch para
legenda, 80ch para nota e fecho — **já existia pela metade** e foi completado:
faltava na `Nota`, na legenda do radar, no `Vazio` e na faixa de aviso do Método.
Nas caixas que sinalizam **estado** — vazio, pendência, erro — a caixa mantém a
largura inteira e o texto dentro é que leva a medida: caixa encolhida faz a
ausência parecer menor.

Mapa e radar ganharam teto no tamanho em que já eram desenhados, **e é por isso
que os números não são redondos**: o inserto, o recuo do rótulo e o limiar de
colisão medidos em 16/09 e 18/09 foram calibrados nessa escala, e mudá-la
reabriria aquela validação por causa de largura de monitor.

> **A primeira tentativa centrou o desenho e ficou pior, e o motivo vale
> guardar.** O painel passou a ter três alinhamentos: título na borda, desenho
> duzentos pixels adentro, legenda de volta na borda. **Figura deslocada em
> relação ao texto dela não é branco simétrico, é desalinho.** O teto passou do
> desenho para o bloco inteiro — desenho e legenda —, à esquerda. Conferido pelo
> `git diff` ignorando espaço: **nada dentro do `<svg>` mudou.**

**Passo 2: a borda encosta no conteúdo, sempre.** Item de grade estica por
padrão, e a esticada é branco dentro de uma caixa branca com borda — que **não se
lê como "este painel é pequeno", lê-se como dado faltando**. Na Mobilidade a
diferença chegava a ~344px, medidos no screenshot e previstos em 328 pelo modelo
de altura: foi a validação do modelo que permitiu prever o resto.

> **A regra vale inclusive para a linha de cartões, e isso reverteu a minha
> recomendação.** Eu queria manter altura igual entre cartões. O argumento que
> venceu é do Gustavo e é mais forte: **o conteúdo do cartão é estático**, então
> altura igual comprada com um gap grande num cartão pequeno paga um preço certo
> por um risco que não existe.

**E então o branco migrou para dentro dos painéis, que era exatamente a
preocupação levantada antes de aplicar.** A causa é aritmética e não se resolve
com proporção: as peças daquela linha têm largura natural — teto de desenho — e
a linha tem muito mais que a soma delas. **Excedente estrutural resolve-se com
uma coluna a mais, não com outra razão.** As duas telas ganharam colocação
explícita no `xl`, sem duplicar painel no DOM com `hidden`: painel duplicado é
conteúdo duplicado para leitor de tela, animação rodando duas vezes e duas cópias
para envelhecerem em desacordo.

| Tela | até `lg` | no `xl` |
|---|---|---|
| Mobilidade | radar \| gráfico, depois cidade \| bairro | radar \| [gráfico + cidade] \| bairro |
| Viagens | mapa inteiro, destinos \| pilha, rotas inteiro | mapa \| pilha, destinos \| rotas |

Na coluna de 1,55fr o painel do mapa tem 1008px úteis contra um teto de 1056: o
desenho **preenche a coluna sem sobra**. Acima de ~1800px de conteúdo o teto
volta a morder — declarado no código, não descoberto depois.

**Passo 3: `viewBox` erra para os dois lados.** No passo 1 o perigo era ampliar;
no celular é o contrário, e é pior, porque **o que encolhe é o texto**. Medido:

| Desenho, num aparelho de 360px | antes | depois |
|---|---|---|
| Série mensal — rótulo do mês | **6,7px** | 9,0px |
| Série mensal — espaço por barra (doze meses) | **23,3px** | 31,5px |
| Mapa — rótulo de região | **4,2px** | 8,6px |
| Mapa — rótulo dentro do inserto | **3,3px** | 6,8px |
| Tabela de cinco colunas — orçamento por coluna | **56px** | 104px |

Texto de 3,3px não é texto pequeno: é sujeira no desenho. E a tabela de cinco
colunas não cabia — ela estourava o painel e **fazia a página inteira rolar de
lado**, que é o defeito que se sente e não se localiza.

A correção é uma peça só: **abaixo de uma largura mínima, o bloco rola em vez de
encolher.** Com o teto do passo 1, cada desenho passa a viver **entre 0,9× e
1,25× da própria escala** — nunca menor, nunca maior. A sangria lateral existe
para a rolagem não parecer corte: sem ela o conteúdo some no meio de uma margem
branca, como se estivesse quebrado.

**O radar ficou de fora do piso, de propósito:** são quatro rótulos e a legenda
carrega o significado, então ele degrada bem onde os outros viram sujeira.

**Registrar viagem foi tratada como prioridade, por ser a única tela que alguém
de fora da equipe abre — e abre no telefone.** Dois ajustes valendo só abaixo de
640px, sem tocar na densidade do desktop:

| | antes | depois |
|---|---|---|
| Opção do autocomplete (aeroporto e município) | **32,2px** | 44,2px |
| Botão fraco — adicionar trecho, parada, remover | **33,4px** | 45,4px |
| Campo de texto e de data | **38,9px** | 50,8px |
| Botão de enviar | 40,9px | 48,9px |
| Pílula do seletor de ano | **32,2px** | 44,2px |

E o campo passou a 16px no celular, que **não é preferência de tamanho**: abaixo
disso o Safari do iPhone amplia a página ao focar o campo, e o layout salta sob o
dedo de quem está preenchendo. A opção do autocomplete era o pior alvo e é a
interação central da tela — oito opções empilhadas para escolher um lugar, onde
errar a opção é escolher o lugar errado.

**Decisões que não estavam no documento**

- **Onde a prosa NÃO leva medida**, e por quê: dentro de uma caixa que já é o
  limite. Vale só para a nota do cartão.
- **Caixa de estado mantém a largura; o texto dentro é que tem medida.**
- **Piso e teto são fator, não pixel, no gráfico de barras** — quem chama escolhe
  o `viewBox`, e os dois usos têm larguras diferentes.
- **O fator do teto é maior que 1 de propósito**: a série mensal estava pequena
  demais, e largura era o que faltava a ela.

**Validação**

- `tsc --noEmit`, `npm test` (226 testes, 6 novos) e `next build` passam. Nenhum
  servidor de desenvolvimento foi subido.
- **As seis guardas novas foram conferidas desligando cada uma** — teto de volta
  na casca, medida fora da legenda e da peça compartilhada, `items-start` fora de
  uma grade, piso fora do gráfico, rolagem fora de uma tabela. As seis reprovam,
  e as que varrem arquivo **nomeiam o arquivo e a string exata**. Guarda que não
  morde não é guarda.
- Uma delas reprovou por estar desatualizada, e a reprovação foi correta: ela
  conferia `maxWidth` literal, e o teto do gráfico passou a ir pelo envoltório de
  rolagem. Passou a conferir o conceito, não a escrita.
- **O CSS construído foi conferido classe a classe.** O Tailwind só emite o que
  encontra no fonte, então classe montada dentro de uma constante pode virar
  classe morta sem erro nenhum — as doze saem. Conferida também a **ordem das
  media queries**: `lg` antes de `xl`, que é o que faz a colocação do `xl`
  desfazer o `col-span` do `lg`. Invertida, o mapa continuaria atravessando as
  duas colunas e o layout estaria errado em silêncio.
- A geometria dos desenhos foi medida por ensaio temporário, apagado em seguida:
  é ela que produziu as duas tabelas de números acima.
- **O que não foi medido, e por quê:** o navegador embutido não executa script em
  arquivo local (CSP `script-src 'none'`), então caixa renderizada — quebra de
  texto, distribuição de coluna em `table-layout: auto` — não dá para medir por
  aqui. A conferência dessas veio de screenshot do Gustavo com a proporção da
  grade servindo de régua, e da leitura dele na tela.

**Uma mudança de conteúdo, de duas palavras.** A descrição do mapa de Viagens
dizia "unidade mais grossa que a da **tabela ao lado**". A tabela não estava ao
lado nem antes — o mapa era largura inteira e a tabela vinha na linha de baixo —,
então a frase já apontava para o lugar errado. Virou "que a das **tabelas
abaixo**". É a mesma família dos defeitos que este log vem pegando: tela
declarando um arranjo que ela não tem.


#### 2026-09-18 — Mapa na tela de Emissões registradas

Pedido do Gustavo, a partir da pergunta "dá para fazer um mapa igual o de Viagens?".
Dá, e a resposta curta teria sido pior que a longa: **"igual" era o alvo errado
para esta tela**, e foram duas decisões dele antes de qualquer linha.

**Por que não igual.** O mapa de Viagens agrega por região porque voo cruza
região e são centenas de trechos — uma linha por par de aeroportos vira
emaranhado. Um carro Curitiba → São José dos Pinhais fica *dentro* do Sul e
viraria um anel sobre um ponto só. Medido nos registros existentes: a maior parte
da emissão era aérea e desenhável, o restante era rodoviário e não teria lugar. E
numa fábrica em Curitiba o carro é o caso cotidiano, então com o tempo o mapa
desenharia a minoria e declararia a maioria.

**A segunda decisão apareceu depois da primeira, e vale registrar por quê.** O
Gustavo escolheu "aéreo por região + carro por município" de uma lista que eu
escrevi — e ao montar o dado ficou claro que a agregação do aéreo não tem função
aqui: **não há supressão a satisfazer** (§3.2, o programa é identificado por
desenho) **nem volume que peça agregação**. Pior, o ponto "Sul" cairia ao lado do
ponto "Curitiba/PR", duas escalas com a mesma aparência. Perguntei de novo em vez
de construir o que a primeira pergunta tinha enquadrado mal, e a unidade ficou
sendo **o lugar de verdade nos dois modais**.

**Coordenada de município: a decisão de 18/09 vale, e não foi revertida.** Lá a
lista nasceu sem coordenada porque o **roteamento** resolve melhor pelo nome com
a UF. Desenhar é outro uso, com outra precisão: o centro do município é
exatamente o que um ponto num mapa do país quer. O roteamento continua mandando
nome e UF. As duas coisas convivem, e o gerador diz isso no cabeçalho.

**O gerador de municípios, e as duas vezes que a guarda mordeu**

O centroide vem das malhas territoriais do IBGE, uma requisição por UF — 27, e
não uma por município, que é a diferença entre um gerador que roda e um que
ninguém roda duas vezes. É calculado pela **fórmula do polígono, não pela média
dos vértices**: a média puxa o ponto para onde o contorno tem mais detalhe, e um
litoral recortado deslocaria a cidade para o mar.

> **As duas guardas que escrevi reprovaram, e cada uma por um motivo diferente —
> uma estava errada, a outra estava certa.**
>
> A primeira exigia que o ponto caísse numa caixa do território brasileiro, e
> reprovou Fernando de Noronha: **a caixa é que estava colada no continente**, e
> as ilhas oceânicas são território com município. A caixa foi alargada.
>
> A segunda exigia centroide para todo município, e reprovou um município de
> criação recente — o IBGE o publica no cadastro de localidades antes de refazer
> a malha. Aqui a guarda estava certa sobre o fato e errada sobre a consequência:
> **ausência de ponto é fato a declarar, não carga a derrubar.** Virou campo
> nulo, com aviso na geração, com o lugar continuando escolhível e roteável, e
> com a tela declarando o que não pôde desenhar. Uma fração grande de ausências
> continua derrubando, porque aí não é município novo — é malha trocada.

**A peça de desenho saiu da pasta de Viagens**

Compartilhar desenho é legítimo e compartilhar dado não é (§7.5). O componente
estava amarrado ao tipo da consulta do inventário, e a tela do programa
importando aquilo faria o teste da §0.1 morder — com razão. O tipo do desenho
passou a morar em `src/lib/mapa.ts`, neutro: um lugar tem chave, rótulo,
coordenada e `domestico`, e este último vem **declarado, não deduzido do
rótulo** — reconhecer país pelo texto seria uma lista de nomes escrita dentro do
desenho.

Aproveitei para consertar um deslize meu da etapa anterior: a tela de Emissões
registradas reusava o gráfico mensal de dentro da pasta de Viagens. Ele subiu
junto.

**Um defeito que só apareceu com dado real, e que é conceitual**

Renderizando o mapa e medindo a posição dos rótulos, **"Curitiba" e "Curitiba/PR"
caíam a menos de vinte pixels um do outro** — o aeroporto de Curitiba e o
município de Curitiba desenhados como dois pontos. Não é problema de espaço: **é
o mesmo lugar**, e o mapa estava dizendo que se foi a dois.

A identidade do lugar passou a ser **cidade e UF**, não o código. Onde a UF não
existe — aeroporto estrangeiro — a chave cai no próprio código: o pior caso vira
o comportamento anterior, dois pontos separados, que é feio e não é errado.
Juntar lugares distintos seria o contrário, e é por isso que a junção exige as
duas partes.

Consequência aceita: um voo e um trajeto de carro entre as mesmas duas cidades
viram **uma linha**. O mapa responde "para onde se foi", e a divisão por modal
mora no painel ao lado.

**Validação**

- `tsc --noEmit`, `npm test` (220 testes, 6 novos) e `next build` passam. Nenhum
  servidor de desenvolvimento foi subido.
- **O mapa do inventário não mudou, e isso foi provado, não suposto.** Os dois
  componentes — o de antes da refatoração, tirado do próprio histórico, e o de
  agora — foram renderizados contra o banco carregado e a geometria comparada
  elemento a elemento: **95 elementos, nenhum diferente.**
- A guarda nova do desenho compartilhado foi conferida ligando a violação:
  bastou o componente importar o tipo de uma das consultas para ela reprovar.
- Conferido contra o banco com ensaio temporário, apagado em seguida: as duas
  ligações registradas saem com o lugar certo em cada ponta, desenhado mais não
  desenhado fecha com o total da tela, nenhum ponto cai fora da moldura, nenhuma
  coordenada sai inválida, nenhum rótulo colide e nenhum identificador de pessoa
  sai no mapa.
- Os testes novos cobrem o que quebra: os dois modais no mesmo mapa, ida e volta
  como uma linha só, trajeto que volta ao ponto de partida virando anel, lugar
  sem coordenada declarado e continuando no total, a fusão do aeroporto com o
  município da mesma cidade, e o aeroporto sem UF que **não** se funde com
  ninguém.
- Uma medição minha deu alarme falso no caminho: o limiar de colisão calibrado
  para a moldura grande acusou sobreposição dentro do inserto, que tem um terço
  da largura. Medido de novo pela caixa real do texto, não havia sobreposição
  nenhuma — e o mapa do inventário já era assim antes.


#### 2026-09-18 — O módulo de viagens fechado, e o programa saindo do papel

Duas frentes, na ordem pedida: varredura do que sobrou do inventário de viagens, e
depois as duas telas do programa.

**A varredura achou sete coisas, e nenhuma era erro de conta.** Os números fechavam
em todas. O que havia era promessa que a tela ou a especificação faziam e o código
não cumpria — e o inverso.

> **A premissa apagada deixa rastro em texto, não só em código.** A §0.1 saiu do
> §7 em 16/09, mas a tela de Método continuava declarando que o acréscimo sobre a
> ortodrômica é aplicado "no formulário". O formulário não é fonte deste módulo
> desde aquele dia; quem calcula distância do zero é a **planilha do cartão**, que
> a frase não mencionava. A tela declarava um caminho que o módulo não tem e
> omitia o que ele tem — parente próximo do defeito da subtração, e igualmente
> invisível em typecheck, teste e build.

As outras seis:

- **Duas das três declarações que a §7 exige da planilha do cartão não existiam.**
  A data valer para o bloco inteiro — que muda a série mensal, porque um trecho de
  volta pode cair no mês seguinte e ser contado no anterior — aparecia só como
  contagem de alerta, sem dizer o que o alerta significa. E o viajante vir só pelo
  primeiro nome não aparecia de forma nenhuma. As duas entraram como parâmetro
  declarado.
- **A §7 e o código discordavam sobre viajante sem correspondência.** O texto
  mandava criar registro próprio com alerta; o código para a carga e diz quem
  falta, decisão tomada em 15/09 depois de uma companhia aérea virar funcionário.
  **Decisão do Gustavo: o código vence**, e a §7 foi corrigida com o motivo —
  criar pessoa a partir de planilha infla justamente a contagem que sustenta a
  supressão da mobilidade e o denominador de adesão do programa.
- **O mapa desenha só aéreo, e a tela tinha deixado de dizer isso.** O comentário
  da camada afirmava "a tela declara o recorte"; a tela não declarava, e
  `co2KgDesenhado` e `co2KgAereo` eram calculados, testados e nunca exibidos. Hoje
  é invisível, porque nenhuma das duas fontes administrativas traz carro — e é
  isso que torna o caso perigoso: **o primeiro trecho rodoviário faria o mapa somar
  menos que o total sem uma palavra**, e mapa menor que o número é lido como falha
  de carga. A camada passou a expor a emissão não aérea e a legenda a declara.
- **A tela não dizia qual ano ela relata.** A §7.0 faz do ano-base a identidade do
  relatório, e o seletor se esconde sozinho abaixo de dois anos: com um ano
  carregado, o ano existia só na tela de Método. Onde o seletor não aparece, a
  tela agora diz "Relatório de ‹ano›".
- **Nenhum teste mordia a fronteira da §0.1.** A separação estava guardada em três
  pontos — validação de escrita, conferência e cobertura —, e nenhum deles
  respondia "a consulta do inventário lê a coleção do programa?".
- Menor, sem consequência de número: `co2ToneladasAno` carregava "Ano" no nome num
  valor que pode cobrir vários anos. Passou a `co2Toneladas` em viagens e marítimo;
  na mobilidade o nome continua certo, porque lá o valor **é** anual.

**As decisões do Gustavo, que o documento deixava em aberto**

- **Denominador da adesão:** contagem sempre, proporção só com `PROGRAMA_QUADRO` no
  ambiente. Sem o parâmetro a tela declara que não há denominador, em vez de usar o
  tamanho da coleção de funcionários — que inclui quem só aparece como aprovador de
  passagem e faria a adesão nascer menor do que é, com aparência de funcionar.
- **Fechamento de período:** uma data no ambiente, fechada por script. Não existe
  tela que feche, pelo mesmo motivo por que não existe tela que conceda acesso. A
  submissão fechada continua visível, continua contando e não se apaga.
- **Classe de cabine:** perguntada, com econômica pré-selecionada. É o mesmo
  critério que já admite os três campos do carro — entra na conta. Assumir
  econômica num intercontinental de diretoria subestimaria a viagem em quase três
  vezes, e quem preenche é quem voou e sabe.
- **Fator do carro:** o da mobilidade, reaproveitado. Um carro a gasolina emite por
  quilômetro o que emite, indo trabalhar ou indo a cliente; um segundo arquivo com
  o mesmo número físico seria um que envelhece sem o outro.
- **Lista de municípios:** só o arquivo gerado e versionado. A coleção `municipio`
  da §10.2 **não** foi criada, e o documento diz por quê — duas cópias do mesmo dado
  é uma que diverge da outra em silêncio.
- **Chave do Google:** segunda chave, só para a aplicação. O código está feito; a
  configuração no console é operação e está na §14.

**Ocupantes: a decisão foi gravar o veículo, e ela precisou de uma segunda metade.**
Eu havia recomendado gravar a cota da pessoa; o Gustavo escolheu gravar a emissão do
veículo inteira, com a divisão na exibição. Implementado assim, e com a consequência
fechada: **toda atribuição a pessoa divide** — na tela do viajante e no agregado do
programa, não só numa delas. Sem isso, dois caronas registrando a mesma viagem
somariam o mesmo carro duas vezes num total que continuaria parecendo plausível. O
documento guarda o que distância e fator reproduzem; a divisão é da atribuição.

**O que entrou de código**

- `scripts/gerar-municipios.ts` e `src/lib/municipios.ts` — a lista do IBGE, no
  padrão do gerador de contorno: origem e licença no cabeçalho, resultado
  versionado e reprodutível. **Sem coordenada, de propósito:** o roteamento resolve
  o município pelo nome com a UF, que é a precisão de que se trata; coordenada
  própria seria um ponto dentro da cidade roteado como se fosse a cidade.
- `src/server/rotas.ts` — distância rodoviária com cache. **A chave é o par
  ordenado de códigos**, e não o trajeto inteiro: por trajeto, uma parada a mais
  inutilizaria tudo que já estava guardado, enquanto por par um trecho serve a toda
  viagem que passe por ele. Ordenado, não normalizado — ida e volta podem diferir, e
  fingir que não diferem seria inventar simetria.
- `registrarViagem` na camada de consulta, com o cálculo aéreo e o rodoviário. A
  regravação usa o mesmo mecanismo da carga (§10.9), com escopo **esta viagem desta
  pessoa** — é também o que impede editar submissão alheia, porque o uid entra no
  filtro e no identificador.
- `limitesDeFaixa` saiu de dentro da carga do cartão para `src/server/fatores.ts`.
  Os dois caminhos que calculam distância do zero precisam dela, e duas cópias da
  mesma função é uma que envelhece sem a outra. **É a matemática compartilhada da
  §7.5** — o que não se compartilha é o dado.
- As três telas do programa, a ação de servidor que as escreve e a busca de
  município. A escrita passa pela camada: nenhuma tela alcança o banco por fora
  dela, e a guarda de porta única continua valendo para o caminho de escrita.

**Decisões minhas, que não estavam no documento**

- **O identificador da submissão é derivado do conteúdo** — quem registrou, trajeto
  e datas. Dá de graça a proteção que mais falta num formulário: reenviar a mesma
  viagem grava uma, em vez de dobrar a emissão de alguém por um clique repetido.
- **A busca de município é uma rota, e não uma lista mandada ao navegador.** São
  mais de cinco mil registros, e nenhum formulário precisa carregá-los todos para
  oferecer doze. O aeroporto faz o contrário, e pelo mesmo raciocínio: são poucas
  dezenas, e mandá-los de uma vez custa menos que uma ida ao servidor por tecla. A
  rota **exige sessão mesmo sendo dado público** — abrir uma exceção por
  conveniência é como se começa a ter exceções.
- **A chamada ao provedor acontece no envio, nunca enquanto alguém digita.** É a
  diferença entre um formulário e uma conta a pagar.

**Validação**

- `tsc --noEmit`, `npm test` (214 testes, 13 novos) e `next build` passam. Nenhum
  servidor de desenvolvimento foi subido.
- **A fronteira da §0.1 tem teste dos dois lados**, estático e executável, e foi
  conferida **ligando a mistura**: com a consulta do inventário lendo a coleção do
  programa, com a do programa lendo a do inventário e com uma tela de inventário
  importando o módulo do outro lado, **quatro conferências reprovam**. Guarda que
  não morde não é guarda.

  > Uma delas só passou a morder depois de afiada, e o motivo vale guardar. As
  > asserções sobre o total não pegavam a leitura indevida, porque o total do
  > inventário filtra por `contabilizar` — campo que a coleção do programa não tem.
  > Um documento do programa lido por engano cairia nesse filtro e **somaria zero**:
  > o erro existiria e não apareceria em número nenhum. A asserção passou a ser
  > sobre os documentos lidos antes do filtro.

- As regras dos ocupantes e do denominador também foram conferidas desligando cada
  uma: sem a divisão, duas das conferências reprovam; com o denominador de volta na
  coleção de funcionários, outras duas.
- Exercitado contra o Firestore carregado, com ensaio temporário apagado em
  seguida: viagem aérea de ida e volta, viagem de carro com parada e retorno à
  origem, e reenvio da mesma viagem. **O multiplicador de classe sai exato** entre
  executiva e econômica, a divisão pelos ocupantes sai exata, a distância
  rodoviária é compatível com o trajeto, o reenvio não duplica, a soma das viagens
  fecha com o total, o `gestor` não vê nome, e **o inventário não se mexeu em
  trecho, em emissão nem em contagem fora do total**. Os documentos e as rotas de
  cache do ensaio foram removidos, e a coleção voltou a zero.
- `verificar` roda e todas as conferências de viagens fecham, incluindo a da §0.1.
  **As duas que falham são do marítimo** — cobertura de blocos cujo ingest ainda não
  rodou —, e são trabalho de outra etapa; nada do marítimo foi tocado aqui.

**Operação, e não código**

- `PROGRAMA_QUADRO` e `PROGRAMA_FECHADO_ATE` entraram no `.env.example` **vazias**,
  e a guarda de placeholder plausível vigia as duas: um número plausível no primeiro
  vira proporção de adesão errada, e uma data plausível no segundo tranca submissão
  que ninguém decidiu trancar.
- `GOOGLE_ROUTES_API_KEY_APP` precisa ser criada no console do Google, restrita à
  Routes API, com teto de faturamento e alerta, e acrescentada na Vercel. Sem ela o
  formulário cai na chave das cargas — que funciona, e não é o que deve ir para
  produção.
- `/ensaio/` entrou no `.gitignore` **antes** de a pasta receber qualquer coisa
  (§2.3).


<!-- adicionar entradas abaixo -->

#### 2026-09-16 — O mar Cáspio virando fronteira, e o Brasil entrando como linha

**O contorno fantasma no meio da Ásia era um furo.** O gerador coletava todos os
anéis de cada polígono, e do segundo em diante eles são **furos** — lago e mar
interior recortados da terra. Coletado como anel comum, o furo é desenhado por
cima do continente, com contorno próprio, e se lê como fronteira de país. Era o
mar Cáspio.

O gerador passou a ficar só com o anel externo. Preencher o furo de verde é erro
menor que desenhá-lo: num mapa que já declara servir para situar e não para
medir, o lago somido não muda nada, e a forma fantasma muda a leitura.

**O primeiro teste que escrevi para isso estava errado, e foi refeito na hora.**
Ele acusava anel contido no retângulo envolvente de outro — e ilha dentro da
caixa de um continente é comum e legítima, então ele reprovava dezenas de ilhas
verdadeiras. É a armadilha já registrada em 14/09: **teste que dá alarme falso é
teste que se aprende a ignorar.** O que de fato separa furo de ilha é o **sentido
de giro**, não a posição — o GeoJSON gira o anel externo num sentido e o furo no
contrário. O teste passou a exigir que todo anel gire para o mesmo lado, e
conferido devolvendo o furo ao arquivo: **reprova, e aponta o anel certo.**

**O Brasil entrou como linha, não como área.** Pedido do Gustavo, para o país se
situar no quadro global e no inserto. Vem do mesmo pacote e da mesma licença do
contorno de terra — Natural Earth 1:110m, agora o recorte de fronteiras
nacionais —, e **só o Brasil é extraído**: trazer os outros 177 países seria
pagar o arquivo inteiro por uma linha. São 203 vértices, 3 KB.

Duas decisões de desenho, e as duas são sobre ele ser linha:

- **Constante separada no arquivo gerado.** Junto dos anéis de terra, o país
  seria pintado como um continente a mais em cima do que já está lá.
- **Não passa pelo recorte de polígono.** Recortar um traço faz aparecerem as
  arestas da moldura, e o desenho ganharia uma caixa que ninguém pediu — o `svg`,
  o de fora e o do inserto, já corta sozinho o que passa da borda.

**E as divisas das cinco regiões, no quadro que mostra o Brasil de perto.**
Decisão do Gustavo entre regiões e estados, depois da ressalva: **o mapa agrega
por região**, e vinte e sete divisas num inserto de pouco mais de duzentos pixels
convidariam a procurar um estado que não existe como recorte. A divisa desenhada
é a mesma que o cadastro do aeroporto usa para classificar, e o nome viaja junto
— é ele que faz **clicar num ponto acender o desenho da região**, ligando o
painel ao mapa em vez de deixá-lo solto embaixo.

**A origem é outra, e o gerador mudou de natureza por causa disso.** As malhas
territoriais do IBGE, na qualidade mínima: dado público, reutilizável com
atribuição, que agora está no cabeçalho do arquivo gerado e na legenda do mapa.
**É a única coisa do gerador que vem da rede** — a divisão interna do Brasil não
está em nenhum pacote já instalado. O resultado é versionado, então a rede só é
necessária para regerar. O download é por `curl`: o cliente HTTP do Node quebra a
resposta desse servidor ao decodificá-la, e a mensagem de erro diz o que fazer em
vez de devolver falha de rede solta.

**O teste do sentido de giro precisou ser corrigido junto, e o motivo vale
guardar.** Ele comparava todos os anéis entre si, e as regiões vêm do IBGE
enquanto o resto vem do Natural Earth — o sentido é convenção de quem publicou o
arquivo, e exigir o mesmo giro dos dois prenderia uma coincidência. A conferência
passou a ser **dentro de cada origem, nunca entre elas**. Foi a segunda vez nesta
etapa que um teste meu reprovava dado correto; as duas vezes, por prender uma
propriedade parecida com a certa.

**A legenda passou a abrir dizendo o que o ponto não é.** Pedido do Gustavo, e é
a mesma regra do ângulo do radar (§3.1.1): **desenho que parece mapa é lido como
mapa.** Com divisa de região no fundo, um ponto dentro do Paraná convida a
concluir que a viagem saiu de lá — e ele é a média das coordenadas dos aeroportos
que a empresa usa naquela região, não cidade, não aeroporto, não origem de
viagem. A frase vem antes de tudo na legenda porque é a primeira leitura errada
possível, não uma ressalva de rodapé.

**E a legenda foi cortada pela metade no mesmo passo.** Ela tinha crescido a cada
decisão registrada nela — enquadramento, inserto, projeção, corredor mais pesado,
duas procedências — até virar um parágrafo, e **parágrafo embaixo de desenho não
se lê**: a ressalva do ponto ia junto para o lugar onde ninguém chega. Ficou em
duas linhas, e a ordem é a leitura: primeiro a única coisa necessária para não
ler o mapa errado, depois recorte e procedência, em corpo menor. O que saiu não
era falso, era detalhe que o desenho já mostra ou que o painel da região explica.

**Validação**

- `tsc --noEmit`, `npm test` (154 testes, 3 novos) e `next build` passam. Nenhum
  servidor de desenvolvimento foi subido.
- O contorno foi regerado e o desenho conferido no SVG: o Brasil sai nos dois
  quadros, as cinco divisas saem só no inserto, a região aberta pinta, nenhuma
  coordenada inválida e nenhum anel gira ao contrário dentro da própria origem.

#### 2026-09-16 — Clicar no ponto do mapa

Pedido do Gustavo, na versão agregada: mostrar o que aconteceu em cada região,
simples, sem detalhar.

**A decisão que ficou tomada, e por quê.** A alternativa era uma linha por
viagem, com data exata. Ela não traz nome, mas deixaria de ser emissão por rota
e viraria registro de deslocamento — e a §3.1.2 diz que a tela mostra emissão
por rota, **nunca a lista**. O painel mostra, por corredor que toca a região,
**quanto, quantos e quando**.

**Sem JavaScript de cliente.** O ponto é uma âncora de SVG e o recorte vai para
o endereço, como o seletor de ano: recarregar mantém a região aberta, o endereço
pode ser enviado a outra pessoa, e o ponto continua clicável com script
bloqueado. A entrada do painel é animação de CSS, que termina no estado final de
qualquer jeito. Clicar na região já aberta fecha; o painel ganhou âncora para a
rolagem voltar ao mapa depois do salto.

**A região aberta é conferida contra o que existe.** O parâmetro chega da URL, e
URL é entrada de fora: sem a conferência, qualquer texto no endereço viraria
título de painel na tela.

**Duas contas fáceis de errar em sentidos opostos**, e a nota do painel diz as
duas:

- **Pessoa não soma entre corredores.** Quem voou por dois conta uma vez no
  total da região — somar as linhas contaria duas, que é o erro que a §10.10
  impede na agregação. Por isso a contagem sai da camada, não de uma soma feita
  na tela.
- **Trecho entre duas regiões conta nas duas.** É o deslocamento que tocou
  aquele lugar, não uma divisão da emissão entre eles; somar todas as regiões
  passa do total do módulo, de propósito.

Trechos e emissão, esses sim, fecham com o cabeçalho — e é isso que a
conferência nova prende, região por região.

**Acabamento de tabela, com o Gustavo olhando a tela.** As colunas não tinham
folga horizontal nenhuma — só vertical —, e uma coluna numérica alinhada à
direita encostava na coluna de texto seguinte: "Trechos" e "Período" se liam como
um número só, no cabeçalho e em toda linha. A folga entrou na **peça
compartilhada**, com as células das pontas zeradas para a tabela seguir rente à
borda do painel; as tabelas de Método e Mobilidade ganham junto.

A folga custa largura, e isso obrigou duas decisões:

- **A grade assimétrica passou a dividir a partir de `lg`, não de `md`.** O que
  vai à esquerda nela é largo por natureza — um radar, uma tabela de cinco
  colunas —, e perto de 900px a coluna de 1,55fr já espremia coluna até número
  encostar em data de novo. **Empilhado é melhor que espremido**, e vale igual
  para a Mobilidade.
- **A coluna de período deixou de ser `nowrap`.** Espremida, ela quebra no
  travessão entre as duas datas, que é o único lugar onde a quebra não atrapalha.
  Largura fixa faria a tabela estourar o painel.

**Validação**

- `tsc --noEmit`, `npm test` (151 testes, 2 novos) e `next build` passam. Nenhum
  servidor de desenvolvimento foi subido.
- Conferido contra o banco com ensaio temporário, apagado em seguida: as oito
  regiões fecham com os corredores que as tocam, todo corredor tem período, e
  nenhum identificador de pessoa sai no mapa.

#### 2026-09-16 — As faixas horizontais do mapa: a costura de ±180°

O Gustavo viu três linhas atravessando o mapa de ponta a ponta, e uma dentro do
inserto. **Não era grade, não era rota e não era o recorte de polígono.**

**Era a costura do antimeridiano.** A origem representa a linha de ±180° com
vértices dos dois lados dela — para a esfera é o mesmo lugar, e na esfera a
aresta entre eles tem comprimento zero. Numa projeção equirretangular essa mesma
aresta é desenhada **dando a volta pelo mundo inteiro**, virando uma faixa
horizontal de ponta a ponta. Sete arestas assim existiam, em quatro anéis; três
caíam dentro do enquadramento e eram as que apareciam.

**O conserto é do gerador, não do desenho.** É propriedade do dado, não do
enquadramento: o script passou a **cortar o anel nas arestas que saltam mais de
180° de longitude**, e cada pedaço se fecha do lado do mundo onde mora. O corte
vem depois do arredondamento, porque é ele que às vezes empurra um vértice da
costura para o outro lado da linha.

**Uma travessia só é o caso que engana.** Quebrar ali devolve o mesmo anel
girado, e o salto passa da aresta explícita para o fechamento implícito — a
faixa reaparece igual, e foi o que aconteceu na primeira tentativa. Anel que
cruza a costura uma vez só é anel que **envolve um polo**, e o fechamento certo
é subir pela costura, dar a volta pelo polo e voltar. É o que faz a Antártida ser
uma calota e não uma tira.

**Virou invariante testada, porque o arquivo é gerado e ninguém lê um diff de
milhares de vértices.** O teste reprova qualquer aresta que salte mais de 180°,
com a exceção da que passa pelo polo — lá a travessia é a borda do mundo, não uma
linha no meio do desenho. Conferido contra o arquivo anterior: **reprova,
apontando as sete arestas**, e as latitudes que ele imprime são exatamente as
das linhas que apareciam na tela. Entrou junto a conferência de que a caixa
envolvente de cada anel contém os pontos dele — é por ela que a tela descarta
anel fora do enquadramento sem olhar ponto.

**Validação**

- `tsc --noEmit`, `npm test` (149 testes, 2 novos) e `next build` passam. Nenhum
  servidor de desenvolvimento foi subido.
- O contorno foi regerado e o desenho conferido medindo os anéis do SVG: nenhuma
  faixa de ponta a ponta sobrou, nem no quadro grande nem no inserto. O arquivo
  gerado ficou do mesmo tamanho.

#### 2026-09-16 — A §3.1.2 no código: a rota aparece, e o mapa ganha um inserto

Implementação da mudança de escopo decidida na §3.1. O código ainda suprimia
destino, rota e corredor por contagem de pessoas.

**A supressão saiu de três lugares**, e de nenhum outro: a tabela de destinos, a
tabela de rotas e o mapa de corredores. A mobilidade não foi tocada — o limite
continua valendo lá, pelo motivo que a §3.1.1 escreve. A camada de consulta é
onde essa diferença fica explícita, e agora ela tem um comentário dizendo por que
`supressaoMinima()` não é chamado no módulo de viagens.

**O `funcionarioId` continua sendo lido e continua morrendo na camada.** Tirar a
supressão não arrastou junto a regra do agregado sair pronto do servidor: nenhum
identificador entra na resposta, e há teste conferindo isso na saída serializada.

**Tirar a supressão trocou um problema por outro, e o segundo é de leitura.** O
recorte fino passou de poucas linhas para dezenas — a tabela de rotas tem agora
mais linhas que o painel inteiro comporta. Entrou um corte de leitura: as maiores
mais uma linha de resto.

> **A linha de resto não é supressão, e a tela diz isso em texto.** As duas se
> parecem e são coisas opostas: o balde da mobilidade existe para não identificar
> ninguém e não pode ser aberto; este é corte de apresentação, e o que ele reúne
> está inteiro nos totais da própria tela. Sem a frase, quem lembra da versão
> anterior desta tela leria a linha como a supressão que acabou de sair.

Duas decisões dentro do corte: **sobrando um recorte só, ele aparece** — "resto
(1 destino)" ocupa o mesmo espaço e diz menos —, e **a contagem de pessoas do
resto é de pessoas distintas**, não a soma das linhas, senão quem aparece em dois
recortes contaria duas vezes.

**As tabelas ganharam pessoas e período**, decisão do Gustavo. Quantas pessoas
foram e entre que datas; **nunca quem**. O período vai da primeira à última
viagem do recorte, em vez de uma data só: num grupo de várias viagens, data única
não diz qual delas é. Recorte de uma viagem só devolve naturalmente uma data.

A formatação do período fatia a string, sem passar por `Date`: a §10.1 guarda data
como texto justamente para não repetir os bugs de fuso, e converter só para
formatar os traria de volta pela janela — em São Paulo, o dia primeiro vira o
último do mês anterior. O teste prende o dia exato, que é onde esse erro
apareceria.

**O mapa: enquadramento pelo dado, com inserto do doméstico.** Com o
intercontinental desenhado, a moldura passou a cobrir quase meio planeta e o
conjunto brasileiro virou um borrão. O quadro grande mostra o alcance; o inserto
amplia o trecho marcado. O doméstico é desenhado nos dois — o inserto não tira
nada do quadro principal.

- **O inserto aparece por regra geométrica, não por lista de lugares.** Ele só
  existe quando o conjunto brasileiro ocupa menos que uma fração da moldura e tem
  mais de uma região. Num recorte só doméstico a moldura **é** o doméstico, e o
  inserto seria o mesmo desenho repetido do lado.
- **O que é "doméstico" sai da classificação que o cadastro já grava** (§11.3),
  não de uma lista nova escrita na tela.
- Continuam valendo o corredor por região, o ponto no centroide dos aeroportos
  que a empresa de fato usa, o anel para corredor dentro da mesma região e o
  corredor sem direção.

**Um defeito de desenho encontrado ao conferir, que só aparece com dado real.** O
quadro global empilhava os cinco rótulos brasileiros num quadrado de poucos
pixels — ilegível. Com o inserto no ar, o quadro grande desenha os pontos
domésticos **sem rótulo** e deixa os nomes para o inserto: o alcance não perde
nada, e o que sai é o texto que não cabia. No inserto, o título estava por cima do
ponto mais ao norte e desceu para o rodapé.

**Layout.** A tela passou a seguir o protótipo: mapa na largura inteira, e a
tabela de destinos ao lado do gráfico mensal. O empilhamento anterior era
**omissão, não decisão** — ninguém tinha comparado esta tela com o desenho de
referência. A coluna da tabela ficou mais larga que a metade do protótipo porque
a tabela daqui tem cinco colunas e a de lá tem quatro, sem data.

**Corrigido em seguida, com o Gustavo olhando a tela:** o gráfico mensal ficou
pequeno e sobrou meia tela em branco dentro do painel. Eram duas coisas, e
nenhuma é o gráfico em si.

> **O `viewBox` não é tamanho, é escala.** A série pedia largura proporcional ao
> número de meses, o que era razoável na largura inteira e virou o defeito na
> metade: quanto mais largo o `viewBox`, mais o navegador encolhe tudo para caber
> na coluna — inclusive rótulo e valor, que chegavam à tela com dois terços do
> tamanho pedido. Mais estreito e mais alto, o mesmo gráfico chega maior.

O vazio era outro: um painel curto ao lado de uma tabela de dez linhas é esticado
pela grade, e a esticada é toda em branco. A coluna da direita passou a ser uma
pilha de três painéis — **equilibrar duas colunas com conteúdo, não com vazio** —,
e a tabela de rotas foi para a largura inteira, porque não havia painel do tamanho
dela para pôr ao lado.

**A supressão deixou de ser parâmetro "geral" na tela de Método.** Declará-la
assim afirmaria que viagens e marítimo também suprimem, e nenhum dos dois
suprime. Ela passou a ser parâmetro da mobilidade, com a observação dizendo o
escopo — tela que promete regra que o código não aplica é pior que tela calada.

**Validação**

- `tsc --noEmit`, `npm test` (147 testes, 13 novos) e `next build` passam. Nenhum
  servidor de desenvolvimento foi subido.
- **As duas metades da §3.1 têm teste, no mesmo arquivo e de propósito**: destino,
  rota e corredor de uma pessoa aparecem nomeados; bairro de uma pessoa continua
  virando "outros". As duas foram conferidas **desligando a regra**: reintroduzir
  a supressão em viagens reprova as duas primeiras, tirá-la da mobilidade reprova
  a terceira. Guarda que não morde não é guarda.
- Conferido contra o banco carregado com ensaio temporário, apagado em seguida:
  **toda a emissão aérea passou a ter lugar no mapa**, nada ficou sem geografia,
  a soma dos trechos das tabelas reproduz o total em todos os recortes, e nenhum
  identificador de pessoa sai na resposta.
- O desenho foi conferido numericamente, renderizando o componente para arquivo
  estático e medindo posição de ponto, de rótulo e de moldura. Foi assim que os
  dois defeitos de legibilidade apareceram — nenhum deles seria pego por
  typecheck, teste ou build, que é a mesma lição de 15/09.

#### 2026-09-16 — Ano-base das viagens, e a saída do rabo de 2026

**Decisão do Gustavo: o relatório é de 2025.** A base da agência trazia trechos com voo em
janeiro de 2026 — passagem comprada num ano com voo no seguinte, o caso que a §7.2 já
previa. São poucas reservas, mas entravam no seletor de período como se fossem um ano, e
três semanas de dado apresentadas como um exercício é o mesmo erro que a §5 impede na visão
geral.

**Não foi uma exclusão manual, e o motivo importa.** Apagar os documentos resolveria até a
próxima carga, que os traria de volta sem ninguém perceber. Entrou `VIAGENS_ANO_BASE`: as
duas cargas administrativas descartam o trecho cujo **voo** cai fora do ano e dizem quantos
descartaram, a tela de método declara qual é o ano, e o exemplo vem vazio porque ano
plausível carregaria o período errado sem nenhum erro aparecer.

**O escopo de recarga passou a ser fonte E ano.** Sem o ano ali, carregar um período
apagaria o anterior inteiro — a recarga remove do escopo tudo que não está na carga nova
(§10.9) —, e um inventário que só guarda um ano de cada vez não é um inventário. Com o ano
no escopo, os períodos convivem.

**E convivendo, precisavam de uma trava.** A conferência falha se houver trecho de ano
diferente do ano-base, imprimindo quantos e de qual ano. As duas metades são de propósito:
**o escopo torna possível guardar mais de um ano, a conferência mantém isso deliberado.**
Foi essa conferência que apontou os trechos remanescentes depois da recarga, e a remoção
deles foi então explícita, com simulação antes de gravar.

**A premissa de fonte única reapareceu — agora no tempo.**

> Os valores esperados das conferências saíam dos totais declarados no arquivo de origem.
> Esses totais descrevem **o arquivo inteiro**, e o banco passou a guardar **um ano**:
> quatro conferências começaram a acusar erro numa carga correta. É a mesma armadilha de
> setembro, com outra dimensão — um esperado que embute "o banco tem tudo que está no
> arquivo".

A correção manteve as duas perguntas separadas, em vez de descartar uma: o **banco** é
conferido contra um recálculo recortado pelo ano, e os **totais declarados** viraram
conferência do arquivo contra ele mesmo, que é a única coisa que de fato descrevem. Nenhuma
guarda foi perdida; as duas ficaram dizendo a verdade sobre coisas diferentes.

Uma sutileza do recorte ficou no código: uma reserva conta quando **algum** trecho dela cai
no ano. Viagem que sai em dezembro e volta em janeiro pertence aos dois relatórios, com os
trechos repartidos entre eles.

**Validação**

- `tsc --noEmit`, `npm test` e `next build` passam. Nenhum servidor de desenvolvimento foi
  subido.
- A carga da agência foi reexecutada e o `verificar` fecha inteiro, incluindo as
  conferências novas. A remoção rodou primeiro em simulação.

**Consequência para a tela:** com um único ano carregado, o seletor de período não aparece
— ele já se escondia sozinho com menos de dois anos. Não é defeito; é a tela dizendo que
não há o que escolher.

#### 2026-09-16 — Acabamento da tela de Viagens

Os três defeitos que a §14 listava em aberto. Nenhum era o que parecia, e o
levantamento veio antes de qualquer linha.

**Os cartões zerados não eram da consulta.** A suspeita era que os indicadores
calculassem por ano e devolvessem vazio sem ano escolhido. Conferido contra o
banco nos três recortes: a camada devolve valor em todos, e a soma da série bate
com o total dos cartões em cada um. Era o contador congelado, corrigido na
entrada anterior.

**O terceiro cartão virou "trechos por viagem".** Ele duplicava o segundo em
outra unidade. A §11.3 nunca pediu três indicadores — três colunas vieram do
protótipo e puxaram conteúdo. O substituto foi escolhido por ser o que **denuncia
um defeito de dado conhecido**: a planilha do cartão separa viagem por linha em
branco, e viagem partida em mais de um bloco vira mais de uma viagem, inflando a
contagem e puxando para baixo o indicador ao lado. Valor abaixo de dois é o
sintoma, e a nota do cartão diz isso.

**O mapa já era por corredor.** Conferido: a camada agrega por região, a tela
desenha por região e os aeroportos do cadastro estão todos classificados. O que
restava era outra coisa — **num recorte em que nenhum corredor sobrevive à
supressão, a tela caía num vazio que não explicava nada.** É justamente quando a
explicação mais importa: mapa vazio sem motivo é lido como falha de carga, e o
motivo é o oposto disso. A frase do que não pôde ser desenhado, com a proporção
da emissão envolvida, virou componente único usado nos dois caminhos — com mapa e
sem mapa. Texto duplicado seria garantir que um dos dois envelhecesse.

**A ponte entre duas contagens certas.** O cartão conta trechos que entram no
total; a conferência de cobertura conta documentos da origem, duplicata inclusive
— e tem que contar, senão uma reserva perdida na leitura se esconderia atrás de
uma duplicata. As duas estão certas e respondem a perguntas diferentes. Faltava a
tela dizer isso: a camada passou a expor os trechos gravados e fora do total, e a
nota do primeiro cartão explica a diferença em vez de deixá-la para quem cruzar
os números por conta.

**Validação**

- `tsc --noEmit`, `npm test` e `next build` passam. Nenhum servidor de
  desenvolvimento foi subido.
- Os três recortes de período foram exercitados contra o Firestore carregado, com
  ensaio temporário apagado em seguida: os três cartões finitos e coerentes em
  todos, a soma de trechos no total e fora dele batendo com a contagem de
  documentos da coleção em cada recorte, e o caso de mapa vazio reproduzido —
  é ele que agora declara a proporção não desenhada em vez de calar.

**Operação:** `VIAGENS_CORTE_FONTE` foi removida também do `.env` local, junto do
comentário que só falava dela. Nenhuma outra variável foi tocada e as
conferências continuam fechando.

#### 2026-09-16 — Contador congelado em zero

Defeito só de navegador: os cartões de indicador exibiam zero, enquanto o
gráfico da mesma tela mostrava o período inteiro. Conferido contra o banco antes
de mexer — a camada de consulta devolve o valor certo com e sem ano escolhido, e
o servidor manda esse valor no HTML. O zero aparecia depois da hidratação.

**A causa era uma trava de "já animei".** Ela jogava fora justamente o número
certo que o próprio componente tinha colocado no HTML, por dois caminhos
independentes:

- em desenvolvimento o React executa todo efeito duas vezes. A primeira zerava o
  texto e agendava o quadro, a limpeza cancelava o quadro, e a segunda saía na
  trava — **o número ficava em zero para sempre**, em todos os cartões de todas
  as telas;
- ao trocar o ano por um link o componente não remonta, então o inicializador do
  estado não roda de novo e o efeito saía pela trava: o número exibido **não
  acompanhava a prop nova**.

Sem a trava, os dois casos se resolvem pelo mesmo caminho — o efeito recomeça a
contagem do zero e termina no valor atual. O ramo de `prefers-reduced-motion`
ganhou uma linha que antes não existia: ele escreve o valor atual antes de sair,
senão a troca de recorte deixaria o número anterior na tela para quem pede menos
movimento. A trava escondia esse caso porque nunca chegava a acontecer duas
vezes.

**Efeito colateral aceito:** o contador reanima a cada troca de recorte, e antes
animava uma vez por montagem. Para não reanimar seria preciso distinguir "mesmo
valor, nova montagem" de "valor novo" — e é exatamente essa distinção que
reintroduz a chance de o número ficar parado no recorte anterior.

**Sobre a validação:** `tsc`, `npm test` e `next build` passam com e sem o
defeito, e isso está escrito no cabeçalho do arquivo. Ciclo de efeito e ordem de
pintura só existem quando há navegador pintando — é a mesma lição de 15/09, e
continua sem guarda automática honesta.

#### 2026-09-16 — A §0.1 no código: duas coleções, e a data de corte apagada

Implementação da separação decidida na entrada anterior. O código ainda refletia
a premissa de que agência e formulário eram a mesma série com uma data no meio.

**A data de corte saiu inteira.** `VIAGENS_CORTE_FONTE` e as duas funções que a
liam, o campo na lista de parâmetros da tela de método, a contagem de trecho por
fonte na série, a marca de virada no gráfico mensal, o alerta de fonte
sobreposta na carga e os dois testes que fixavam o comportamento. A variável
saiu também do `.env.example`, com o motivo escrito no lugar dela — e a lista de
placeholders vigiados encolheu junto.

Um efeito dessa premissa estava vivo e não tinha sido notado: **a carga da base
da agência não rodava.** A variável tinha sido esvaziada de propósito em 15/09 e
o script a exigia, então recarregar o histórico falhava reclamando de uma
variável que a §7 diz que não deve existir.

**Duas coleções, não um campo discriminador.** O programa de viagens passou a
ler `viagemRegistrada`. Antes a separação era um `where` por fonte sobre a
coleção do inventário, e bastava uma consulta esquecer o filtro. Com duas
coleções não há filtro para esquecer: a mistura deixa de ser proibida e passa a
ser impossível, que é a diferença que a §0.1 pede.

**`criadoPorUid` mudou de coleção.** Era campo do programa no esquema do
inventário, e vinha nulo em todo documento gravado — nenhum documento de
`viagemTrecho` é criado por alguém usando a aplicação. Em `viagemRegistrada` ele
é obrigatório e entra no ID: o ID do inventário deriva do arquivo de origem,
porque é recarregar o arquivo que precisa sobrescrever; aqui não há arquivo, e a
origem é quem registrou.

**O envelope da §10.4 foi partido em dois.** O núcleo — modal, escopo, período,
fator carimbado, alertas — é comum, porque o cálculo do programa reaproveita os
mesmos fatores. `modulo`, `periodicidade` e `empresa` ficaram no envelope do
inventário, que é onde fazem sentido. É a §7.5 no esquema: compartilha-se a
matemática, não o dado.

**A separação virou invariante executável, em três pontos.** A validação de
escrita recusa `fonte: 'formulario'` em `viagemTrecho`; a conferência falha se
encontrar um desses no banco, porque validação só alcança o que passa por ela e
documento gravado antes da regra continua lá; e a cobertura passou a anunciar
quantos trechos o programa tem em coleção própria, para a ausência deles nas
conferências de origem ser uma informação e não um silêncio.

**Decisão que não estava no documento:** `validarViagemRegistrada` exige que a
data de volta não anteceda a de ida. É a única coleção preenchida à mão por
gente usando a aplicação, e é onde erro de digitação chega; as outras vêm de
carga conferida.

**Um teste novo nasceu cego e foi corrigido na hora.** Ele proibia a palavra
"corte" em qualquer texto da fonte de viagens, e reprovou a própria frase que
explica que não há corte — frase que a tela deve ter, porque a pergunta é
natural para quem lembra da versão anterior. Passou a proibir o que de fato é
errado: prometer troca de fonte no tempo.

**Validação**

- `tsc --noEmit`, `npm test` (134 testes, 7 novos) e `next build` passam. Nenhum
  servidor de desenvolvimento foi subido.
- As três guardas novas foram conferidas **desligando cada uma**: as três
  reprovam quando a regra sai e passam quando volta. Guarda que não morde não é
  guarda.
- `verificar` rodou contra o banco carregado e **todas as conferências bateram**,
  incluindo a nova da §0.1. A da planilha do cartão continua reportando arquivo
  de origem ausente nesta máquina, como já fazia.

#### 2026-09-16 — Separação entre inventário e programa de viagens

**Mudança de premissa, decidida pelo Gustavo. É a maior deste documento até agora.**

O §7 dizia, desde a primeira versão, que o relatório da agência e o formulário do
viajante eram a mesma série, separadas por uma data de corte. **Está errado, e nunca foi
o que se queria.** São dois sistemas: um inventário alimentado por planilha e um programa
de registro voluntário, que compartilham casca, sessão e visual, e nada além disso.

**Por que importa.** Somar fonte administrativa completa com autodeclaração voluntária
produz série que mede adesão, não emissão. Uma queda seria lida como redução de emissão
quando é queda de preenchimento — num relatório que alguém assina.

**O que essa premissa errada tinha gerado.** Contagem de trecho por fonte na série, marca
de virada no gráfico mensal, data de corte como parâmetro de ambiente, declaração de
origem por fonte na tela de Método, e o defeito da subtração encontrado na varredura —
"trechos do formulário" calculado como total menos agência. Toda essa complexidade era
acidental: existia só para sustentar uma junção que não devia acontecer.

A §0.1 passou a abrir o documento, porque é a regra da qual as outras dependem. O §7 foi
reescrito com duas fontes administrativas e sem corte. O formulário virou §7.5 e está
declarado como sistema separado. O §11 diz qual tela lê qual coleção.


#### 2026-09-14 — Fundação e carga de viagens

Etapa de fundação e dados. Nenhuma tela construída.

**Projeto**

- Next.js (App Router) + TypeScript + Tailwind. Só o shell: `layout`, uma página
  de espaço reservado e a paleta da §4 como tokens de tema. `.gitignore` não foi
  tocado.
- Raiz do Turbopack fixada em `next.config.ts`: existe um lockfile em diretório
  acima e o build inferia a raiz errada.

**Banco**

- Schema Drizzle com as tabelas da §10 e as migrations `0000_inicial` e
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
- **Duas colunas técnicas fora da §10.** `funcionario.chave_origem` e
  `viagem.ref_origem` guardam o identificador da pessoa e da reserva no arquivo
  de origem. Sem elas a carga não é idempotente: reprocessar duplicaria
  funcionário e viagem. Nenhuma das duas vai para o cliente.
- **Limites de faixa também viram linha em `fator_emissao`.** Os quilômetros que
  separam as faixas fazem parte da definição do fator; guardados na tabela, o
  cálculo do formulário não vai precisar de número no código.
- **Vigência do fator é informada na carga**, por variável de ambiente ou
  argumento. Sem vigência o script recusa a carga em vez de escolher uma data.
- **O escopo do aéreo é gravado como 3** e o resolvido do carro sai de
  `propriedade_veiculo`, conforme §7.5.
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

- `0002_mobilidade_alerta` cria a tabela de alertas do módulo. A §10 não a
  previu, mas a §6.2 manda sinalizar erro de entrada e a §11.5 manda mostrar —
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
  não é coluna da §10, então usá-la deixaria o cálculo impossível de reproduzir
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
- §7.5: formulário do colaborador reduzido ao mínimo que calcula emissão. Saiu o
  campo de motivo; ficam os três campos do carro, que entram na conta.
- §10: reescrita inteira. Coleções, envelope comum, IDs determinísticos, alertas em
  dois campos, validação na escrita e camada única de consulta agregada.
- §11.1: os quatro cortes do painel — período, modal, rota/destino e empresa.
- §12: segurança reescrita para Firebase, com rules negando tudo por padrão.
- §13: entram como fora de escopo qualquer campo financeiro, centro de custo,
  Storage, contador agregado e fluxo de aprovação do registro de viagem.
- §14 nova, "Pontos em aberto". O log virou §15 e o ponteiro da §0 foi corrigido —
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

**Decisões minhas, tomadas ao escrever a seção 10**

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
- **O que o banco garantia vira validação na escrita**, listada na §10.9: escopo,
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
  validação de escrita, ID determinístico e camada única de consulta — §10.9 e
  §10.10.

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
  categoria visível na agregação (§10.10) em vez de o campo simplesmente não
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
  emissão e das de apoio, com o envelope comum da §10.4. `montarAlertas()` monta
  os dois campos de alerta de uma vez, porque mantê-los em sincronia à mão é o
  tipo de coisa que só aparece quando a consulta por código devolve menos do que
  deveria.
- `src/server/documentos/ids.ts` — IDs determinísticos por coleção, com limpeza
  do que o Firestore recusa no identificador.
- `src/server/documentos/validacao.ts` — a §10.9 inteira, em código.
- `src/server/escrita.ts` — gravação em lote, apagamento por escopo e recarga de
  período.
- `src/server/documentos/validacao.test.ts` e `npm test` — 19 testes, sem
  dependência nova: o runner é o do próprio Node.

**Decisões da fase**

- **A recarga grava antes de apagar, e a §10.9 foi corrigida para dizer isso.** O
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
  explícito para continuar visível na agregação (§10.10).
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
- Os testes exercitam cada regra da §10.9 pelos dois lados: documento válido
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
  reproduzível a partir do próprio documento. A §10.6 foi atualizada.
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
  §10.10; virou invariante executável.

**Decisões da fase**

- **A mobilidade não entra na série mensal da visão geral.** Ela é taxa mensal
  do ano-base (§10.3); somada à série de eventos, apareceria como se tivesse
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
na §10.8: na mobilidade a ausência é erro de uma linha; nas viagens o fator vem do
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

**O que isso invalida:** a distância média do módulo, o radar da §11.2 (que
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
- **§11: a tela de Método ganhou lista mínima** do que precisa declarar. A troca de
  provedor muda o número e não podia continuar existindo só no log.
- **§12: duas regras novas de credencial** — exposição sem commit ainda exige rotação, e
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
§10.10 existe para impedir — total que não bate com o que existe, sem nenhum sinal.

A correção certa é de autorização, não de tolerância: `importacao` não recebe a visão
geral. A `acesso.ts` passou a ter três portas distintas — inventário, módulo e visão
geral —, a navegação não oferece a tela e a consulta recusa quem chegar pela URL.
`AcessoNegadoError` ali é o comportamento correto. A §5 foi atualizada.

**Tela de Método**

- `src/server/consultas/metodo.ts` — o que existia devolvia só a lista de fatores, um
  sétimo do que a §11 passou a exigir. Agora declara fontes, parâmetros, qualidade do
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
  consulta (§12.3). O menu apenas não oferece o que a consulta vai recusar: menu que
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
a data como não definida. A §14 também foi corrigida — ela ainda dizia que nenhuma tela
tinha sido construída, o que deixou de ser verdade nesta etapa.

#### 2026-09-15 — Sessão endurecida e tela de Mobilidade

**Quatro perguntas do Gustavo sobre a sessão.** Duas já estavam resolvidas, duas não.
As quatro respostas viraram §12.9 a §12.12 — eram regra de segurança que só existia no
código, e regra que só existe no código é regra que some na próxima refatoração.

- **Atributos do cookie: já estava.** `httpOnly`, `secure` em produção, `sameSite: lax`
  e `path` na raiz. O `lax` é o que fecha o CSRF do caminho de escrita que a §11.6 vai
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

**Fatia 2 — tela de Mobilidade (§11.2)**

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

A §1 diz que distância é insumo de cálculo e **não aparece na interface**. A §11.2 lista
"distância média" e "radar de onde o quadro mora" como conteúdo da tela de Mobilidade — e
o radar é, por construção, distância desenhada.

Segui a §11.2, por ser a mais específica: a regra da §1 mira as métricas de frete — peso,
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
- **Campo de motivo da viagem no formulário.** A §7.5 pede o mínimo que calcula emissão e
  diz explicitamente para não pedir justificativa; o campo já havia sido retirado na
  migração.
- **Métricas fora da lista da §11.** O protótipo tem cartões de "viagem mais longa" e
  "corredor mais pesado", que são registros extremos: além de não estarem na §11.3 nem na
  §11.4, um extremo isolado é um recorte de uma viagem só, contra a §3.1.
- **Equivalência em árvores** no indicador principal. Não é corte previsto na §11.1 e
  dependeria de um fator de conversão sem fonte na coleção de fatores — a §10.8 não admite
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

**3. As três telas reaplicadas.** Método manteve o conteúdo, que é o da §11 e não o do
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
- **Tabelas com colunas que a camada não entrega.** Restam as do marítimo — contêineres por
  porto e a barra empilhada de qualidade do dado. A de destinos foi fechada em 16/09, com
  pessoas e período. Ampliar a camada para preencher desenho é decisão de escopo, não de
  acabamento.

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

#### 2026-09-15 — Recarga do cartão: o viajante era o primeiro nome, não o último

O Gustavo identificou os dois viajantes e apontou o que eu tinha lido errado: **o texto
abaixo do nome, dentro do bloco, é a companhia aérea, não outra pessoa.**

**O defeito.** A leitura deixava o nome mais recente vencer dentro do bloco. Como a
companhia aparece logo abaixo do viajante, **a viagem inteira ficava lançada no nome da
empresa aérea** — e a carga anterior chegou a criar dois funcionários que eram companhias.
A regra passou a ser posicional e explícita: o primeiro nome do bloco é o viajante e não é
sobrescrito; um segundo nome é companhia, gravada no campo que já existia para isso.

A suposição fica **sinalizada em alerta**, porque a regra é posicional: um bloco que de
fato tivesse dois viajantes silenciaria o segundo, e o alerta é o que torna isso visível.

**Duas mudanças de política na carga**

- **A carga não cria pessoa.** Antes, viajante sem correspondência virava registro próprio
  — foi assim que uma companhia aérea virou funcionário. Agora a carga **para e diz quem
  falta**. Criar pessoa a partir de planilha é barato de fazer e caro de desfazer: infla o
  quadro, e a contagem de pessoas distintas é o que sustenta a supressão (§3.1).
- **A ponte entre o primeiro nome e o cadastro é um mapa fora do repositório.** A planilha
  traz só o primeiro nome, que não identifica ninguém; o mapa de apelido para nome completo
  mora em `dados/`, que é ignorado pelo git, porque nome real não se versiona (§2.1).

**Limpeza.** Os registros de pessoa criados pela carga anterior desta fonte são varridos
**depois** da gravação, e só sai o que nenhum trecho aponta — mesma ordem da recarga, pelo
mesmo motivo (§10.9). Os três criados antes foram removidos.

**Uma conferência antiga quebrou, e quebrar foi o certo**

A conferência de aeroportos comparava o **tamanho** da coleção com o da base da agência.
Com a segunda fonte trazendo aeroportos internacionais, ela passou a acusar erro numa carga
correta. A premissa embutida era "esta coleção vem de uma fonte só" — a mesma premissa que
originou o erro da fonte única. Passou a conferir o que importa: **nenhum aeroporto da base
da agência ficou de fora do cadastro**.

**As duas lições, como o Gustavo pediu que ficassem registradas**

> **Fonte única não autoriza afirmação sobre o todo.** Concluí "não existe viagem
> intercontinental" olhando a única base carregada. A frase verdadeira era "não existe na
> base da agência", seguida de uma pergunta. E a premissa não fica só na frase: ela se
> esconde em conferência que compara total de coleção com total de uma fonte.

> **Agregação não resolve população.** Ao pedir corredor em vez de rota, a hipótese era que
> o recorte fino escondia o peso. Medido: o corredor quase dobra a emissão visível no
> doméstico e **não torna o internacional desenhável**, porque duas pessoas na empresa
> inteira viajaram para fora no período. Agregar geografia não cria gente. Quando a
> supressão morde, a pergunta certa é quantas pessoas existem no recorte — não quão grosso
> ele é.

#### 2026-09-16 — Varredura de premissa de fonte única, e o mapa por corredor

**A varredura pedida encontrou mais duas, e uma era bug vivo numa tela.**

O Gustavo pediu, antes do corredor, uma busca por outras conferências, validações ou
consultas que assumissem implicitamente que uma coleção vem de uma fonte só — porque a
premissa já tinha aparecido em dois lugares. Encontrei três:

- **A tela de Método contava o formulário por subtração.** "Trechos vindos do formulário"
  era *total menos agência*, e no dia em que a terceira fonte entrou, os trechos do cartão
  apareceram na tela como se fossem do formulário. **Premissa de fonte única se esconde
  bem numa subtração.** Passou a contar por fonte, e fonte desconhecida aparece pelo
  próprio código em vez de se diluir em outra.
- **Três conferências de integridade só olhavam a agência.** Trecho sem fator carimbado,
  ordem repetida na reserva e mês diferente do mês do voo nasceram dentro da agregação da
  agência, que filtra por fonte. Elas substituem o que o banco relacional garantia sozinho
  e valem para qualquer trecho — com a segunda fonte, viraram **integridade conferida em
  parte da coleção**. Passaram a varrer todos os trechos.
- **A cobertura do programa usa o total da coleção de funcionários** como denominador de
  adesão. Essa coleção é alimentada por mais de uma fonte e já inclui gente que só aparece
  como aprovador de passagem. Não é defeito de código — é definição de indicador, e fica
  registrado para quando a tela do programa existir.

**Mapa por corredor**

Aprovado com a premissa corrigida pelo próprio Gustavo: o problema era população, não
granularidade. O corredor entra porque dobra o doméstico visível, não porque resolve o
internacional.

- A região fica **gravada no cadastro do aeroporto**, com o critério ao lado. Para
  aeroporto brasileiro sai do `uf`, que é dado; para estrangeiro sai da coordenada, por
  faixa continental — a metade frágil. Gravar, e não calcular na consulta, é o que permite
  rever e corrigir à mão, e impede que trocar a regra mude em silêncio um mapa publicado.
- **A lista dos aeroportos classificados por coordenada aparece na tela de Método**, com o
  aeroporto e a região atribuída. A inferência que muda um desenho precisa estar onde
  alguém possa conferir sem abrir código.
- **O ponto de cada região é o centroide dos aeroportos que a empresa de fato usa ali**,
  não um ponto inventado para a região inteira: a linha sai de onde se voa, e o desenho
  continua derivado do dado.
- **Corredor dentro da mesma região vira anel, não linha.** Um par de regiões iguais é um
  ponto, e um ponto não tem direção para desenhar.
- **A linha do que não pode ser desenhado.** A legenda declara a proporção da emissão
  aérea que está em corredor suprimido, sem nomear nenhum, e diz explicitamente que **não
  é dado faltando**: é deslocamento de poucas pessoas, que não vira linha sem apontar para
  elas. Sem essa frase, mapa com poucas linhas é lido como falha de carga.
- **A tabela continua por aeroporto**, e cada bloco diz por quê. As duas unidades convivem
  porque a restrição é diferente: no mapa o balde de suprimidos não tem lugar e sumiria; na
  tabela ele é uma linha que soma e aparece.

**O limite continua cego, e isso é o ponto.** Um corredor com quatro pessoas — uma abaixo
do limite — continua suprimido. Se coubesse exceção para caso quase suficiente, o limite
não existiria.

**Validação**

- `tsc --noEmit`, `npm test` (126 testes, 8 novos) e `next build` passam. Nenhum servidor
  de desenvolvimento foi subido.
- Conferido contra a base com ensaio temporário, apagado em seguida: **todo corredor
  desenhado tem pelo menos o número mínimo de pessoas**, nenhum identificador sai na
  resposta, e a proporção não desenhada bate com a medição feita antes de implementar.
- Os testes novos cobrem a classificação pelos dois critérios, a precedência do `uf` sobre
  a coordenada, coordenada fora de todas as faixas, e o corredor sem direção — ida e volta
  precisam ser o mesmo recorte, senão a supressão contaria cada sentido separado.