import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Ready-made MCP connection config, per client.
 *
 * Written after integration feedback from a partner agent: connecting was
 * possible but manual, and the instructions this replaces could not work at
 * all — they configured a `curl` command as a stdio server with a
 * `{{mcp_payload}}` placeholder that no client substitutes. Birtingur's MCP
 * server is remote streamable-HTTP with a static `ak_` bearer, so every
 * client needs the same two facts (URL + Authorization header) in its own
 * syntax. Keeping them in one component means the endpoint is written down
 * once.
 */

export const MCP_ENDPOINT = 'https://mcp.birtingur.app/mcp';

const KEY_PLACEHOLDER = 'ak_LYKILLINN_ÞINN';

type ClientId = 'claude-code' | 'claude' | 'cursor' | 'annad';

const CLIENTS: { id: ClientId; label: string }[] = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'claude', label: 'Claude (vefur / Desktop)' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'annad', label: 'Annað (Lovable o.fl.)' },
];

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-1.5">
      {label && (
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
          {label}
        </span>
      )}
      <div className="flex gap-2 items-start">
        <pre className="font-mono text-[11px] bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto select-all leading-relaxed font-semibold grow whitespace-pre">
          {code}
        </pre>
        <Button
          type="button"
          variant="secondary"
          aria-label="Afrita"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="px-3 shrink-0"
        >
          {copied ? <Check size={16} className="text-green-600 font-bold" /> : <Copy size={16} />}
        </Button>
      </div>
    </div>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-600 font-semibold leading-relaxed">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono bg-slate-100 px-1 rounded text-slate-800 text-[11px]">
      {children}
    </code>
  );
}

export function McpConnectPanel({ apiKey }: { apiKey?: string | null }) {
  const [active, setActive] = useState<ClientId>('claude-code');
  const key = apiKey || KEY_PLACEHOLDER;

  // Claude Code refuses an entry that has `url` but no `type`, reading it as
  // a stdio server — so the type field is not optional here.
  const claudeCodeJson = `{
  "mcpServers": {
    "birtingur": {
      "type": "http",
      "url": "${MCP_ENDPOINT}",
      "headers": {
        "Authorization": "Bearer ${key}"
      }
    }
  }
}`;

  const cursorJson = `{
  "mcpServers": {
    "birtingur": {
      "url": "${MCP_ENDPOINT}",
      "headers": {
        "Authorization": "Bearer ${key}"
      }
    }
  }
}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {CLIENTS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActive(c.id)}
            aria-pressed={active === c.id}
            className={
              active === c.id
                ? 'text-xs font-bold px-3 py-1.5 rounded-lg bg-primary text-white transition'
                : 'text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition'
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {active === 'claude-code' && (
        <div className="space-y-3">
          <Step>Keyrðu þessa skipun í skipanalínunni. Hún gildir fyrir öll þín verkefni:</Step>
          <CodeBlock
            code={`claude mcp add --transport http birtingur ${MCP_ENDPOINT} \\
  --header "Authorization: Bearer ${key}"`}
          />
          <Step>
            Ef þú vilt frekar stilla þetta fyrir eitt verkefni, settu þetta í <Code>.mcp.json</Code>{' '}
            í rót verkefnisins:
          </Step>
          <CodeBlock code={claudeCodeJson} />
        </div>
      )}

      {active === 'claude' && (
        <div className="space-y-3">
          <Step>
            Farðu í <Code>claude.ai/customize/connectors</Code> og veldu að bæta við eigin tengingu
            (custom connector). Sláðu inn slóðina hér að neðan.
          </Step>
          <CodeBlock label="Slóð" code={MCP_ENDPOINT} />
          <Step>
            Birtingur notar ekki OAuth, heldur fastan lykil. Undir stillingum tengingarinnar er
            reitur fyrir request headers. Settu <Code>Authorization</Code> sem heiti og þetta sem
            gildi:
          </Step>
          <CodeBlock label="Haus (header)" code={`Bearer ${key}`} />
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            Stuðningur við fasta hausa í vefviðmótinu er nýlegur og enn í beta hjá Anthropic. Ef
            tengingin reynir OAuth í staðinn og mistekst, notaðu Claude Code leiðina hér að ofan,
            hún styður hausa að fullu.
          </p>
        </div>
      )}

      {active === 'cursor' && (
        <div className="space-y-3">
          <Step>
            Búðu til skrána <Code>.cursor/mcp.json</Code> í verkefninu þínu (eða{' '}
            <Code>~/.cursor/mcp.json</Code> fyrir allar möppur) með þessu innihaldi:
          </Step>
          <CodeBlock code={cursorJson} />
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            Ekki committa þessa skrá í git með lyklinum í. Cursor styður{' '}
            <Code>{'Bearer ${env:BIRTINGUR_API_KEY}'}</Code> ef þú vilt geyma lykilinn í
            umhverfisbreytu.
          </p>
        </div>
      )}

      {active === 'annad' && (
        <div className="space-y-3">
          <Step>
            Birtingur er venjulegur MCP netþjónn yfir streamable HTTP. Öll tól sem styðja slíka
            tengingu þurfa aðeins þetta tvennt:
          </Step>
          <CodeBlock label="Slóð" code={MCP_ENDPOINT} />
          <CodeBlock label="Haus (header)" code={`Authorization: Bearer ${key}`} />
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            Í Lovable og sambærilegum tólum er lykillinn geymdur sem leyndarmál (secret) og vísað í
            hann úr tengingunni, frekar en að skrifa hann í kóðann.
          </p>
        </div>
      )}

      <div className="space-y-2 pt-4 border-t border-slate-100">
        <h4 className="text-xs font-bold text-slate-700">Prófaðu tenginguna</h4>
        <Step>
          Þessi skipun listar öll tól sem lykillinn þinn hefur aðgang að. Ef lykillinn er rangur eða
          afturkallaður færðu skýra villu með <Code>401</Code>, ekki tóman lista.
        </Step>
        <CodeBlock
          code={`curl -sS -X POST ${MCP_ENDPOINT} \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
        />
        <Step>
          Þegar tengingin virkar skaltu byrja á að biðja tólið um að kalla á <Code>whoami</Code>.
          Það skilar auðkenni vefsins þíns og segir hvert næsta skref er.
        </Step>
      </div>
    </div>
  );
}
