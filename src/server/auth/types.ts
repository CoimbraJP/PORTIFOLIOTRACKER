/**
 * Tipos de sessão, isolados de propósito.
 *
 * `session.ts` importa `server-only`, o que faria o build falhar se um
 * componente de cliente o tocasse — mesmo só para pegar um tipo. Estes tipos
 * atravessam a fronteira servidor→cliente como props, então moram num módulo
 * sem efeito colateral.
 */
export interface SessionUser {
  id: string
  email: string | null
  name: string | null
  avatarUrl: string | null
}

export interface TenantContext {
  user: SessionUser
  tenantId: string
  tenantName: string
  baseCurrency: string
}
