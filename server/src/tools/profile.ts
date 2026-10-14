import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export type ToolProfile = 'read' | 'manage' | 'full';

const PROFILE_RANK: Record<ToolProfile, number> = { read: 0, manage: 1, full: 2 };

export const TOOL_PROFILE: Record<string, ToolProfile> = {
  setup_meta_auth: 'read',
  update_plugin: 'read',
  list_ad_accounts: 'read',
  get_campaigns: 'read',
  get_ad_sets: 'read',
  get_ads: 'read',
  get_insights: 'read',
  get_ad_creatives: 'read',
  get_audiences: 'read',
  get_mutation_history: 'read',
  get_mutation_stats: 'read',

  get_safety_setup: 'manage',
  confirm_safe_word: 'manage',
  confirm_mutation: 'manage',
  confirm_all_mutations: 'manage',
  list_pending_mutations: 'manage',
  prepare_campaign_status: 'manage',
  prepare_campaign_update: 'manage',
  prepare_campaign_removal: 'manage',
  prepare_budget_change: 'manage',
  prepare_ad_set_status: 'manage',
  prepare_ad_set_update: 'manage',
  prepare_ad_set_removal: 'manage',
  prepare_ad_status: 'manage',
  prepare_ad_update: 'manage',
  prepare_ad_removal: 'manage',

  prepare_campaign_create: 'full',
  prepare_ad_set_create: 'full',
  prepare_ad_create: 'full',
  prepare_clone_entity: 'full',
  prepare_ad_creative: 'full',
  prepare_carousel_creative: 'full',
  prepare_video_creative: 'full',
  prepare_lead_creative: 'full',
  prepare_advantage_creative: 'full',
  prepare_image_upload: 'full',
  prepare_video_upload: 'full',
  prepare_lookalike_audience: 'full',
};

export function normalizeProfile(value: string | undefined): ToolProfile {
  const lowered = (value ?? '').trim().toLowerCase();
  return lowered === 'manage' || lowered === 'full' ? lowered : 'read';
}

export function isToolAllowed(name: string, profile: ToolProfile): boolean {
  const required = TOOL_PROFILE[name];
  if (!required) return true;
  return PROFILE_RANK[required] <= PROFILE_RANK[profile];
}

export function profileNotice(profile: ToolProfile): string {
  if (profile === 'read') {
    return 'Profile read: read-only tools, mutations are impossible in this session. To change the account the user must set META_ADS_BABY_PROFILE=manage or full and restart the server.';
  }
  if (profile === 'manage') {
    return 'Profile manage: status, budget and settings edits of existing campaigns, ad sets and ads only. Creating entities, creatives, uploads, copies and audiences needs META_ADS_BABY_PROFILE=full and a restart; do not improvise a workaround.';
  }
  return '';
}

export function withProfile(server: McpServer, profile: ToolProfile): McpServer {
  if (profile === 'full') return server;
  const register = server.tool.bind(server);
  const gated = (...args: unknown[]) => {
    const name = args[0] as string;
    if (!isToolAllowed(name, profile)) return undefined as never;
    return (register as (...a: unknown[]) => never)(...args);
  };
  return new Proxy(server, {
    get(target, property, receiver) {
      if (property === 'tool') return gated;
      return Reflect.get(target, property, receiver);
    },
  }) as McpServer;
}
