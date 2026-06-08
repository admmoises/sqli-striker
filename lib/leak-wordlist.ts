/**
 * Leak Scanner — wordlist of sensitive files commonly exposed on web servers.
 *
 * Organized by category for easy maintenance. Each entry has:
 * - path: URL path to probe
 * - category: grouping for the UI
 * - severity: "critical" | "high" | "medium" | "info"
 * - description: what finding this file means
 * - matchPatterns: regex patterns to detect in response body for extra confidence
 */

export interface LeakWordlistEntry {
  path: string;
  category: string;
  severity: "critical" | "high" | "medium" | "info";
  description: string;
  /** If set, the body must match at least one of these to count as found */
  matchPatterns?: string[];
  /** Expected status codes (besides 200). Default: [200] */
  statusCodes?: number[];
}

export const LEAK_WORDLIST: LeakWordlistEntry[] = [
  // ── CREDENTIALS & SECRETS ──────────────────────────────────────────
  {
    path: "/.env",
    category: "Secrets",
    severity: "critical",
    description: "Environment file — may contain DB passwords, API keys, JWT secrets",
    matchPatterns: ["=", "DB_", "SECRET", "API_KEY", "PASSWORD"],
  },
  {
    path: "/.env.backup",
    category: "Secrets",
    severity: "critical",
    description: "Backup environment file",
    matchPatterns: ["="],
  },
  {
    path: "/.env.bak",
    category: "Secrets",
    severity: "critical",
    description: "Backup environment file",
    matchPatterns: ["="],
  },
  {
    path: "/.env.dev",
    category: "Secrets",
    severity: "critical",
    description: "Development environment — may have debug credentials",
  },
  {
    path: "/.env.local",
    category: "Secrets",
    severity: "critical",
    description: "Local overrides — often contains real credentials",
  },
  {
    path: "/.env.production",
    category: "Secrets",
    severity: "critical",
    description: "Production environment — live credentials",
    matchPatterns: ["="],
  },
  {
    path: "/.env.example",
    category: "Secrets",
    severity: "medium",
    description: "Example env — reveals expected config structure",
  },
  {
    path: "/.aws/credentials",
    category: "Secrets",
    severity: "critical",
    description: "AWS credentials — access key + secret key",
    matchPatterns: ["aws_access_key_id", "aws_secret_access_key"],
  },
  {
    path: "/.aws/config",
    category: "Secrets",
    severity: "medium",
    description: "AWS config — region, output format",
  },

  // ── VERSION CONTROL ────────────────────────────────────────────────
  {
    path: "/.git/config",
    category: "VCS",
    severity: "high",
    description: "Git config — reveals repository URL, possible credentials in remote",
    matchPatterns: ["[core]", "[remote"],
  },
  {
    path: "/.git/HEAD",
    category: "VCS",
    severity: "high",
    description: "Git HEAD exposed — confirms .git directory is accessible",
    matchPatterns: ["ref:"],
  },
  {
    path: "/.git/index",
    category: "VCS",
    severity: "high",
    description: "Git index exposed — directory listing leak",
  },
  {
    path: "/.git/logs/HEAD",
    category: "VCS",
    severity: "medium",
    description: "Git log — commit history exposed",
  },
  {
    path: "/.svn/entries",
    category: "VCS",
    severity: "high",
    description: "SVN entries — source code structure leak",
  },
  {
    path: "/.svn/wc.db",
    category: "VCS",
    severity: "high",
    description: "SVN database — full repository metadata",
  },
  {
    path: "/.hg/store",
    category: "VCS",
    severity: "high",
    description: "Mercurial store exposed",
  },

  // ── CONFIG FILES ───────────────────────────────────────────────────
  {
    path: "/wp-config.php",
    category: "Config",
    severity: "critical",
    description: "WordPress config — DB credentials, salts, table prefix",
    matchPatterns: ["DB_NAME", "DB_USER", "DB_PASSWORD"],
  },
  {
    path: "/wp-config.php.bak",
    category: "Config",
    severity: "critical",
    description: "WordPress config backup",
    matchPatterns: ["DB_NAME"],
  },
  {
    path: "/wp-config.php.old",
    category: "Config",
    severity: "critical",
    description: "WordPress old config",
  },
  {
    path: "/wp-config.php~",
    category: "Config",
    severity: "critical",
    description: "WordPress editor backup",
  },
  {
    path: "/wp-config.txt",
    category: "Config",
    severity: "critical",
    description: "WordPress config as text",
  },
  {
    path: "/config.json",
    category: "Config",
    severity: "high",
    description: "JSON config — may contain credentials, connection strings",
    matchPatterns: ["{", "password", "secret"],
  },
  {
    path: "/config.yml",
    category: "Config",
    severity: "high",
    description: "YAML config — may contain credentials",
  },
  {
    path: "/config.yaml",
    category: "Config",
    severity: "high",
    description: "YAML config",
  },
  {
    path: "/config.js",
    category: "Config",
    severity: "high",
    description: "JS config — often has API endpoints and keys",
  },
  {
    path: "/settings.py",
    category: "Config",
    severity: "high",
    description: "Django/Flask settings — SECRET_KEY, DB config",
    matchPatterns: ["SECRET_KEY", "DATABASES"],
  },
  {
    path: "/application.properties",
    category: "Config",
    severity: "high",
    description: "Spring Boot config — DB URLs, credentials",
    matchPatterns: ["spring.datasource", "password"],
  },
  {
    path: "/appsettings.json",
    category: "Config",
    severity: "high",
    description: ".NET config — connection strings",
    matchPatterns: ["ConnectionStrings"],
  },
  {
    path: "/web.config",
    category: "Config",
    severity: "high",
    description: "IIS config — connection strings, auth settings",
    matchPatterns: ["connectionString"],
  },
  {
    path: "/.htaccess",
    category: "Config",
    severity: "medium",
    description: "Apache access rules — reveals directory structure",
  },
  {
    path: "/.htpasswd",
    category: "Config",
    severity: "critical",
    description: "Apache password file — may have cracked hashes",
  },

  // ── DATABASE DUMPS ─────────────────────────────────────────────────
  {
    path: "/backup.sql",
    category: "Database",
    severity: "critical",
    description: "SQL dump — full database contents exposed",
    matchPatterns: ["CREATE TABLE", "INSERT INTO"],
  },
  {
    path: "/dump.sql",
    category: "Database",
    severity: "critical",
    description: "SQL dump",
    matchPatterns: ["CREATE TABLE"],
  },
  {
    path: "/db.sql",
    category: "Database",
    severity: "critical",
    description: "Database dump",
  },
  {
    path: "/database.sql",
    category: "Database",
    severity: "critical",
    description: "Database dump",
  },
  {
    path: "/db_backup.sql",
    category: "Database",
    severity: "critical",
    description: "Database backup",
  },
  {
    path: "/export.sql",
    category: "Database",
    severity: "critical",
    description: "SQL export",
  },
  {
    path: "/admin/backup.sql",
    category: "Database",
    severity: "critical",
    description: "Admin backup SQL",
  },

  // ── DEBUG & INFO ───────────────────────────────────────────────────
  {
    path: "/phpinfo.php",
    category: "Debug",
    severity: "high",
    description: "PHP info — full server config, paths, loaded modules, env vars",
    matchPatterns: ["PHP Version", "phpinfo"],
  },
  {
    path: "/info.php",
    category: "Debug",
    severity: "high",
    description: "PHP info",
  },
  {
    path: "/php_info.php",
    category: "Debug",
    severity: "high",
    description: "PHP info",
  },
  {
    path: "/server-status",
    category: "Debug",
    severity: "medium",
    description: "Apache status — active requests, server load",
    matchPatterns: ["Server Version", "Apache"],
  },
  {
    path: "/server-info",
    category: "Debug",
    severity: "medium",
    description: "Apache info — module list, config",
  },
  {
    path: "/actuator/health",
    category: "Debug",
    severity: "medium",
    description: "Spring Actuator — health endpoint",
    matchPatterns: ['"status"'],
  },
  {
    path: "/actuator/env",
    category: "Debug",
    severity: "critical",
    description: "Spring Actuator — environment properties (credentials exposed)",
    matchPatterns: ['"propertySources"'],
  },
  {
    path: "/actuator/mappings",
    category: "Debug",
    severity: "medium",
    description: "Spring Actuator — all endpoints mapped",
  },
  {
    path: "/debug/default/view",
    category: "Debug",
    severity: "high",
    description: "Yii debug toolbar",
  },
  {
    path: "/_profiler",
    category: "Debug",
    severity: "high",
    description: "Symfony profiler",
  },

  // ── LOGS ───────────────────────────────────────────────────────────
  {
    path: "/logs/error.log",
    category: "Logs",
    severity: "high",
    description: "Error log — stack traces, file paths, SQL errors",
  },
  {
    path: "/logs/debug.log",
    category: "Logs",
    severity: "high",
    description: "Debug log — verbose application output",
  },
  {
    path: "/logs/access.log",
    category: "Logs",
    severity: "medium",
    description: "Access log — IPs, user agents, request paths",
  },
  {
    path: "/error.log",
    category: "Logs",
    severity: "high",
    description: "Error log in web root",
  },
  {
    path: "/debug.log",
    category: "Logs",
    severity: "high",
    description: "Debug log in web root",
  },
  {
    path: "/app.log",
    category: "Logs",
    severity: "medium",
    description: "Application log",
  },
  {
    path: "/storage/logs/laravel.log",
    category: "Logs",
    severity: "critical",
    description: "Laravel log — may contain stack traces with env vars",
    matchPatterns: ["laravel", "stack trace"],
  },

  // ── PACKAGE FILES ──────────────────────────────────────────────────
  {
    path: "/package.json",
    category: "Dependencies",
    severity: "medium",
    description: "Node.js dependencies — reveals tech stack, possible CVE targets",
  },
  {
    path: "/package-lock.json",
    category: "Dependencies",
    severity: "medium",
    description: "Node.js lockfile — exact dependency versions",
  },
  {
    path: "/composer.json",
    category: "Dependencies",
    severity: "medium",
    description: "PHP dependencies — reveals framework and libraries",
  },
  {
    path: "/composer.lock",
    category: "Dependencies",
    severity: "medium",
    description: "PHP exact dependency versions",
  },
  {
    path: "/Gemfile",
    category: "Dependencies",
    severity: "medium",
    description: "Ruby dependencies",
  },
  {
    path: "/Gemfile.lock",
    category: "Dependencies",
    severity: "medium",
    description: "Ruby lockfile",
  },
  {
    path: "/requirements.txt",
    category: "Dependencies",
    severity: "medium",
    description: "Python requirements — reveals packages and versions",
  },
  {
    path: "/Pipfile",
    category: "Dependencies",
    severity: "medium",
    description: "Python Pipenv dependencies",
  },
  {
    path: "/yarn.lock",
    category: "Dependencies",
    severity: "medium",
    description: "Yarn lockfile",
  },
  {
    path: "/Cargo.toml",
    category: "Dependencies",
    severity: "medium",
    description: "Rust dependencies",
  },

  // ── DOCKER / CONTAINER ─────────────────────────────────────────────
  {
    path: "/Dockerfile",
    category: "Docker",
    severity: "medium",
    description: "Docker build instructions — base image, exposed ports, volumes",
  },
  {
    path: "/docker-compose.yml",
    category: "Docker",
    severity: "high",
    description: "Docker Compose — service definitions, env vars, volumes",
    matchPatterns: ["services:", "environment:"],
  },
  {
    path: "/docker-compose.yaml",
    category: "Docker",
    severity: "high",
    description: "Docker Compose",
  },
  {
    path: "/.dockerignore",
    category: "Docker",
    severity: "medium",
    description: "Docker ignore rules",
  },
  {
    path: "/.docker/config.json",
    category: "Docker",
    severity: "high",
    description: "Docker config — may contain registry credentials",
  },

  // ── CI / CD ────────────────────────────────────────────────────────
  {
    path: "/.github/workflows",
    category: "CI/CD",
    severity: "medium",
    description: "GitHub Actions workflows",
    statusCodes: [200, 301, 302],
  },
  {
    path: "/.gitlab-ci.yml",
    category: "CI/CD",
    severity: "high",
    description: "GitLab CI config — may have secrets in variables",
  },
  {
    path: "/.travis.yml",
    category: "CI/CD",
    severity: "medium",
    description: "Travis CI config — may have encrypted secrets",
  },
  {
    path: "/Jenkinsfile",
    category: "CI/CD",
    severity: "medium",
    description: "Jenkins pipeline — build and deploy steps",
  },

  // ── DISCOVERY ──────────────────────────────────────────────────────
  {
    path: "/robots.txt",
    category: "Discovery",
    severity: "info",
    description: "Robots exclusion — reveals hidden paths admin wants to hide",
  },
  {
    path: "/sitemap.xml",
    category: "Discovery",
    severity: "info",
    description: "XML sitemap — full URL list",
    matchPatterns: ["<url>", "<loc>"],
  },
  {
    path: "/sitemap.xml.gz",
    category: "Discovery",
    severity: "info",
    description: "Compressed sitemap",
  },
  {
    path: "/.DS_Store",
    category: "Discovery",
    severity: "medium",
    description: "macOS directory metadata — reveals folder structure",
  },
  {
    path: "/crossdomain.xml",
    category: "Discovery",
    severity: "info",
    description: "Flash cross-domain policy — reveals trusted domains",
  },
  {
    path: "/clientaccesspolicy.xml",
    category: "Discovery",
    severity: "info",
    description: "Silverlight policy",
  },

  // ── BACKUP FILES ───────────────────────────────────────────────────
  {
    path: "/backup.zip",
    category: "Backups",
    severity: "critical",
    description: "Site backup archive — full source code + config",
    statusCodes: [200, 206],
  },
  {
    path: "/backup.tar.gz",
    category: "Backups",
    severity: "critical",
    description: "Site backup archive",
  },
  {
    path: "/site.tar.gz",
    category: "Backups",
    severity: "critical",
    description: "Site archive",
  },
  {
    path: "/www.tar.gz",
    category: "Backups",
    severity: "critical",
    description: "WWW root archive",
  },
  {
    path: "/backup.rar",
    category: "Backups",
    severity: "critical",
    description: "Site backup archive",
  },

  // ── ADMIN PANELS ──────────────────────────────────────────────────
  {
    path: "/admin/",
    category: "Admin",
    severity: "medium",
    description: "Admin panel — may be accessible",
    statusCodes: [200, 301, 302, 401, 403],
  },
  {
    path: "/administrator/",
    category: "Admin",
    severity: "medium",
    description: "Joomla admin",
    statusCodes: [200, 301, 302, 401],
  },
  {
    path: "/wp-admin/",
    category: "Admin",
    severity: "medium",
    description: "WordPress admin",
    statusCodes: [200, 301, 302],
  },
  {
    path: "/phpmyadmin/",
    category: "Admin",
    severity: "critical",
    description: "phpMyAdmin — database management exposed",
    statusCodes: [200, 301, 302, 401],
  },
  {
    path: "/phppgadmin/",
    category: "Admin",
    severity: "critical",
    description: "phpPgAdmin — PostgreSQL management",
    statusCodes: [200, 301, 302],
  },
  {
    path: "/adminer.php",
    category: "Admin",
    severity: "critical",
    description: "Adminer — single-file DB manager",
  },
  {
    path: "/grafana/",
    category: "Admin",
    severity: "high",
    description: "Grafana dashboard",
    statusCodes: [200, 301, 302],
  },
  {
    path: "/kibana/",
    category: "Admin",
    severity: "high",
    description: "Kibana — Elasticsearch dashboard",
    statusCodes: [200, 301, 302],
  },
  {
    path: "/jenkins/",
    category: "Admin",
    severity: "critical",
    description: "Jenkins CI — may allow anonymous access",
    statusCodes: [200, 301, 302, 403],
  },
  {
    path: "/swagger/",
    category: "Admin",
    severity: "medium",
    description: "Swagger UI — API documentation exposed",
    statusCodes: [200, 301, 302],
  },
  {
    path: "/api-docs/",
    category: "Admin",
    severity: "medium",
    description: "API documentation",
    statusCodes: [200, 301, 302],
  },
];
