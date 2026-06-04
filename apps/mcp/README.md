# ADA MCP Server

The publisher integration channel for the Birtingur ad platform: project/site owners
use AI agents to create ad slots and embed them on their site, and to manage policy,
approvals, and stats. Advertiser/buying operations are intentionally **not** exposed
over MCP — those live in the dashboard and REST API.

## Endpoint

`https://mcp.birtingur.app/mcp` (or local `http://localhost:3000/mcp` during development)

All requests should be POST requests using the MCP Streamable HTTP transport.
Authentication: Include an `Authorization: Bearer ak_xxxxx` header (where `ak_xxxxx` is a service-account API key obtained from your dashboard or via `POST /v1/api-keys`).

## Available Tools (publisher)

- `register_publisher` — Skrá útgefanda (Domain, Display Name, Payout Method)
- `list_my_slots` — Listar öll auglýsingapláss útgefanda
- `create_slot` — Búa til nýtt auglýsingapláss (Supports CPM/Time-Slot)
- `update_slot` — Uppfæra stillingar eða stöðu (Active/Paused) pláss
- `get_snippet_code` — Sækja HTML embed kóða fyrir vefsíðu
- `get_stats` — Sækja tölfræði og tekjur útgefanda (Impressions, Clicks, Spend)
- `set_content_policy` — Stilla flokkasíun og samþykktarstefnu (Auto/Manual)
- `list_pending_approvals` — Sækja herferðir sem bíða samþykkis á útgefendaplássum
- `approve_creative` — Samþykkja herferð til birtingar
- `reject_creative` — Hafna herferð með ástæðu

## Client Configuration Examples

### Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ada": {
      "command": "curl",
      "args": [
        "-X",
        "POST",
        "-H",
        "Authorization: Bearer ak_xxxxxxxxxxxxxxxx",
        "-H",
        "Content-Type: application/json",
        "-d",
        "{{mcp_payload}}",
        "https://mcp.birtingur.app/mcp"
      ]
    }
  }
}
```

### Claude Code (CLI)

Add the MCP server to Claude Code automatically using the CLI:

```bash
claude mcp add birtingur curl -X POST -H "Authorization: Bearer ak_xxxxxxxxxxxxxxxx" -H "Content-Type: application/json" -d "{{mcp_payload}}" https://mcp.birtingur.app/mcp
```

Or configure it manually in your `.mcp.json` (in the project root) or `~/.claude.json` (globally):

```json
{
  "mcpServers": {
    "birtingur": {
      "command": "curl",
      "args": [
        "-X",
        "POST",
        "-H",
        "Authorization: Bearer ak_xxxxxxxxxxxxxxxx",
        "-H",
        "Content-Type: application/json",
        "-d",
        "{{mcp_payload}}",
        "https://mcp.birtingur.app/mcp"
      ]
    }
  }
}
```

### Cursor / Windsurf

Use the custom HTTP connector with:

- URL: `https://mcp.birtingur.app/mcp`
- Headers: `Authorization: Bearer ak_xxxxxxxxxxxxxxxx`
