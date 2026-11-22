# ShrekBook MCP integration

ShrekBook exposes a stateless Model Context Protocol (MCP) endpoint at:

`https://shrekbook.bbroot.com/mcp`

## Required hosting environment variables

Set these in the Deplexo environment settings (never commit their values):

- `SHREKBOOK_MCP_TOKEN`: a long, random bearer token used to authenticate MCP requests.
- `OWNER_ID`: the UUID of the ShrekBook owner account. MCP write actions publish as this account.

The endpoint remains unavailable until `SHREKBOOK_MCP_TOKEN` and `OWNER_ID` are configured. Keep the token private. Rotate it immediately if it is exposed.

## Available tools

- `get_my_profile`: reads the configured owner's public profile fields.
- `get_recent_posts`: reads up to 20 recent posts and author display names.
- `create_post`: publishes a text post as the configured owner. It uses the same posts table and shared new-post email notification fanout as the website's publishing route. Only users who opted into new-post emails are queued.

The server never accepts a caller-supplied author ID. Every write is bound to `OWNER_ID`.

## Authentication and transport

Send MCP requests to `POST /mcp` with:

`Authorization: Bearer <SHREKBOOK_MCP_TOKEN>`

The endpoint uses stateless Streamable HTTP-style JSON-RPC responses and does not create MCP sessions. GET and DELETE are not supported.

## Connecting a client

Use the endpoint URL above and configure bearer-token authentication with the same secret stored as `SHREKBOOK_MCP_TOKEN`. A client that requires OAuth instead of a static bearer token will need an OAuth authorization flow added before it can connect.

Custom write-enabled MCP connections are not available on ChatGPT Free. The server can be used by compatible MCP clients, and can be connected to a supported ChatGPT plan that permits write-enabled custom MCP apps.
