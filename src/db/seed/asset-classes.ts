import { eq, isNull } from 'drizzle-orm'
import { ASSET_CLASSES } from '@/config/asset-classes'
import { assetClass } from '@/db/schema'
import type { Database } from '@/db/client'

/**
 * As 12 classes de sistema — `tenant_id` nulo, visíveis a todos.
 *
 * A definição vive em `config/asset-classes.ts` e é copiada para o banco, não
 * o contrário. Assim o TypeScript continua sendo a fonte para o formulário
 * dinâmico e para os rótulos, e o banco tem a cópia que as FKs precisam.
 *
 * Idempotente: reexecutar atualiza em vez de duplicar.
 */
export async function seedAssetClasses(db: Database): Promise<Map<string, string>> {
  const existing = await db
    .select({ id: assetClass.id, slug: assetClass.slug })
    .from(assetClass)
    .where(isNull(assetClass.tenantId))

  const bySlug = new Map(existing.map((row) => [row.slug, row.id]))

  for (const definition of ASSET_CLASSES) {
    const values = {
      tenantId: null,
      slug: definition.slug,
      name: definition.name,
      valuationMode: definition.valuationMode,
      supportsDividends: definition.supportsDividends,
      walletTerm: definition.walletTerm,
      assetTerm: definition.assetTerm,
      fieldSchema: { fields: definition.fields },
      icon: definition.icon,
      colorVar: definition.colorVar,
      sortOrder: definition.sortOrder,
    }

    const currentId = bySlug.get(definition.slug)

    if (currentId) {
      await db.update(assetClass).set(values).where(eq(assetClass.id, currentId))
    } else {
      const [inserted] = await db.insert(assetClass).values(values).returning({ id: assetClass.id })
      if (inserted) bySlug.set(definition.slug, inserted.id)
    }
  }

  return bySlug
}
