import type { H3Event } from 'h3'
import { agentScope, oauthUrls } from './oauth-config'

export function protectedResourceMetadata(event: H3Event) {
  const { issuer, resource } = oauthUrls(event)
  return { resource, authorization_servers: [issuer], scopes_supported: [agentScope], bearer_methods_supported: ['header'] }
}

export function authorizationServerMetadata(event: H3Event) {
  const { issuer, authorization, token, registration } = oauthUrls(event)
  return {
    issuer,
    authorization_endpoint: authorization,
    token_endpoint: token,
    registration_endpoint: registration,
    scopes_supported: [agentScope],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: true
  }
}
