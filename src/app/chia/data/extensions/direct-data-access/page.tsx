import Link from 'next/link'

/**
 * Direct data access guide — the escape hatch for AI Query.
 *
 * Deliberately non-technical in tone. The admin reading this is, by definition,
 * someone whose question fell outside the whitelisted JSON spec. They don't
 * need to become a developer — they need a clear, reassuring path to get at
 * their own data with Claude as the interpreter.
 *
 * Nothing sensitive is embedded on this page. Credentials live in Supabase;
 * we only point the admin where to find them.
 */

export default function DirectDataAccessPage() {
  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <Link
          href="/chia/data/extensions"
          className="text-xs text-[#444650] hover:text-[#002058] hover:underline"
        >
          ← Extensions Library
        </Link>
        <h2 className="text-lg font-bold text-[#191c1e] mt-1">Direct data access</h2>
        <p className="text-xs text-[#444650] mt-1">
          When the in-app AI Query tool can’t answer your question, use this path. The barn
          owns the database. The keys are yours. You don’t need a developer on retainer — you
          need Claude and about ten minutes.
        </p>
      </div>

      <Section title="When to use this">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>AI Query returned a validator error you couldn’t work around.</li>
          <li>
            The AI you were talking to told you the question was outside the in-app tool’s
            scope (it was probably right — the in-app tool is deliberately limited to protect
            the data).
          </li>
          <li>You need to run something across many tables the whitelist doesn’t cover.</li>
          <li>You want a one-off export that’s more than a simple CSV.</li>
          <li>You’re making a strategic decision and want to sit with the data.</li>
        </ul>
      </Section>

      <Section title="What you'll need">
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <strong>A Claude account</strong> — the paid tier is worth it for this; longer
            conversations and attachments help.
          </li>
          <li>
            <strong>The Supabase project dashboard.</strong> Log in at{' '}
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#056380] font-semibold hover:underline"
            >
              supabase.com/dashboard
            </a>{' '}
            with the barn’s account. You’ll find the project URL and the API keys under
            Project Settings → API.
          </li>
          <li>
            <strong>A read-only query path.</strong> Two options — pick whichever you’re more
            comfortable with:
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>
                <em>SQL Editor in the Supabase dashboard</em> — easier. Paste the SQL Claude
                writes, run it, copy the results.
              </li>
              <li>
                <em>Give Claude a service key</em> and let it call Supabase’s REST API
                directly. Faster for iterative questions but requires trusting the key with
                the conversation. If you do this, rotate the key afterward from the same API
                page.
              </li>
            </ul>
          </li>
          <li>
            <strong>The schema.</strong> Paste the table names and columns so Claude knows
            what it’s working with. Ask in the Supabase SQL editor:
            <pre className="mt-1 px-3 py-2 bg-[#f2f4f7] rounded text-[11px] font-mono text-[#191c1e] overflow-x-auto">
{`SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;`}
            </pre>
            Copy the results into Claude at the start of the conversation.
          </li>
        </ol>
      </Section>

      <Section title="How to talk to Claude about it">
        <p className="mb-2">Open a new Claude conversation and start with something like:</p>
        <div className="bg-[#f7f9fc] border border-[#c4c6d1]/50 rounded-lg p-4 text-xs text-[#191c1e] leading-relaxed italic">
          Hi Claude — I’m the admin for a horse barn. We run on Supabase (Postgres). I need
          help running a query against our own database. I’ll paste the schema below, and then
          I’ll tell you what I’m trying to figure out. Please write the SQL for me. I’ll run it
          in the Supabase SQL editor myself and paste results back if you need them.
          <br /><br />
          [paste schema here]
          <br /><br />
          My question: [plain English question]
        </div>
        <p className="mt-3 text-[11px] text-[#444650]">
          Claude will write the SQL. You run it in the Supabase SQL editor. If results look
          wrong, paste them back — Claude will refine the query. Iterate until you have what
          you need.
        </p>
      </Section>

      <Section title="Safety">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Keep it read-only.</strong> Every SQL statement Claude writes for you
            should start with <code className="font-mono bg-[#f2f4f7] px-1 rounded">SELECT</code>.
            If you see <code className="font-mono bg-[#f2f4f7] px-1 rounded">UPDATE</code>,{' '}
            <code className="font-mono bg-[#f2f4f7] px-1 rounded">DELETE</code>,{' '}
            <code className="font-mono bg-[#f2f4f7] px-1 rounded">INSERT</code>, or{' '}
            <code className="font-mono bg-[#f2f4f7] px-1 rounded">DROP</code>, stop and ask
            Claude to rewrite it as a SELECT. Writes to the database should happen through the
            app, not through direct queries.
          </li>
          <li>
            <strong>If you shared a service key</strong> with the conversation, rotate it in
            the Supabase dashboard (Project Settings → API → Reset service role key) once
            you’re done. The app uses its own copy from server environment variables, so
            rotating the key does not affect the app — but your old conversation becomes
            inert.
          </li>
          <li>
            <strong>Saved Queries is still the right long-term home.</strong> If you find
            yourself asking the same question twice, bring it back to AI Query once it ships
            and save it — no round-trip needed next time.
          </li>
        </ul>
      </Section>

      <Section title="Why this path exists">
        <p>
          CHIA is deliberately the front door to the barn’s data, not a wall around it. The
          in-app AI Query tool covers common questions safely. Direct data access is the
          answer for everything else — so no one is ever stuck waiting on a developer to ask
          a question about their own business.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="text-xs text-[#191c1e] leading-relaxed">
        {children}
      </div>
    </section>
  )
}
