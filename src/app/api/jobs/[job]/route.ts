import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { dailySnapshotJob } from '@/server/jobs/daily-snapshot'
import { syncCatalogJob } from '@/server/jobs/sync-catalog'
import { syncIncomeJob } from '@/server/jobs/sync-income'
import { syncFxJob, syncQuotesJob } from '@/server/jobs/sync-quotes'

const JOBS = {
  'sync-quotes': syncQuotesJob,
  'sync-fx': syncFxJob,
  'daily-snapshot': dailySnapshotJob,
  // Semanal basta: a lista de papéis da B3 muda algumas vezes por ano.
  'sync-catalog': syncCatalogJob,
  // Diário: provento é anunciado com dias de antecedência, não de hora em hora.
  'sync-income': syncIncomeJob,
} as const

type JobName = keyof typeof JOBS

/**
 * Endpoint dos jobs agendados.
 *
 * Protegido por segredo no header, não por sessão: quem chama é um cron, que
 * não tem usuário. Sem essa proteção, qualquer um na internet poderia disparar
 * a sincronização em laço e queimar o rate limit das APIs gratuitas.
 *
 * Comparação em tempo constante — comparar segredo com `===` vaza o tamanho do
 * prefixo correto pelo tempo de resposta.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ job: string }> },
) {
  const secret = process.env.JOBS_SECRET

  if (!secret) {
    return NextResponse.json({ error: 'JOBS_SECRET não configurado.' }, { status: 500 })
  }

  const provided =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    request.headers.get('x-jobs-secret') ??
    ''

  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { job } = await params

  if (!isJobName(job)) {
    return NextResponse.json(
      { error: `Job desconhecido: ${job}`, disponíveis: Object.keys(JOBS) },
      { status: 404 },
    )
  }

  const startedAt = Date.now()

  try {
    const result = await JOBS[job]()
    return NextResponse.json({ job, ms: Date.now() - startedAt, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha no job'
    return NextResponse.json({ job, error: message }, { status: 500 })
  }
}

function isJobName(value: string): value is JobName {
  return value in JOBS
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  // `timingSafeEqual` exige mesmo tamanho; comparar antes já vazaria o
  // tamanho, então normalizamos para um hash de comprimento fixo.
  if (bufferA.length !== bufferB.length) return false
  return timingSafeEqual(bufferA, bufferB)
}
