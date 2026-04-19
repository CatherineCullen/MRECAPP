import { buildPrompt } from './_lib/buildPrompt'
import QueryRunner from './_components/QueryRunner'

export default function AIQueryPage() {
  // Prompt is generated server-side at request time from the live schema
  // catalog. Updating schemaCatalog.ts → refresh this page → new prompt.
  const prompt = buildPrompt()

  return <QueryRunner prompt={prompt} />
}
