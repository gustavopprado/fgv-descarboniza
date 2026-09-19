'use server'

/**
 * A escrita do programa de viagens — CLAUDE.md §7.5 e §11.
 *
 * **Isto é a ponte entre o formulário e a camada de consulta, e não faz conta
 * nenhuma.** Ela lê o que veio do navegador, confere a forma, e entrega à
 * camada, que é quem calcula, valida e grava (§9.10). Tudo que chega aqui é
 * entrada de fora: nada é aceito como veio, nem o tipo da viagem.
 *
 * A autorização é da camada, junto do dado (§11.3) — esta função não decide
 * quem pode o quê; ela passa o contexto da sessão e a camada recusa quem não
 * pode. O cookie que dá esse contexto é `sameSite: lax` (§11.9), que é o que
 * fecha o CSRF deste caminho de escrita.
 */
import {
  registrarViagem,
  RegistroRecusadoError,
  type EntradaDeViagem,
} from '@/server/consultas/programa'
import { exigirSessao } from '@/server/sessao'

export type EstadoDoFormulario =
  | { situacao: 'inicial' }
  | { situacao: 'erro'; mensagem: string }
  | {
      situacao: 'gravada'
      reservaId: string
      tipo: 'aereo' | 'carro'
      distanciaKm: number
      co2Kg: number
      co2KgVeiculo: number
      ocupantes: number | null
      trechos: { origem: string; destino: string; distanciaKm: number; co2Kg: number }[]
    }

function texto(dados: FormData, campo: string): string {
  const valor = dados.get(campo)
  return typeof valor === 'string' ? valor.trim() : ''
}

function listaJson(dados: FormData, campo: string): unknown {
  const bruto = texto(dados, campo)
  if (bruto === '') return []
  try {
    return JSON.parse(bruto)
  } catch {
    throw new RegistroRecusadoError(`O campo "${campo}" chegou ilegível.`)
  }
}

/**
 * Monta a entrada a partir do formulário.
 *
 * Cada campo é conferido aqui, e não confiado: o formulário é a única porta de
 * escrita da aplicação, e o que chega dela é texto, não tipo. Uma lista de
 * paradas com um objeto no meio, ou um `tipo` inventado, precisa parar com
 * frase legível em vez de estourar dentro do cálculo.
 */
function lerEntrada(dados: FormData): EntradaDeViagem {
  const tipo = texto(dados, 'tipo')
  const dataIda = texto(dados, 'dataIda')
  const dataVoltaBruta = texto(dados, 'dataVolta')
  const dataVolta = dataVoltaBruta === '' ? null : dataVoltaBruta
  const reservaIdBruto = texto(dados, 'reservaId')
  const reservaId = reservaIdBruto === '' ? undefined : reservaIdBruto

  if (dataIda === '') {
    throw new RegistroRecusadoError('Informe a data de ida.')
  }

  if (tipo === 'aereo') {
    const bruto = listaJson(dados, 'trechos')
    if (!Array.isArray(bruto) || bruto.length === 0) {
      throw new RegistroRecusadoError('Informe pelo menos um trecho.')
    }
    const trechos = bruto.map((t, i) => {
      const item = t as { origem?: unknown; destino?: unknown }
      if (typeof item.origem !== 'string' || typeof item.destino !== 'string') {
        throw new RegistroRecusadoError(`O trecho ${i + 1} está incompleto.`)
      }
      if (item.origem.trim() === '' || item.destino.trim() === '') {
        throw new RegistroRecusadoError(`O trecho ${i + 1} está incompleto.`)
      }
      return { origem: item.origem, destino: item.destino }
    })

    const classe = texto(dados, 'classeCabine')
    if (classe !== 'economica' && classe !== 'executiva' && classe !== 'primeira') {
      throw new RegistroRecusadoError('Classe de cabine não reconhecida.')
    }

    return { tipo: 'aereo', dataIda, dataVolta, classeCabine: classe, trechos, reservaId }
  }

  if (tipo === 'carro') {
    const bruto = listaJson(dados, 'paradas')
    if (!Array.isArray(bruto) || bruto.length < 2) {
      throw new RegistroRecusadoError('Informe pelo menos a origem e o destino.')
    }
    const paradas = bruto.map((p) => {
      if (typeof p !== 'string' || !/^\d{7}$/.test(p)) {
        throw new RegistroRecusadoError('Escolha os municípios na lista.')
      }
      return p
    })

    const propriedade = texto(dados, 'propriedadeVeiculo')
    if (
      propriedade !== 'frota' &&
      propriedade !== 'proprio' &&
      propriedade !== 'locado'
    ) {
      throw new RegistroRecusadoError('Informe de quem é o veículo.')
    }

    const combustivel = texto(dados, 'combustivel')
    if (
      combustivel !== 'gasolina' &&
      combustivel !== 'etanol' &&
      combustivel !== 'diesel' &&
      combustivel !== 'flex'
    ) {
      throw new RegistroRecusadoError('Informe o combustível.')
    }

    const ocupantes = Number(texto(dados, 'ocupantes'))
    if (!Number.isInteger(ocupantes) || ocupantes < 1) {
      throw new RegistroRecusadoError('O número de ocupantes precisa ser um inteiro ≥ 1.')
    }

    return {
      tipo: 'carro',
      dataIda,
      dataVolta,
      paradas,
      propriedadeVeiculo: propriedade,
      combustivel,
      ocupantes,
      reservaId,
    }
  }

  throw new RegistroRecusadoError('Escolha se a viagem foi de avião ou de carro.')
}

export async function registrarViagemAction(
  _anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const ctx = await exigirSessao()

  try {
    const resultado = await registrarViagem(ctx, lerEntrada(dados))
    return {
      situacao: 'gravada',
      reservaId: resultado.reservaId,
      tipo: resultado.tipo,
      distanciaKm: resultado.distanciaKm,
      co2Kg: resultado.co2Kg,
      co2KgVeiculo: resultado.co2KgVeiculo,
      ocupantes: resultado.ocupantes,
      trechos: resultado.trechos.map((t) => ({
        origem: t.origem,
        destino: t.destino,
        distanciaKm: t.distanciaKm,
        co2Kg: t.co2Kg,
      })),
    }
  } catch (erro) {
    // **Erro de preenchimento vira frase; o resto continua subindo.** Quem
    // preencheu tem como corrigir o primeiro e não tem como fazer nada quanto
    // ao segundo — e engolir uma falha de infraestrutura numa mensagem amável
    // faria a viagem parecer recusada por culpa de quem a registrou.
    if (erro instanceof RegistroRecusadoError) {
      return { situacao: 'erro', mensagem: erro.message }
    }
    throw erro
  }
}
