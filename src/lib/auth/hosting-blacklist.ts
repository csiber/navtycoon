// src/lib/auth/hosting-blacklist.ts
// Real-world hosting/cloud brand names that players MUST NOT use as their
// in-game company name. Reasoning:
//   - the game is satire of the industry; if a player squats "AWS Hosting"
//     and tops the leaderboard with bad ops, screenshots end up on Twitter
//     and that's a bad look for us legally and reputationally
//   - it also protects our own brand family (PromNET, NavBot, Szövegelek)
//     from being impersonated inside Hyperscales
//
// Matching is case-insensitive + ignores common suffixes (LLC, Inc, Co,
// Hosting, Cloud, Tech) so "AWS LLC" and "Cloudflair Hosting" both trip
// the filter. Punctuation and whitespace are normalized away.

const RAW_BLACKLIST: readonly string[] = [
  // Hyperscalers
  'aws', 'amazon web services', 'amazon',
  'azure', 'microsoft azure', 'microsoft',
  'gcp', 'google cloud', 'google',
  'alibaba cloud', 'alibaba', 'aliyun',
  'tencent cloud', 'tencent',
  'oracle cloud', 'oracle',
  'ibm cloud', 'ibm',
  'huawei cloud', 'huawei',
  // CDN / Edge
  'cloudflare', 'cloudflair',
  'fastly', 'akamai', 'bunny', 'bunnycdn', 'bunny net',
  'stackpath', 'keycdn',
  // Mid-tier hosting
  'hetzner', 'ovh', 'ovhcloud',
  'digitalocean', 'linode', 'vultr', 'contabo',
  'scaleway', 'rackspace', 'leaseweb', 'kamatera',
  'upcloud', 'time4vps',
  // PaaS / serverless
  'heroku', 'render', 'fly io', 'flyio',
  'vercel', 'netlify', 'railway', 'koyeb',
  'platform sh', 'platformsh', 'deno deploy',
  // DB / storage
  'supabase', 'planetscale', 'neon', 'cockroachdb',
  'mongodb atlas', 'mongodb', 'redis labs', 'upstash',
  'backblaze', 'wasabi', 'tigris',
  // Shared hosting / domains
  'bluehost', 'godaddy', 'hostgator', 'namecheap',
  'dreamhost', 'siteground', 'inmotion', 'a2 hosting',
  'kinsta', 'wp engine', 'wpengine',
  'hostinger', 'ionos', '1and1', 'one com',
  // Adjacent SaaS
  'mailgun', 'sendgrid', 'postmark', 'twilio',
  'stripe', 'paypal', 'square', 'plaid',
  'github', 'gitlab', 'bitbucket',
  'discord', 'slack',
  // Csiber's own brand family — protect from impersonation
  'promnet', 'hyperscales', 'hyperscaler',
  'navtycoon', 'navbot', 'szovegelek', 'szövegelek',
] as const;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9 ]+/g, ' ')   // punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
    // strip noise-suffixes so "AWS LLC" matches "aws"
    .replace(
      / (llc|ltd|inc|incorporated|gmbh|kft|zrt|bt|sa|nv|bv|ag|sl|srl|co|corp|corporation|company|hosting|cloud|tech|technologies|systems|solutions|services|networks|labs|studio|digital|online|web|works|group|holdings|international|global)$/,
      '',
    );
}

const NORM_BLACKLIST = new Set(RAW_BLACKLIST.map(normalize));

// Substrings that, if present anywhere in the normalized name, still trip
// the filter. Catches "Cloudflair Hosting Hungary" or "MyAWSReseller".
const SUBSTRING_BLACKLIST: readonly string[] = [
  'aws', 'azure', 'cloudflare', 'cloudflair',
  'hetzner', 'ovh', 'digitalocean', 'linode',
  'akamai', 'fastly', 'vercel', 'netlify',
  'godaddy', 'namecheap', 'bluehost', 'wpengine',
  'promnet', 'hyperscales', 'hyperscaler',
  'navtycoon', 'navbot',
];

export interface BlacklistResult {
  blocked: boolean;
  reason?: string;
}

export function checkHostingNameBlacklist(name: string): BlacklistResult {
  const norm = normalize(name);
  if (!norm) return { blocked: false };

  if (NORM_BLACKLIST.has(norm)) {
    return {
      blocked: true,
      reason: 'Ez egy valódi hosting/cloud-cég neve. Találj ki egy sajátot — kreatívabb is.',
    };
  }

  for (const sub of SUBSTRING_BLACKLIST) {
    if (norm.includes(sub)) {
      return {
        blocked: true,
        reason: `A "${sub}" valódi cég neve, nem használhatod a játékban. Találj ki egy sajátot.`,
      };
    }
  }

  return { blocked: false };
}
