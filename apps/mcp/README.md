# ADA MCP Server

Exposes the ADA display ad platform operations as MCP tools for AI agents.

## Endpoint

`https://mcp.adplatform.is/mcp` (or local `http://localhost:3000/mcp` during development)

All requests should be POST requests using the MCP Streamable HTTP transport.
Authentication: Include an `Authorization: Bearer ak_xxxxx` header (where `ak_xxxxx` is a service-account API key obtained from your dashboard or via `POST /v1/api-keys`).

## Available Tools

### Publisher Tools
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

### Advertiser Tools
- `register_advertiser` — Skrá auglýsanda (Company Name, Kennitala, VAT)
- `get_wallet_balance` — Sækja núverandi stöðu prepaid-veskis
- `create_topup_link` — Búa til Teya checkout greiðsluhlekk
- `upload_creative` — Hlaða inn auglýsingu og skanna
- `search_slots` — Leita að tiltækum auglýsingaplássum (Size, Max CPM)
- `create_campaign` — Stofna nýja herferð (Creative, Slots, Schedule, Budget)
- `pause_campaign` — Stöðva birtingar herferðar tímabundið
- `get_campaign_stats` — Sækja frammistöðutölur herferðar (Impressions, Clicks, Spend per publisher)
- `list_my_campaigns` — Sækja allar eigin herferðir

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
        "https://mcp.adplatform.is/mcp"
      ]
    }
  }
}
```

### Cursor / Windsurf
Use the custom HTTP connector with:
- URL: `https://mcp.adplatform.is/mcp`
- Headers: `Authorization: Bearer ak_xxxxxxxxxxxxxxxx`
