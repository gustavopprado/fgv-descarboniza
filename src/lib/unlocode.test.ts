/**
 * Testes da leitura da lista UN/LOCODE.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2): os códigos, os
 * nomes e as coordenadas não saem de base real nem da lista publicada — são
 * construídos para exercitar o formato, não para descrever lugar nenhum.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  coordenadaUnlocode,
  dividirLinhaCsv,
  ehPortoMaritimo,
  lerUnlocode,
} from './unlocode'

test('a coordenada é grau e minuto colados, com hemisfério na última letra', () => {
  // 30°30' ao sul, 45°15' a oeste.
  assert.deepEqual(coordenadaUnlocode('3030S 04515W'), {
    latitude: -30.5,
    longitude: -45.25,
  })
  assert.deepEqual(coordenadaUnlocode('0000N 00000E'), { latitude: 0, longitude: 0 })
  assert.deepEqual(coordenadaUnlocode('1045N 17030E'), {
    latitude: 10.75,
    longitude: 170.5,
  })
})

test('a latitude tem dois dígitos de grau e a longitude tem três', () => {
  // Se o minuto fosse lido por posição fixa contada do início, `04515W` viraria
  // 4° e 51' — e o ponto sairia mais de quarenta graus fora do lugar.
  const um = coordenadaUnlocode('0130S 00145W')
  assert.deepEqual(um, { latitude: -1.5, longitude: -1.75 })
})

test('coordenada ausente ou malformada é nulo, nunca zero', () => {
  // Zero é uma afirmação: é o Golfo da Guiné. Ausência precisa ser ausência.
  for (const bruto of [
    null,
    undefined,
    '',
    '   ',
    '3030S',
    '3030X 04515W',
    '3099S 04515W', // minuto ≥ 60
    '9930N 04515W', // latitude fora da faixa
    'abc def',
  ]) {
    assert.equal(coordenadaUnlocode(bruto), null, `deveria ser nulo: ${String(bruto)}`)
  }
})

test('o classificador de função diz se o código é porto marítimo', () => {
  assert.ok(ehPortoMaritimo('1-------'))
  assert.ok(ehPortoMaritimo('1234-6--'))
  assert.ok(!ehPortoMaritimo('---4----'))
  assert.ok(!ehPortoMaritimo('--3-----'))
  assert.ok(!ehPortoMaritimo(null))
})

test('a divisão de linha respeita aspas, e um campo com vírgula não desloca colunas', () => {
  assert.deepEqual(dividirLinhaCsv('a,b,c'), ['a', 'b', 'c'])
  assert.deepEqual(dividirLinhaCsv('a,"b,c",d'), ['a', 'b,c', 'd'])
  assert.deepEqual(dividirLinhaCsv('a,"diz ""oi""",c'), ['a', 'diz "oi"', 'c'])
  assert.deepEqual(dividirLinhaCsv('a,,c'), ['a', '', 'c'])
})

const CABECALHO =
  'Change,Country,Location,Name,NameWoDiacritics,Subdivision,Status,Function,Date,IATA,Coordinates,Remarks'

function arquivo(...linhas: string[]): string {
  return [CABECALHO, ...linhas].join('\n')
}

test('só os códigos pedidos voltam, e voltam completos', () => {
  const achados = lerUnlocode(
    arquivo(
      ',XA,AAA,Lugar Fictício Um,Lugar Ficticio Um,S1,AA,1-------,2101,,3030S 04515W,',
      ',XA,BBB,Lugar Fictício Dois,Lugar Ficticio Dois,,AA,---4----,2101,,1045N 17030E,',
      ',XB,CCC,Lugar Fictício Três,Lugar Ficticio Tres,,AA,1-3-----,2101,,0130N 00145E,',
    ),
    ['XAAAA', 'XBCCC'],
  )

  assert.equal(achados.size, 2)
  assert.deepEqual(achados.get('XAAAA'), {
    locode: 'XAAAA',
    pais: 'XA',
    nome: 'Lugar Fictício Um',
    subdivisao: 'S1',
    latitude: -30.5,
    longitude: -45.25,
    funcao: '1-------',
    ehPorto: true,
  })
  assert.equal(achados.get('XBCCC')?.ehPorto, true)
  // O que não foi pedido não volta, mesmo estando no arquivo.
  assert.equal(achados.get('XABBB'), undefined)
})

test('a busca ignora caixa e espaço no código pedido', () => {
  const achados = lerUnlocode(
    arquivo(',XA,AAA,Lugar Fictício,Lugar Ficticio,,AA,1-------,2101,,3030S 04515W,'),
    [' xaaaa '],
  )
  assert.equal(achados.size, 1)
  assert.ok(achados.has('XAAAA'))
})

test('entre registros repetidos vence o que traz coordenada', () => {
  // A lista oficial repete o código quando o lugar mudou de nome ou de estado.
  // Sem esta regra, um registro histórico sem coordenada apagaria o bom — e o
  // porto entraria no cadastro sem poder ser desenhado, sem motivo.
  const primeiroSemCoordenada = lerUnlocode(
    arquivo(
      ',XA,AAA,Nome Antigo Fictício,Nome Antigo Ficticio,,AA,1-------,1001,,,',
      ',XA,AAA,Nome Atual Fictício,Nome Atual Ficticio,,AA,1-------,2101,,3030S 04515W,',
    ),
    ['XAAAA'],
  )
  assert.equal(primeiroSemCoordenada.get('XAAAA')?.nome, 'Nome Atual Fictício')
  assert.equal(primeiroSemCoordenada.get('XAAAA')?.latitude, -30.5)

  // E o primeiro continua vencendo quando ele já tem coordenada: quem chega
  // depois não sobrescreve por ser mais recente na ordem do arquivo.
  const primeiroComCoordenada = lerUnlocode(
    arquivo(
      ',XA,AAA,Nome Fictício Bom,Nome Ficticio Bom,,AA,1-------,2101,,3030S 04515W,',
      ',XA,AAA,Nome Fictício Outro,Nome Ficticio Outro,,AA,1-------,1001,,1045N 17030E,',
    ),
    ['XAAAA'],
  )
  assert.equal(primeiroComCoordenada.get('XAAAA')?.nome, 'Nome Fictício Bom')
})

test('registro sem coordenada entra assim mesmo, com os dois lados nulos', () => {
  const achados = lerUnlocode(
    arquivo(',XA,AAA,Lugar Fictício,Lugar Ficticio,,AA,1--45---,2101,,,'),
    ['XAAAA'],
  )
  const porto = achados.get('XAAAA')
  assert.equal(porto?.latitude, null)
  assert.equal(porto?.longitude, null)
  assert.equal(porto?.ehPorto, true)
})

test('campo com vírgula entre aspas não desloca a coordenada', () => {
  // É o caso que motivou o divisor próprio: a coluna de observações traz listas
  // de códigos separadas por vírgula. Lida com split simples, a coordenada sairia
  // de outra coluna — número plausível, lugar errado.
  const achados = lerUnlocode(
    arquivo(
      ',XA,AAA,Lugar Fictício,Lugar Ficticio,,AA,1-------,2101,,3030S 04515W,"Cf XA BBB, Cf XA CCC"',
    ),
    ['XAAAA'],
  )
  assert.deepEqual(
    { lat: achados.get('XAAAA')?.latitude, lon: achados.get('XAAAA')?.longitude },
    { lat: -30.5, lon: -45.25 },
  )
})

test('arquivo sem as colunas da lista falha alto', () => {
  assert.throws(
    () => lerUnlocode('coluna_a,coluna_b\n1,2', ['XAAAA']),
    /UN\/LOCODE/,
  )
})

test('pedir nada não lê nada', () => {
  assert.equal(lerUnlocode(arquivo(',XA,AAA,X,X,,AA,1-------,2101,,3030S 04515W,'), []).size, 0)
})
