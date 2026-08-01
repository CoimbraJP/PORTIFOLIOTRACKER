import { connect } from 'node:net'

/**
 * Mede a latência de rede até os poolers do Supabase em cada região.
 *
 * Usa o tempo de handshake TCP, que é praticamente um RTT. Não precisa de
 * projeto na região nem de credencial — o host responde a qualquer conexão.
 *
 * Rode da MÁQUINA que vai executar a aplicação. Em desenvolvimento, essa
 * máquina é a sua; em produção, é a região da Vercel.
 *
 *   node scripts/medir-latencia.mjs
 */
const REGIOES = [
  { nome: 'São Paulo      ', host: 'aws-0-sa-east-1.pooler.supabase.com' },
  { nome: 'Virgínia (EUA) ', host: 'aws-0-us-east-1.pooler.supabase.com' },
  { nome: 'Oregon (EUA)   ', host: 'aws-0-us-west-1.pooler.supabase.com' },
]

const PORTA = 5432
const AMOSTRAS = 5

function medirUmaVez(host) {
  return new Promise((resolve) => {
    const inicio = process.hrtime.bigint()
    const socket = connect({ host, port: PORTA })

    const encerrar = (valor) => {
      socket.destroy()
      resolve(valor)
    }

    socket.setTimeout(5000)
    socket.on('connect', () => encerrar(Number(process.hrtime.bigint() - inicio) / 1e6))
    socket.on('timeout', () => encerrar(null))
    socket.on('error', () => encerrar(null))
  })
}

async function medir(host) {
  const amostras = []
  for (let i = 0; i < AMOSTRAS; i++) {
    const valor = await medirUmaVez(host)
    if (valor !== null) amostras.push(valor)
  }
  if (amostras.length === 0) return null

  amostras.sort((a, b) => a - b)
  // Mediana: imune ao pico ocasional de uma amostra ruim.
  return amostras[Math.floor(amostras.length / 2)]
}

console.log(`\nLatência até o pooler do Supabase (mediana de ${AMOSTRAS} conexões)\n`)

const resultados = []

for (const regiao of REGIOES) {
  const ms = await medir(regiao.host)
  resultados.push({ ...regiao, ms })
  console.log(`  ${regiao.nome} ${ms === null ? 'inacessível' : `${ms.toFixed(0).padStart(4)} ms`}`)
}

const validos = resultados.filter((r) => r.ms !== null).sort((a, b) => a.ms - b.ms)

if (validos.length >= 2) {
  const [melhor, ...resto] = validos
  const pior = resto[resto.length - 1]
  console.log(`\n  Mais próxima: ${melhor.nome.trim()}`)
  console.log(
    `  Diferença para a mais distante: ${(pior.ms - melhor.ms).toFixed(0)} ms POR QUERY.`,
  )
  console.log(
    `  Uma tela que faz 5 consultas sequenciais paga ${((pior.ms - melhor.ms) * 5).toFixed(0)} ms a mais.\n`,
  )
}
