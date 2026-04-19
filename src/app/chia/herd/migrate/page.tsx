import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import MigrateTool from './_components/MigrateTool'
import { buildMigrationMappingPrompt } from './_lib/prompt'

/**
 * Bulk migrate horses + people.
 *
 * Throw-away admin tool for the one-time go-live import (~26 horses,
 * ~26 owners) and the subsequent ~200 lesson-rider import. Expects
 * pre-cleaned JSON matching CHIA's schema — dedup / cleanup happens
 * outside the tool. See `_lib/schema.ts` for the input shape.
 */
export default async function MigratePage() {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/chia')

  const prompt = buildMigrationMappingPrompt()
  return <MigrateTool prompt={prompt} />
}
