# FGV Descarboniza

Inventário de emissões de CO₂ com três módulos — mobilidade casa-trabalho,
viagens corporativas e transporte marítimo de importações — e um painel
consolidado. Somente relatórios de emissão: não há cenário de redução,
simulação ou projeção.

A especificação do sistema está em [CLAUDE.md](CLAUDE.md). Leia antes de mexer
no código, especialmente a seção 2: **este repositório é público** e nenhuma
base, credencial, nome de pessoa ou total de conferência pode ser versionado.

## Stack

Next.js (App Router) · TypeScript · Tailwind · Firestore pelo Admin SDK ·
deploy na Vercel · login por Firebase Auth com Google, restrito ao domínio
corporativo.

## Estrutura

```
src/app/            rotas do App Router
src/server/         acesso ao Firestore pelo Admin SDK (só servidor)
src/lib/            env, cálculo de emissão, geocodificação e normalização
scripts/            carga das bases, rodada fora da aplicação
firestore.rules     regras de acesso: negam tudo, por desenho
```

## Primeiros passos

```bash
npm install
```

```bash
cp .env.example .env
```

Preencha o `.env` com os valores reais — ele não é versionado. A credencial do
Admin SDK vai nas três variáveis `FIREBASE_*`, ou em um JSON de service account
apontado por `GOOGLE_APPLICATION_CREDENTIALS` **fora do repositório**.

Publique as regras do Firestore antes de qualquer carga:

```bash
npm run rules:deploy
```

Elas negam leitura e escrita para qualquer cliente. Todo acesso passa pelo Admin
SDK, no servidor, que não é afetado pelas regras.

## Carga das bases

Não existe tela de upload: a carga é feita por script, fora da aplicação, por
quem tem acesso às bases. Os arquivos de base não são versionados — informe o
caminho local em `.env` ou como argumento.

```bash
npm run seed:fatores              # fatores aéreos, com fonte e vigência
npm run seed:fatores-mobilidade   # fatores da mobilidade, do arquivo que você monta
npm run ingest:viagens            # base histórica de viagens aéreas
npm run ingest:mobilidade         # pesquisa de mobilidade casa-trabalho
npm run verificar                 # confere o que está no banco
```

A carga de mobilidade geocodifica cada CEP, calcula a distância até a fábrica e
grava apenas distância, bairro e cidade — o endereço não entra no banco. Ela
chama serviço externo por resposta, então leva alguns minutos e depende do
provedor configurado em `GEOCODE_PROVEDOR`.

Os fatores da mobilidade não vêm de nenhuma base do inventário: são escolha
metodológica. Monte um JSON com a fonte adotada, no formato descrito no
cabeçalho de `scripts/seed-fatores-mobilidade.ts`, e aponte
`BASE_FATORES_MOBILIDADE_PATH` para ele.

`verificar` imprime esperado, obtido e diferença de cada item e sai com código
1 quando algo não bate. Os valores esperados vêm do arquivo da base e, quando
houver, de um `conferencia.local.json` na raiz — que também não é versionado.

Rode cada `seed` antes da carga correspondente: sem fator vigente na coleção, o
cálculo falha explicitamente em vez de assumir um valor padrão.

## Privacidade

- Endereço de funcionário não entra no banco: o script geocodifica a partir do
  CEP, calcula a distância e descarta o endereço.
- Nas telas de inventário nenhuma pessoa é identificável; uma camada única de
  consulta entrega o dado já agregado e sem identificador.
- Recortes com menos pessoas que o limite configurado não são exibidos.
- Todo acesso a dado é server-side e a autorização é verificada no servidor,
  dentro de cada consulta.
